import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '../db/supabase-client';

// Phase 1c — persistence for the `skill_executions` table (migration 004).
//
// Our application-level execution index: one row per triggered skill run, pinned to the
// `compilation_id` it started on (so a rollback never disturbs in-flight runs) and carrying the
// latest `state` + merged `context`. This is deliberately SEPARATE from langgraph's own
// `checkpoints*` tables (owned by PostgresSaver) — checkpoints are the runtime's resume state;
// this is our queryable record of what ran. SkillExecutorService depends only on this interface,
// so the bridge is unit-tested with InMemoryExecutionStore and wired to Postgres in production.

export interface ExecutionRecord {
  id: string;
  tenant_id: string;
  compilation_id: string | null;
  state: string;
  context: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface NewExecution {
  compilationId: string | null;
  state: string;
  context: Record<string, unknown>;
}

export interface ExecutionPatch {
  state?: string;
  context?: Record<string, unknown>;
  finishedAt?: string | null;
}

export interface ExecutionStore {
  insert(tenantId: string, input: NewExecution): Promise<ExecutionRecord>;
  findById(tenantId: string, id: string): Promise<ExecutionRecord | null>;
  list(tenantId: string): Promise<ExecutionRecord[]>;
  update(tenantId: string, id: string, patch: ExecutionPatch): Promise<ExecutionRecord | null>;
}

/** Postgres-backed store over `skill_executions` (004_skills.sql). */
export class PostgresExecutionStore implements ExecutionStore {
  constructor(private readonly client: SupabaseClient) {}

  async insert(tenantId: string, input: NewExecution): Promise<ExecutionRecord> {
    const rows = await this.client.query<ExecutionRecord>(
      `INSERT INTO skill_executions (tenant_id, compilation_id, state, context)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, input.compilationId, input.state, JSON.stringify(input.context)],
    );
    return rows[0]!;
  }

  async findById(tenantId: string, id: string): Promise<ExecutionRecord | null> {
    const rows = await this.client.query<ExecutionRecord>(
      `SELECT * FROM skill_executions WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ?? null;
  }

  async list(tenantId: string): Promise<ExecutionRecord[]> {
    return this.client.query<ExecutionRecord>(
      `SELECT * FROM skill_executions WHERE tenant_id = $1 ORDER BY started_at DESC`,
      [tenantId],
    );
  }

  async update(
    tenantId: string,
    id: string,
    patch: ExecutionPatch,
  ): Promise<ExecutionRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, tenantId];
    if (patch.state !== undefined) {
      params.push(patch.state);
      sets.push(`state = $${params.length}`);
    }
    if (patch.context !== undefined) {
      params.push(JSON.stringify(patch.context));
      sets.push(`context = $${params.length}`);
    }
    if (patch.finishedAt !== undefined) {
      params.push(patch.finishedAt);
      sets.push(`finished_at = $${params.length}`);
    }
    if (sets.length === 0) return this.findById(tenantId, id);

    const rows = await this.client.query<ExecutionRecord>(
      `UPDATE skill_executions SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }
}

/** Process-local store — the test/dev fallback when no DB is configured. */
export class InMemoryExecutionStore implements ExecutionStore {
  private readonly rows = new Map<string, ExecutionRecord>();

  async insert(tenantId: string, input: NewExecution): Promise<ExecutionRecord> {
    const record: ExecutionRecord = {
      id: randomUUID(),
      tenant_id: tenantId,
      compilation_id: input.compilationId,
      state: input.state,
      context: input.context,
      started_at: new Date().toISOString(),
      finished_at: null,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async findById(tenantId: string, id: string): Promise<ExecutionRecord | null> {
    const r = this.rows.get(id);
    return r && r.tenant_id === tenantId ? r : null;
  }

  async list(tenantId: string): Promise<ExecutionRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.tenant_id === tenantId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  async update(
    tenantId: string,
    id: string,
    patch: ExecutionPatch,
  ): Promise<ExecutionRecord | null> {
    const existing = await this.findById(tenantId, id);
    if (!existing) return null;
    const updated: ExecutionRecord = {
      ...existing,
      ...(patch.state !== undefined && { state: patch.state }),
      ...(patch.context !== undefined && { context: patch.context }),
      ...(patch.finishedAt !== undefined && { finished_at: patch.finishedAt }),
    };
    this.rows.set(id, updated);
    return updated;
  }
}

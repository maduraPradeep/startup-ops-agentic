import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '../db/supabase-client';
import type { SkillStatus } from './skill-lifecycle';

// Phase 1c — persistence for the `skills` table + its lifecycle pointers (migration 006).
//
// SkillService depends only on this interface so the lifecycle state machine is unit-tested
// with InMemorySkillStore and wired to Postgres in production (mirrors EntityStore /
// TenantFieldStore). The store never decides transitions — it just reads/writes rows; the
// service owns the state machine. Mutable columns are written through a fixed allowlist so
// raw identifiers never reach SQL.

export interface SkillRecord {
  id: string;
  tenant_id: string;
  name: string;
  skill_text: string;
  author_role: string | null;
  status: SkillStatus;
  compiled_compilation_id: string | null;
  live_compilation_id: string | null;
  previous_compilation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewSkill {
  name: string;
  skillText: string;
  authorRole?: string | null;
}

/** Patchable columns. camelCase keys map to fixed snake_case columns (allowlisted). */
export interface SkillPatch {
  name?: string;
  skillText?: string;
  status?: SkillStatus;
  compiledCompilationId?: string | null;
  liveCompilationId?: string | null;
  previousCompilationId?: string | null;
}

/** Fixed camelCase→column allowlist — the only identifiers ever interpolated into SQL. */
const PATCH_COLUMNS: Record<keyof SkillPatch, string> = {
  name: 'name',
  skillText: 'skill_text',
  status: 'status',
  compiledCompilationId: 'compiled_compilation_id',
  liveCompilationId: 'live_compilation_id',
  previousCompilationId: 'previous_compilation_id',
};

export interface SkillStore {
  list(tenantId: string): Promise<SkillRecord[]>;
  findById(tenantId: string, id: string): Promise<SkillRecord | null>;
  findByName(tenantId: string, name: string): Promise<SkillRecord | null>;
  insert(tenantId: string, input: NewSkill): Promise<SkillRecord>;
  update(tenantId: string, id: string, patch: SkillPatch): Promise<SkillRecord | null>;
}

/** Postgres-backed store over the `skills` table (004_skills.sql + 006_skill_lifecycle.sql). */
export class PostgresSkillStore implements SkillStore {
  constructor(private readonly client: SupabaseClient) {}

  async list(tenantId: string): Promise<SkillRecord[]> {
    return this.client.query<SkillRecord>(
      `SELECT * FROM skills WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [tenantId],
    );
  }

  async findById(tenantId: string, id: string): Promise<SkillRecord | null> {
    const rows = await this.client.query<SkillRecord>(
      `SELECT * FROM skills WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ?? null;
  }

  async findByName(tenantId: string, name: string): Promise<SkillRecord | null> {
    const rows = await this.client.query<SkillRecord>(
      `SELECT * FROM skills WHERE tenant_id = $1 AND name = $2`,
      [tenantId, name],
    );
    return rows[0] ?? null;
  }

  async insert(tenantId: string, input: NewSkill): Promise<SkillRecord> {
    const rows = await this.client.query<SkillRecord>(
      `INSERT INTO skills (tenant_id, name, skill_text, author_role, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING *`,
      [tenantId, input.name, input.skillText, input.authorRole ?? null],
    );
    return rows[0]!;
  }

  async update(tenantId: string, id: string, patch: SkillPatch): Promise<SkillRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, tenantId];
    for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof SkillPatch, string][]) {
      if (patch[key] === undefined) continue;
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length === 0) return this.findById(tenantId, id);
    sets.push('updated_at = NOW()');

    const rows = await this.client.query<SkillRecord>(
      `UPDATE skills SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params,
    );
    return rows[0] ?? null;
  }
}

/** Process-local store — the test/dev fallback when no DB is configured. */
export class InMemorySkillStore implements SkillStore {
  private readonly rows = new Map<string, SkillRecord>();

  async list(tenantId: string): Promise<SkillRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.tenant_id === tenantId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async findById(tenantId: string, id: string): Promise<SkillRecord | null> {
    const r = this.rows.get(id);
    return r && r.tenant_id === tenantId ? r : null;
  }

  async findByName(tenantId: string, name: string): Promise<SkillRecord | null> {
    return (
      [...this.rows.values()].find((r) => r.tenant_id === tenantId && r.name === name) ?? null
    );
  }

  async insert(tenantId: string, input: NewSkill): Promise<SkillRecord> {
    const now = new Date().toISOString();
    const record: SkillRecord = {
      id: randomUUID(),
      tenant_id: tenantId,
      name: input.name,
      skill_text: input.skillText,
      author_role: input.authorRole ?? null,
      status: 'draft',
      compiled_compilation_id: null,
      live_compilation_id: null,
      previous_compilation_id: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(tenantId: string, id: string, patch: SkillPatch): Promise<SkillRecord | null> {
    const existing = await this.findById(tenantId, id);
    if (!existing) return null;
    const updated: SkillRecord = {
      ...existing,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.skillText !== undefined && { skill_text: patch.skillText }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.compiledCompilationId !== undefined && {
        compiled_compilation_id: patch.compiledCompilationId,
      }),
      ...(patch.liveCompilationId !== undefined && {
        live_compilation_id: patch.liveCompilationId,
      }),
      ...(patch.previousCompilationId !== undefined && {
        previous_compilation_id: patch.previousCompilationId,
      }),
      updated_at: new Date().toISOString(),
    };
    this.rows.set(id, updated);
    return updated;
  }
}

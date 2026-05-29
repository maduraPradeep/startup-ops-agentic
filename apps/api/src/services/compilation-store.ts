import type { CompilationResult } from '@ops/shared';
import type { SupabaseClient } from '../db/supabase-client';
import type { CompilationStore } from './skill-compiler.service';

// Phase 1b — persist compiler output to `skill_compilations` (spec §4, migration 004).
// Keyed by (tenant_id, compilation_hash); a re-compile of identical text is idempotent.
// Failures carry no hash, so they are recorded without the UNIQUE upsert.

export class PostgresCompilationStore implements CompilationStore {
  constructor(private readonly client: SupabaseClient) {}

  async save(tenantId: string, result: CompilationResult): Promise<void> {
    if (result.success) {
      await this.client.query(
        `INSERT INTO skill_compilations
           (tenant_id, compilation_hash, success, langgraph_def, react_flow_graph, warnings, error)
         VALUES ($1, $2, TRUE, $3, $4, $5, NULL)
         ON CONFLICT (tenant_id, compilation_hash) DO UPDATE SET
           langgraph_def    = EXCLUDED.langgraph_def,
           react_flow_graph = EXCLUDED.react_flow_graph,
           warnings         = EXCLUDED.warnings`,
        [
          tenantId,
          result.compilation_hash,
          JSON.stringify(result.langgraph_def),
          JSON.stringify(result.react_flow_graph),
          JSON.stringify(result.warnings),
        ],
      );
      return;
    }

    // Failed compilation: the error shape has no compilation_hash. Record the latest
    // failure per tenant for audit, keyed by an all-zero sentinel hash.
    await this.client.query(
      `INSERT INTO skill_compilations
         (tenant_id, compilation_hash, success, langgraph_def, react_flow_graph, warnings, error)
       VALUES ($1, $2, FALSE, NULL, NULL, '[]', $3)
       ON CONFLICT (tenant_id, compilation_hash) DO UPDATE SET error = EXCLUDED.error`,
      [tenantId, FAILED_HASH_SENTINEL, JSON.stringify(result)],
    );
  }
}

// skill_compilations.compilation_hash is NOT NULL CHAR(64); failures have no hash, so we
// store a reserved all-zero sentinel rather than widening the column.
const FAILED_HASH_SENTINEL = '0'.repeat(64);

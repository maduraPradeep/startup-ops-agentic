import { Pool, type PoolConfig, type QueryResultRow } from 'pg';

// Phase 1b — thin pg client wrapper around the Supabase (managed Postgres) connection.
//
// The Fastify service role connects as a BYPASSRLS login (Supabase `service_role`);
// app-layer authorize() + per-request `app.tenant_id` GUC enforce tenant scoping,
// with RLS (005_rls_policies.sql) as defense-in-depth. This wrapper deliberately
// exposes only what the registry/services need so callers don't pass raw SQL around.

export interface SupabaseClientOptions {
  /** Postgres connection string, e.g. SUPABASE_DB_URL / DATABASE_URL. */
  connectionString: string;
  /** Extra pg.Pool overrides (pool size, ssl, etc.). */
  pool?: Omit<PoolConfig, 'connectionString'>;
}

export class SupabaseClient {
  private readonly pool: Pool;

  constructor(opts: SupabaseClientOptions) {
    this.pool = new Pool({ connectionString: opts.connectionString, ...opts.pool });
  }

  /** Run a parameterized query and return the typed rows. */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<T[]> {
    const res = await this.pool.query<T>(text, params as unknown[] | undefined);
    return res.rows;
  }

  /** Liveness probe — returns true if the connection is usable. */
  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Resolve the Postgres connection string from the environment, honoring the names
 * Phase 1b wires through (SUPABASE_DB_URL preferred, DATABASE_URL fallback).
 * Returns null when no DB is configured so callers can gracefully fall back to the
 * mock (mirrors how Phase 1a skips the langgraph backend when absent).
 */
export function resolveConnectionString(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.SUPABASE_DB_URL ?? env.DATABASE_URL ?? null;
}

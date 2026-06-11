import type { SupabaseClient } from '../db/supabase-client.js';

export function createApprovalModel(db: SupabaseClient | null) {
  return {
    async findPending(tenantId: string, approverId: string) {
      if (!db) return [];
      return db.query(
        `SELECT * FROM approval_chains
         WHERE tenant_id = $1 AND status = 'pending' AND approver = $2
         ORDER BY deadline LIMIT 50`,
        [tenantId, approverId],
      );
    },

    async decide(
      id: string,
      decision: 'approved' | 'rejected',
      notes: string | undefined,
      decidedBy: string,
    ) {
      if (!db) return null;
      const rows = await db.query(
        `UPDATE approval_chains
         SET status = $1, approval_notes = $2, decided_at = $3, decided_by = $4
         WHERE id = $5
         RETURNING *`,
        [decision, notes ?? null, new Date().toISOString(), decidedBy, id],
      );
      return rows[0] ?? null;
    },
  };
}

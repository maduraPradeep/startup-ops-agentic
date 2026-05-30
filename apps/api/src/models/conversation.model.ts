import type { SupabaseClient } from '../db/supabase-client.js';

export function createConversationModel(db: SupabaseClient | null) {
  return {
    async findByTenant(tenantId: string) {
      if (!db) return [];
      return db.query(
        `SELECT * FROM conversations WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [tenantId],
      );
    },

    async sendToAgent(params: {
      conversationId: string;
      content: string;
      channel: string;
      tenantId: string;
      actor: object;
    }): Promise<unknown> {
      const res = await fetch(`${process.env.LANGGRAPH_URL}/invoke/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.LANGGRAPH_API_KEY
            ? { 'X-API-Key': process.env.LANGGRAPH_API_KEY }
            : {}),
        },
        body: JSON.stringify(params),
      });
      return res.json();
    },
  };
}

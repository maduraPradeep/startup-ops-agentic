import { directus } from '../services/directus.service.js';

export const ConversationModel = {
  async findByTenant(tenantId: string) {
    return directus.readItems('conversations', {
      filter: { tenant_id: { _eq: tenantId } },
      sort:   ['-created_at'],
      limit:  50,
    });
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

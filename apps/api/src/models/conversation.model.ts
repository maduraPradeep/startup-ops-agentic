import { directus } from '../services/directus.service.js';

export const ConversationModel = {
  async findByTenant(tenantId: string) {
    return directus.readItems('conversations', {
      filter: { tenant_id: { _eq: tenantId } },
      sort:   ['-created_at'],
      limit:  50,
    });
  },

  async findMessages(conversationId: string) {
    return directus.readItems('conversation_messages', {
      filter: { conversation_id: { _eq: conversationId } },
      sort:   ['created_at'],
    });
  },

  async saveMessage(params: {
    conversation_id: string;
    tenant_id: string;
    role: 'human' | 'agent';
    content: string;
    metadata?: unknown;
  }): Promise<void> {
    await directus.createItem('conversation_messages', {
      ...params,
      created_at: new Date().toISOString(),
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

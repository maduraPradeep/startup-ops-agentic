const LANGGRAPH_URL = process.env.LANGGRAPH_URL ?? 'http://localhost:8000';

function lgHeaders() {
  return process.env.LANGGRAPH_API_KEY
    ? { 'X-API-Key': process.env.LANGGRAPH_API_KEY }
    : {};
}

export const WorkflowModel = {
  async findActive(tenantId: string): Promise<unknown> {
    const res = await fetch(
      `${LANGGRAPH_URL}/workflows/active?tenantId=${tenantId}`,
      { headers: lgHeaders() }
    );
    return res.json();
  },

  async findById(workflowId: string): Promise<unknown> {
    const res = await fetch(
      `${LANGGRAPH_URL}/workflows/${workflowId}`,
      { headers: lgHeaders() }
    );
    return res.json();
  },

  async cancel(workflowId: string, actor: object, tenantId: string): Promise<unknown> {
    const res = await fetch(`${LANGGRAPH_URL}/workflows/${workflowId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...lgHeaders() },
      body: JSON.stringify({ actor, tenantId }),
    });
    return res.json();
  },

  async invokeAction(params: {
    collection: string;
    entityId: string;
    action: string;
    payload: unknown;
    actor: object;
    tenantId: string;
  }): Promise<unknown> {
    const res = await fetch(`${LANGGRAPH_URL}/invoke/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...lgHeaders() },
      body: JSON.stringify(params),
    });
    return res.json();
  },
};

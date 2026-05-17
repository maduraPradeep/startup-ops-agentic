const lgUrl     = () => process.env.LANGGRAPH_URL ?? 'http://localhost:8000';
const lgHeaders = (): Record<string, string> =>
  process.env.LANGGRAPH_API_KEY ? { 'X-API-Key': process.env.LANGGRAPH_API_KEY } : {};

export const WorkflowModel = {
  async findActive(tenantId: string): Promise<unknown> {
    const res = await fetch(
      `${lgUrl()}/workflows/active?tenantId=${tenantId}`,
      { headers: lgHeaders() }
    );
    return res.json();
  },

  async findById(workflowId: string): Promise<unknown> {
    const res = await fetch(
      `${lgUrl()}/workflows/${workflowId}`,
      { headers: lgHeaders() }
    );
    return res.json();
  },

  async cancel(workflowId: string, actor: object, tenantId: string): Promise<unknown> {
    const res = await fetch(`${lgUrl()}/workflows/${workflowId}/cancel`, {
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
    const res = await fetch(`${lgUrl()}/invoke/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...lgHeaders() },
      body: JSON.stringify(params),
    });
    return res.json();
  },
};

interface InvokeActionParams {
  collection: string;
  entityId: string;
  action: string;
  payload: unknown;
  actor: { userId: string; email: string; name: string; role: string };
  tenantId: string;
}

interface SendMessageParams {
  conversationId: string;
  content: string;
  channel: string;
  tenantId: string;
  actor: { userId: string; email: string; name: string; role: string };
}

const lgUrl = () => process.env.LANGGRAPH_URL     ?? 'http://localhost:8000';
const lgKey = () => process.env.LANGGRAPH_API_KEY ?? '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${lgUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(lgKey() ? { 'X-API-Key': lgKey() } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LangGraph error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export const langraphService = {
  invokeAction: (params: InvokeActionParams) =>
    post<unknown>('/invoke/action', params),

  sendMessage: (params: SendMessageParams) =>
    post<unknown>('/invoke/message', params),

  getWorkflowState: (workflowId: string) =>
    fetch(`${lgUrl()}/workflows/${workflowId}`, {
      headers: lgKey() ? { 'X-API-Key': lgKey() } : {},
    }).then((r) => r.json()),
};

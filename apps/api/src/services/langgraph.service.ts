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

const LANGGRAPH_URL = process.env.LANGGRAPH_URL ?? 'http://localhost:8000';
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY ?? '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${LANGGRAPH_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LANGGRAPH_API_KEY ? { 'X-API-Key': LANGGRAPH_API_KEY } : {}),
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
    fetch(`${LANGGRAPH_URL}/workflows/${workflowId}`, {
      headers: LANGGRAPH_API_KEY ? { 'X-API-Key': LANGGRAPH_API_KEY } : {},
    }).then((r) => r.json()),
};

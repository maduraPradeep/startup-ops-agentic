import type {
  ExecutionSnapshot,
  SkillExecutionRuntime,
  StartExecutionInput,
} from './skill-executor.service';

// Phase 1c — HTTP binding of the SkillExecutionRuntime port to the Python LangGraph service.
//
// Maps the bridge's start/resume/get onto the FastAPI `/executions` endpoints. Shares the
// LANGGRAPH_URL / LANGGRAPH_API_KEY convention with langgraph.service.ts. The injectable
// `fetchImpl` keeps this unit-testable without a live service.

type FetchFn = typeof fetch;

const lgUrl = () => process.env.LANGGRAPH_URL ?? 'http://localhost:8000';
const lgKey = () => process.env.LANGGRAPH_API_KEY ?? '';

export class HttpSkillExecutionRuntime implements SkillExecutionRuntime {
  constructor(private readonly fetchImpl: FetchFn = fetch) {}

  async start(input: StartExecutionInput): Promise<ExecutionSnapshot> {
    return this.send('/executions', {
      method: 'POST',
      body: {
        definition: input.definition,
        initial_state: input.initialState ?? null,
        execution_id: input.executionId,
        tenant_id: input.tenantId,
      },
    });
  }

  async resume(executionId: string): Promise<ExecutionSnapshot> {
    return this.send(`/executions/${encodeURIComponent(executionId)}/resume`, { method: 'POST' });
  }

  async get(executionId: string): Promise<ExecutionSnapshot> {
    return this.send(`/executions/${encodeURIComponent(executionId)}`, { method: 'GET' });
  }

  private async send(
    path: string,
    opts: { method: string; body?: unknown },
  ): Promise<ExecutionSnapshot> {
    const response = await this.fetchImpl(`${lgUrl()}${path}`, {
      method: opts.method,
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(lgKey() ? { 'X-API-Key': lgKey() } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`LangGraph runtime error ${response.status}: ${text}`);
    }
    return response.json() as Promise<ExecutionSnapshot>;
  }
}

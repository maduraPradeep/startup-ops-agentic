import type { LangGraphDefinition } from '@ops/shared';
import type { ExecutionRecord, ExecutionStore } from './execution-store';
import { SkillNotFoundError, type SkillService } from './skill.service';

// Phase 1c — TS↔Python skill-execution bridge (spec §4.8, PRD deliverable, "Service bridge").
//
// Runs a *live* skill: load its `live_compilation_id`, read that compilation's `langgraph_def`,
// hand it to the Python runtime, and persist the run in `skill_executions` keyed by a shared id.
//   trigger → insert execution row → runtime.start(def) → persist returned state
//   resume  → runtime.resume(id)   → persist returned state (advances one human_input/approval)
// The run pins the compilation it started on, so a later publish/rollback never disturbs it.
//
// Everything external is behind an interface — the runtime (HTTP to the Python service), the
// compilation reader (skill_compilations), the execution store — so the orchestration is
// unit-tested with fakes (mirrors the rest of apps/api).

/** The execution snapshot the Python runtime returns over HTTP. */
export interface ExecutionSnapshot {
  execution_id: string;
  state: string;
  data: Record<string, unknown>;
  paused_node: string | null;
  paused_kind: string | null;
  backend: string;
}

export interface StartExecutionInput {
  executionId: string;
  definition: LangGraphDefinition;
  initialState?: Record<string, unknown>;
  tenantId: string;
}

/** Port to the Python LangGraph runtime (`/executions` endpoints). */
export interface SkillExecutionRuntime {
  start(input: StartExecutionInput): Promise<ExecutionSnapshot>;
  resume(executionId: string): Promise<ExecutionSnapshot>;
  get(executionId: string): Promise<ExecutionSnapshot>;
}

/** Read-side of `skill_compilations`: fetch the compiled graph to execute. */
export interface CompilationReader {
  findLangGraphDef(tenantId: string, compilationId: string): Promise<LangGraphDefinition | null>;
}

/** Terminal execution states: once here, the run is done and `finished_at` is stamped. */
const TERMINAL_STATES = new Set(['completed', 'error', 'cancelled']);

export class SkillNotExecutableError extends Error {
  constructor(public readonly id: string, reason: string) {
    super(`Skill ${id} is not executable: ${reason}`);
    this.name = 'SkillNotExecutableError';
  }
}

export class CompilationNotFoundError extends Error {
  constructor(public readonly compilationId: string) {
    super(`No compiled graph found for compilation ${compilationId}`);
    this.name = 'CompilationNotFoundError';
  }
}

export class ExecutionNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No execution with id ${id}`);
    this.name = 'ExecutionNotFoundError';
  }
}

/** The Python runtime call failed (network, 5xx, etc.) — distinct from a clean run result. */
export class ExecutionRuntimeError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ExecutionRuntimeError';
  }
}

export class SkillExecutorService {
  constructor(
    private readonly skills: SkillService,
    private readonly compilations: CompilationReader,
    private readonly runtime: SkillExecutionRuntime,
    private readonly executions: ExecutionStore,
  ) {}

  /**
   * Trigger a live skill. Loads the live compilation's graph, records a `running` execution
   * row, runs it on the Python runtime, then persists the resulting state (pausing at the
   * first human_input / approval gate). A runtime failure marks the row `error` and rethrows.
   */
  async trigger(
    tenantId: string,
    skillId: string,
    initialState?: Record<string, unknown>,
  ): Promise<ExecutionRecord> {
    const skill = await this.skills.get(tenantId, skillId); // throws SkillNotFoundError
    if (skill.status !== 'live' || !skill.live_compilation_id) {
      throw new SkillNotExecutableError(skillId, 'skill is not live');
    }

    const definition = await this.compilations.findLangGraphDef(
      tenantId,
      skill.live_compilation_id,
    );
    if (!definition) throw new CompilationNotFoundError(skill.live_compilation_id);

    // Insert first so the id is shared with the runtime thread and the run is durable even if
    // the runtime call fails (the row then settles to `error` below).
    const record = await this.executions.insert(tenantId, {
      compilationId: skill.live_compilation_id,
      state: 'running',
      context: initialState ?? {},
    });

    let snapshot: ExecutionSnapshot;
    try {
      snapshot = await this.runtime.start({
        executionId: record.id,
        definition,
        initialState,
        tenantId,
      });
    } catch (err) {
      await this.executions.update(tenantId, record.id, {
        state: 'error',
        context: { error: String(err) },
        finishedAt: new Date().toISOString(),
      });
      throw new ExecutionRuntimeError(`Runtime failed to start execution ${record.id}`, err);
    }

    return this.persist(tenantId, record.id, snapshot);
  }

  /** Advance a parked execution past one interrupt (provide input / approve). */
  async resume(tenantId: string, executionId: string): Promise<ExecutionRecord> {
    await this.requireExecution(tenantId, executionId);
    let snapshot: ExecutionSnapshot;
    try {
      snapshot = await this.runtime.resume(executionId);
    } catch (err) {
      throw new ExecutionRuntimeError(`Runtime failed to resume execution ${executionId}`, err);
    }
    return this.persist(tenantId, executionId, snapshot);
  }

  get(tenantId: string, executionId: string): Promise<ExecutionRecord> {
    return this.requireExecution(tenantId, executionId);
  }

  list(tenantId: string): Promise<ExecutionRecord[]> {
    return this.executions.list(tenantId);
  }

  private async requireExecution(tenantId: string, id: string): Promise<ExecutionRecord> {
    const record = await this.executions.findById(tenantId, id);
    if (!record) throw new ExecutionNotFoundError(id);
    return record;
  }

  /** Fold a runtime snapshot back into the execution row; stamp `finished_at` when terminal. */
  private async persist(
    tenantId: string,
    id: string,
    snapshot: ExecutionSnapshot,
  ): Promise<ExecutionRecord> {
    const terminal = TERMINAL_STATES.has(snapshot.state);
    const updated = await this.executions.update(tenantId, id, {
      state: snapshot.state,
      context: snapshot.data,
      finishedAt: terminal ? new Date().toISOString() : null,
    });
    if (!updated) throw new ExecutionNotFoundError(id);
    return updated;
  }
}

export { SkillNotFoundError };

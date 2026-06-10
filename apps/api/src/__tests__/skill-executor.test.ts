import type { LangGraphDefinition } from '@ops/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryExecutionStore } from '../services/execution-store';
import { InMemorySkillStore } from '../services/skill-store';
import { SkillService } from '../services/skill.service';
import {
  ApprovalForbiddenError,
  CompilationNotFoundError,
  ExecutionNotAwaitingApprovalError,
  ExecutionNotFoundError,
  ExecutionRuntimeError,
  SkillNotExecutableError,
  SkillNotFoundError,
  SkillExecutorService,
  type CompilationReader,
  type ExecutionSnapshot,
  type SkillExecutionRuntime,
  type StartExecutionInput,
} from '../services/skill-executor.service';

// Phase 1c — TS↔Python skill-execution bridge, driven over in-memory stores + fakes (no DB,
// no Python). The fake runtime simulates the snapshot contract: a run pauses at a human_input,
// then resume() drains to completed.

const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-0000000000ff';
const COMP = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const DEF: LangGraphDefinition = {
  name: 'Add Employee',
  description: '',
  state_schema: { fields: {} },
  entry_point: 'ask',
  nodes: [
    { id: 'ask', step_type: 'human_input', config: { kind: 'data' } },
    { id: 'done', step_type: 'end', config: {} },
  ],
  edges: [
    { from: 'ask', to: 'done' },
  ],
} as unknown as LangGraphDefinition;

/** A scripted runtime: start → awaiting_human_input, resume → completed. */
class FakeRuntime implements SkillExecutionRuntime {
  started: StartExecutionInput[] = [];
  resumed: string[] = [];
  private snapshots = new Map<string, ExecutionSnapshot>();

  async start(input: StartExecutionInput): Promise<ExecutionSnapshot> {
    this.started.push(input);
    const snap: ExecutionSnapshot = {
      execution_id: input.executionId,
      state: 'awaiting_human_input',
      data: { ...(input.initialState ?? {}), step: 'ask' },
      paused_node: 'ask',
      paused_kind: 'data',
      backend: 'inmemory',
    };
    this.snapshots.set(input.executionId, snap);
    return snap;
  }

  async resume(executionId: string): Promise<ExecutionSnapshot> {
    this.resumed.push(executionId);
    const snap: ExecutionSnapshot = {
      execution_id: executionId,
      state: 'completed',
      data: { step: 'done', employee_id: 'emp-1' },
      paused_node: null,
      paused_kind: null,
      backend: 'inmemory',
    };
    this.snapshots.set(executionId, snap);
    return snap;
  }

  async get(executionId: string): Promise<ExecutionSnapshot> {
    const snap = this.snapshots.get(executionId);
    if (!snap) throw new Error('unknown');
    return snap;
  }
}

class FakeCompilationReader implements CompilationReader {
  constructor(private readonly defs: Record<string, LangGraphDefinition>) {}
  async findLangGraphDef(_t: string, id: string): Promise<LangGraphDefinition | null> {
    return this.defs[id] ?? null;
  }
}

class ThrowingRuntime implements SkillExecutionRuntime {
  async start(): Promise<ExecutionSnapshot> {
    throw new Error('connection refused');
  }
  async resume(): Promise<ExecutionSnapshot> {
    throw new Error('connection refused');
  }
  async get(): Promise<ExecutionSnapshot> {
    throw new Error('connection refused');
  }
}

interface Harness {
  skills: SkillService;
  executions: InMemoryExecutionStore;
  runtime: FakeRuntime;
  executor: SkillExecutorService;
}

function build(reader: CompilationReader = new FakeCompilationReader({ [COMP]: DEF })): Harness {
  const skills = new SkillService(new InMemorySkillStore());
  const executions = new InMemoryExecutionStore();
  const runtime = new FakeRuntime();
  const executor = new SkillExecutorService(skills, reader, runtime, executions);
  return { skills, executions, runtime, executor };
}

/** Create a skill and walk it to `live` on compilation COMP. */
async function liveSkill(skills: SkillService): Promise<string> {
  const skill = await skills.create(TENANT, { name: 'Onboard', skillText: 'add' });
  await skills.markCompiled(TENANT, skill.id, COMP);
  await skills.validate(TENANT, skill.id);
  await skills.publish(TENANT, skill.id);
  return skill.id;
}

describe('SkillExecutorService.trigger', () => {
  let h: Harness;
  beforeEach(() => {
    h = build();
  });

  it('runs a live skill and persists the paused execution', async () => {
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id, { name: 'Ada' });

    expect(exec.state).toBe('awaiting_human_input');
    expect(exec.compilation_id).toBe(COMP);
    expect(exec.finished_at).toBeNull();
    // The runtime got the row id as the shared execution id + the initial state.
    expect(h.runtime.started[0]?.executionId).toBe(exec.id);
    expect(h.runtime.started[0]?.initialState).toEqual({ name: 'Ada' });
    // Persisted context reflects the snapshot data.
    expect(exec.context).toMatchObject({ name: 'Ada', step: 'ask' });
  });

  it('rejects a skill that is not live', async () => {
    const skill = await h.skills.create(TENANT, { name: 'Draft', skillText: 'add' });
    await expect(h.executor.trigger(TENANT, skill.id)).rejects.toThrow(SkillNotExecutableError);
  });

  it('throws SkillNotFoundError for a missing / cross-tenant skill', async () => {
    const id = await liveSkill(h.skills);
    await expect(h.executor.trigger(OTHER, id)).rejects.toThrow(SkillNotFoundError);
  });

  it('throws CompilationNotFoundError when the live compilation has no stored graph', async () => {
    const reader = new FakeCompilationReader({}); // no defs
    const local = build(reader);
    const id = await liveSkill(local.skills);
    await expect(local.executor.trigger(TENANT, id)).rejects.toThrow(CompilationNotFoundError);
  });

  it('marks the execution `error` and rethrows when the runtime fails', async () => {
    const skills = new SkillService(new InMemorySkillStore());
    const executions = new InMemoryExecutionStore();
    const executor = new SkillExecutorService(
      skills,
      new FakeCompilationReader({ [COMP]: DEF }),
      new ThrowingRuntime(),
      executions,
    );
    const id = await liveSkill(skills);

    await expect(executor.trigger(TENANT, id)).rejects.toThrow(ExecutionRuntimeError);

    const [row] = await executions.list(TENANT);
    expect(row?.state).toBe('error');
    expect(row?.finished_at).not.toBeNull();
  });
});

describe('SkillExecutorService.resume', () => {
  it('advances a parked execution to completed and stamps finished_at', async () => {
    const h = build();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);

    const resumed = await h.executor.resume(TENANT, exec.id);
    expect(resumed.state).toBe('completed');
    expect(resumed.finished_at).not.toBeNull();
    expect(resumed.context).toMatchObject({ employee_id: 'emp-1' });
    expect(h.runtime.resumed).toEqual([exec.id]);
  });

  it('throws ExecutionNotFoundError for an unknown / cross-tenant execution', async () => {
    const h = build();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);
    await expect(h.executor.resume(OTHER, exec.id)).rejects.toThrow(ExecutionNotFoundError);
    await expect(h.executor.resume(TENANT, 'ghost')).rejects.toThrow(ExecutionNotFoundError);
  });
});

// An approval gate: a human_input node with kind:'approval' that names a required role.
const DEF_APPROVAL: LangGraphDefinition = {
  name: 'Approve Spend',
  description: '',
  state_schema: { fields: {} },
  entry_point: 'gate',
  nodes: [
    { id: 'gate', step_type: 'human_input', config: { kind: 'approval', approver_role: 'admin' } },
    { id: 'done', step_type: 'end', config: {} },
  ],
  edges: [{ from: 'gate', to: 'done' }],
} as unknown as LangGraphDefinition;

const ADMIN = { userId: 'u-admin', role: 'admin' };

/** A runtime that parks at awaiting_approval, then resume() drains to completed. */
class ApprovalRuntime implements SkillExecutionRuntime {
  resumed: string[] = [];
  private snapshots = new Map<string, ExecutionSnapshot>();

  async start(input: StartExecutionInput): Promise<ExecutionSnapshot> {
    const snap: ExecutionSnapshot = {
      execution_id: input.executionId,
      state: 'awaiting_approval',
      data: { ...(input.initialState ?? {}), amount: 5000 },
      paused_node: 'gate',
      paused_kind: 'approval',
      backend: 'inmemory',
    };
    this.snapshots.set(input.executionId, snap);
    return snap;
  }

  async resume(executionId: string): Promise<ExecutionSnapshot> {
    this.resumed.push(executionId);
    const snap: ExecutionSnapshot = {
      execution_id: executionId,
      state: 'completed',
      data: { amount: 5000, approved: true },
      paused_node: null,
      paused_kind: null,
      backend: 'inmemory',
    };
    this.snapshots.set(executionId, snap);
    return snap;
  }

  async get(executionId: string): Promise<ExecutionSnapshot> {
    const snap = this.snapshots.get(executionId);
    if (!snap) throw new Error('unknown');
    return snap;
  }
}

describe('SkillExecutorService.approve', () => {
  function buildApproval() {
    const skills = new SkillService(new InMemorySkillStore());
    const executions = new InMemoryExecutionStore();
    const runtime = new ApprovalRuntime();
    const executor = new SkillExecutorService(
      skills,
      new FakeCompilationReader({ [COMP]: DEF_APPROVAL }),
      runtime,
      executions,
    );
    return { skills, executions, runtime, executor };
  }

  it('advances an awaiting_approval run to completed and records an audit entry', async () => {
    const h = buildApproval();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);
    expect(exec.state).toBe('awaiting_approval');

    const approved = await h.executor.approve(TENANT, exec.id, ADMIN, { decision: 'approve' });

    expect(approved.state).toBe('completed');
    expect(approved.finished_at).not.toBeNull();
    expect(h.runtime.resumed).toEqual([exec.id]);
    expect(approved.context).toMatchObject({ approved: true });
    expect(approved.context._approvals).toEqual([
      expect.objectContaining({ node: 'gate', by: 'u-admin', role: 'admin', decision: 'approve' }),
    ]);
  });

  it('rejects an awaiting_approval run, cancelling it without resuming', async () => {
    const h = buildApproval();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);

    const rejected = await h.executor.approve(TENANT, exec.id, ADMIN, {
      decision: 'reject',
      comment: 'over budget',
    });

    expect(rejected.state).toBe('cancelled');
    expect(rejected.finished_at).not.toBeNull();
    expect(h.runtime.resumed).toEqual([]); // no resume on reject
    expect(rejected.context._approvals).toEqual([
      expect.objectContaining({ decision: 'reject', comment: 'over budget' }),
    ]);
  });

  it('forbids an approver whose role does not match the gate', async () => {
    const h = buildApproval();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);

    await expect(
      h.executor.approve(TENANT, exec.id, { userId: 'u-emp', role: 'employee' }, { decision: 'approve' }),
    ).rejects.toThrow(ApprovalForbiddenError);
    expect(h.runtime.resumed).toEqual([]);
  });

  it('throws when the run is not awaiting approval', async () => {
    // The default FakeRuntime parks at awaiting_human_input, not approval.
    const h = build();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);

    await expect(
      h.executor.approve(TENANT, exec.id, ADMIN, { decision: 'approve' }),
    ).rejects.toThrow(ExecutionNotAwaitingApprovalError);
  });

  it('throws ExecutionNotFoundError for an unknown / cross-tenant execution', async () => {
    const h = buildApproval();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);
    await expect(h.executor.approve(OTHER, exec.id, ADMIN, { decision: 'approve' })).rejects.toThrow(
      ExecutionNotFoundError,
    );
  });
});

describe('SkillExecutorService.get / list', () => {
  it('returns a triggered execution and lists it under the tenant', async () => {
    const h = build();
    const id = await liveSkill(h.skills);
    const exec = await h.executor.trigger(TENANT, id);

    expect((await h.executor.get(TENANT, exec.id)).id).toBe(exec.id);
    expect(await h.executor.list(TENANT)).toHaveLength(1);
    expect(await h.executor.list(OTHER)).toHaveLength(0);
  });

  it('get throws for an unknown execution', async () => {
    const h = build();
    await expect(h.executor.get(TENANT, 'nope')).rejects.toThrow(ExecutionNotFoundError);
  });
});

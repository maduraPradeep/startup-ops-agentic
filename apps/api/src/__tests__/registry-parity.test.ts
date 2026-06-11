import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ADD_EMPLOYEE_DEFINITION,
  ADD_EMPLOYEE_SKILL,
  HRIS_SYNC_NO_HITL_DEFINITION,
  HRIS_SYNC_SKILL,
  MockLLM,
  MockRegistry,
  UNKNOWN_ENTITY_SKILL,
  agentScopeDefinition,
  badStepTypeDefinition,
  compileSkill,
  parseTokens,
  piiLeakDefinition,
  resolveTokens,
  sqlInjectionDefinition,
  type Registry,
} from '@ops/compiler';
import { PostgresRegistry } from '../services/postgres-registry';
import { SupabaseClient, resolveConnectionString } from '../db/supabase-client';

// Phase 1b LINCHPIN — registry parity.
//
// PostgresRegistry must return the EXACT shapes/results MockRegistry returns. We
// prove it by running the SAME registry-dependent assertions the @ops/compiler suite
// exercises against BOTH implementations.
//
// Environment policy (mirrors how Phase 1a skips the langgraph backend when its dep
// is absent): the Postgres leg runs for real when SUPABASE_DB_URL / DATABASE_URL
// points at a reachable Postgres; otherwise it is EXPLICITLY skipped and logged, so
// the suite stays green in the all-mocked ephemeral container. No Docker is required.

const MIGRATIONS = [
  '001_platform_config',
  '002_entities',
  '003_tenant_fields',
  '004_skills',
  '005_rls_policies',
];

/** All registry-dependent compiler behaviors, parameterized over a Registry. */
function runRegistryParityAssertions(getRegistry: () => Registry): void {
  it('getEntity / getTool / getAgent / getRole return the canonical shapes', () => {
    const registry = getRegistry();
    const people = registry.getEntity('people');
    expect(people).not.toBeNull();
    expect(people?.label).toBe('Employees');
    expect(people?.resource).toBe('employees');
    expect(people?.tool_ops).toEqual(['describe', 'list', 'get', 'create', 'update', 'terminate']);

    const fields = registry.getEntityFields('people');
    expect(fields.map((f) => f.name)).toEqual([
      'id', 'name', 'email', 'role', 'department_id', 'manager_id',
      'start_date', 'employment_type', 'slack_id', 'linkedin_summary', 'pronouns',
    ]);
    expect(fields.find((f) => f.name === 'name')?.pii).toBe(true);
    expect(fields.find((f) => f.name === 'email')?.pii).toBe(true);
    expect(fields.find((f) => f.name === 'role')?.pii).toBe(false);
    expect(fields.find((f) => f.name === 'linkedin_summary')?.is_system).toBe(false);

    expect(registry.getTool('linkedin_analyzer')).toMatchObject({ pii_safe: false, is_destructive: false });
    expect(registry.getTool('hris_sync')?.is_destructive).toBe(true);
    expect(registry.getAgent('onboarding')?.tool_scopes).toEqual(['employees:read', 'leave_requests:read']);
    expect(registry.getRole('hr_admin')?.permissions).toContain('notifications:broadcast');
    expect(registry.getRole('all')).toEqual({ name: 'all', permissions: [] });

    // Unknown lookups return null, not undefined.
    expect(registry.getEntity('unicorn')).toBeNull();
    expect(registry.getTool('nope')).toBeNull();
    expect(registry.getAgent('nope')).toBeNull();
    expect(registry.getRole('nope')).toBeNull();
  });

  it('byte-for-byte equals MockRegistry for every public lookup', () => {
    const registry = getRegistry();
    const mock = new MockRegistry();
    for (const name of ['people', 'leave_requests', 'unicorn']) {
      expect(registry.getEntity(name)).toEqual(mock.getEntity(name));
      expect(registry.getEntityFields(name)).toEqual(mock.getEntityFields(name));
    }
    for (const name of ['linkedin_analyzer', 'hris_sync', 'payroll_update', 'nope']) {
      expect(registry.getTool(name)).toEqual(mock.getTool(name));
    }
    for (const name of ['orchestrator', 'onboarding', 'hr_bot', 'nope']) {
      expect(registry.getAgent(name)).toEqual(mock.getAgent(name));
    }
    for (const name of ['hr_admin', 'owner', 'manager', 'employee', 'all', 'nope']) {
      expect(registry.getRole(name)).toEqual(mock.getRole(name));
    }
  });

  it('resolves all token kinds with their context', () => {
    const resolved = resolveTokens(parseTokens(ADD_EMPLOYEE_SKILL), getRegistry());
    expect(resolved.find((r) => r.raw === '@agent:onboarding')?.resolved.tool_scopes).toBeDefined();
    expect(resolved.find((r) => r.raw === '@tool:linkedin_analyzer')?.resolved.pii_safe).toBe(false);
  });

  it('fails fast on unknown entity / field / op', () => {
    const registry = getRegistry();
    expect(() => resolveTokens(parseTokens('@entity:unicorn'), registry)).toThrowError(/Unknown entity/);
    expect(() => resolveTokens(parseTokens('@entity:people.nonexistent'), registry)).toThrowError(/no field/);
    expect(() => resolveTokens(parseTokens('@tools:teleport:people'), registry)).toThrowError(/does not support operation/);
  });

  it('compiles the Add Employee skill through all stages with the canonical IR + hash', async () => {
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm: new MockLLM(ADD_EMPLOYEE_DEFINITION), registry: getRegistry() });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.langgraph_def.nodes.map((n) => n.step_type)).toEqual([
      'entity_tool', 'collect', 'human_input', 'enrich',
      'entity_tool', 'notify', 'notify', 'start_agent', 'end',
    ]);
    expect(result.compilation_hash).toMatch(/^[0-9a-f]{64}$/);

    // Same IR + hash that MockRegistry produces, and deep-equals the Python fixture.
    const mock = await compileSkill(ADD_EMPLOYEE_SKILL, { llm: new MockLLM(ADD_EMPLOYEE_DEFINITION), registry: new MockRegistry() });
    expect(mock.success).toBe(true);
    if (mock.success) {
      expect(result.langgraph_def).toEqual(mock.langgraph_def);
      expect(result.compilation_hash).toBe(mock.compilation_hash);
    }

    const pythonFixturePath = fileURLToPath(
      new URL('../../../../services/langgraph/graph_builder/fixtures/add-employee.langgraph.json', import.meta.url),
    );
    expect(result.langgraph_def).toEqual(JSON.parse(readFileSync(pythonFixturePath, 'utf8')));
  });

  it('rejects each bad skill at the correct stage', async () => {
    const registry = getRegistry();
    const cases: Array<[Promise<Awaited<ReturnType<typeof compileSkill>>>, string]> = [
      [compileSkill(UNKNOWN_ENTITY_SKILL, { llm: new MockLLM(ADD_EMPLOYEE_DEFINITION), registry }), 'parse'],
      [compileSkill(ADD_EMPLOYEE_SKILL, { llm: new MockLLM(sqlInjectionDefinition()), registry }), 'injection'],
      [compileSkill(ADD_EMPLOYEE_SKILL, { llm: new MockLLM(badStepTypeDefinition()), registry }), 'invalid_step_type'],
      [compileSkill(ADD_EMPLOYEE_SKILL, { llm: new MockLLM(agentScopeDefinition()), registry }), 'tool_scope'],
      [compileSkill(ADD_EMPLOYEE_SKILL, { llm: new MockLLM(piiLeakDefinition()), registry }), 'pii'],
      [compileSkill(ADD_EMPLOYEE_SKILL, { llm: new MockLLM(ADD_EMPLOYEE_DEFINITION), registry, authorRole: 'employee' }), 'broadcast'],
      [compileSkill(HRIS_SYNC_SKILL, { llm: new MockLLM(HRIS_SYNC_NO_HITL_DEFINITION), registry }), 'destructive'],
    ];

    const [parse, inj, step, scope, pii, broadcast, destructive] = await Promise.all(cases.map(([p]) => p));
    expect(parse.success).toBe(false);
    if (!parse.success) expect(parse.stage).toBe('parse');
    if (!inj.success) expect(inj.error_type).toBe('injection');
    if (!step.success) expect(step.error_type).toBe('invalid_step_type');
    if (!scope.success) expect(scope.error_type).toBe('tool_scope');
    if (!pii.success) expect(pii.error_type).toBe('pii');
    if (!broadcast.success) expect(broadcast.error_type).toBe('broadcast');
    if (!destructive.success) expect(destructive.error_type).toBe('destructive');
  });
}

// ── Build the PostgresRegistry once, if a DB is reachable ───────────────────────────
const connectionString = resolveConnectionString();
let client: SupabaseClient | null = null;
let pgRegistry: PostgresRegistry | null = null;
let pgSkipReason: string | null = null;

async function setupPostgres(): Promise<void> {
  if (!connectionString) {
    pgSkipReason = 'no SUPABASE_DB_URL/DATABASE_URL set';
    return;
  }
  const probe = new SupabaseClient({ connectionString });
  if (!(await probe.ping())) {
    await probe.close();
    pgSkipReason = `DB at ${connectionString} unreachable`;
    return;
  }
  client = probe;
  const migrationsDir = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));
  for (const m of MIGRATIONS) {
    await client.query(readFileSync(`${migrationsDir}${m}.sql`, 'utf8'));
  }
  const seedPath = fileURLToPath(new URL('../../../../supabase/seed.sql', import.meta.url));
  await client.query(readFileSync(seedPath, 'utf8'));
  pgRegistry = await PostgresRegistry.create(client);
}

// Top-level await is supported in ESM test modules; build the registry before the
// describe blocks register so the conditional describe.skipIf has a definite result.
await setupPostgres();

afterAll(async () => {
  await client?.close();
});

describe('registry parity — MockRegistry', () => {
  runRegistryParityAssertions(() => new MockRegistry());
});

describe.skipIf(pgRegistry === null)('registry parity — PostgresRegistry (real DB)', () => {
  if (pgRegistry === null) {
    console.warn(`[registry-parity] SKIPPING PostgresRegistry leg: ${pgSkipReason} (mirrors Phase 1a skipping the langgraph backend).`);
  } else {
    console.info('[registry-parity] PostgresRegistry leg RUNNING against a real Postgres.');
  }
  // Non-null asserted: this block only runs when pgRegistry is set.
  runRegistryParityAssertions(() => pgRegistry as PostgresRegistry);
});

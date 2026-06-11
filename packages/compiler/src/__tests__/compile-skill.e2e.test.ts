import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { compileSkill } from '../compile-skill';
import { CompilationCache } from '../cache/compilation-cache';
import { MockRegistry } from '../registry/mock-registry';
import { MockLLM } from '../llm/mock-llm';
import {
  ADD_EMPLOYEE_DEFINITION,
  sqlInjectionDefinition,
  badStepTypeDefinition,
  agentScopeDefinition,
  piiLeakDefinition,
  HRIS_SYNC_NO_HITL_DEFINITION,
} from '../llm/fixtures';
import {
  ADD_EMPLOYEE_SKILL,
  HRIS_SYNC_SKILL,
  UNKNOWN_ENTITY_SKILL,
} from '../llm/skill-fixtures';

const registry = new MockRegistry();

describe('compileSkill — happy path', () => {
  it('compiles the Add Employee skill through all stages', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry });

    expect(result.success).toBe(true);
    if (!result.success) return;

    // All five token kinds are present in the parsed set.
    const kinds = new Set(result.parsed_tokens.map((t) => t.kind));
    expect(kinds).toContain('entity');
    expect(kinds).toContain('entity_field');
    expect(kinds).toContain('role');
    expect(kinds).toContain('agent');
    expect(kinds).toContain('external_tool');
    expect(kinds).toContain('entity_tool');

    // Expected step sequence (spec Appendix C).
    expect(result.langgraph_def.nodes.map((n) => n.step_type)).toEqual([
      'entity_tool',
      'collect',
      'human_input',
      'enrich',
      'entity_tool',
      'notify',
      'notify',
      'start_agent',
      'end',
    ]);

    // React Flow graph has one node per IR node and one edge per IR edge.
    expect(result.react_flow_graph.nodes).toHaveLength(result.langgraph_def.nodes.length);
    expect(result.react_flow_graph.edges).toHaveLength(result.langgraph_def.edges.length);

    expect(result.compilation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.from_cache).toBe(false);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('serves a cache hit on identical re-compile without calling the LLM again', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const cache = new CompilationCache();

    const first = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry, cache });
    const second = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry, cache });

    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(first.from_cache).toBe(false);
    expect(second.from_cache).toBe(true);
    expect(second.compilation_hash).toBe(first.compilation_hash);
    expect(llm.callCount).toBe(1); // LLM not called the second time
  });
});

describe('compileSkill — rejection paths (each at the correct stage)', () => {
  it('unknown token -> parse', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const result = await compileSkill(UNKNOWN_ENTITY_SKILL, { llm, registry });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('parse');
    expect(result.token_at_fault).toBe('@entity:unicorn');
    expect(llm.callCount).toBe(0); // fail-fast before the LLM
  });

  it('SQL/shell injection -> structural_validate', async () => {
    const llm = new MockLLM(sqlInjectionDefinition());
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('structural_validate');
    expect(result.error_type).toBe('injection');
  });

  it('invalid step_type -> structural_validate', async () => {
    const llm = new MockLLM(badStepTypeDefinition());
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('structural_validate');
    expect(result.error_type).toBe('invalid_step_type');
  });

  it('agent missing tool scope -> structural_validate', async () => {
    const llm = new MockLLM(agentScopeDefinition());
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('structural_validate');
    expect(result.error_type).toBe('tool_scope');
  });

  it('PII into non-pii_safe tool -> data_flow_validate', async () => {
    const llm = new MockLLM(piiLeakDefinition());
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('data_flow_validate');
    expect(result.error_type).toBe('pii');
  });

  it('broadcast without permission -> data_flow_validate', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, {
      llm,
      registry,
      authorRole: 'employee',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('data_flow_validate');
    expect(result.error_type).toBe('broadcast');
  });

  it('destructive tool without human_input ancestor -> data_flow_validate', async () => {
    const llm = new MockLLM(HRIS_SYNC_NO_HITL_DEFINITION);
    const result = await compileSkill(HRIS_SYNC_SKILL, { llm, registry });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('data_flow_validate');
    expect(result.error_type).toBe('destructive');
  });

  it('malformed LLM output -> compile', async () => {
    const llm = new MockLLM({ not: 'a valid definition' });
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.stage).toBe('compile');
    expect(result.error_type).toBe('invalid_definition');
  });
});

describe('cross-language round-trip (H1)', () => {
  it('compiled IR deep-equals the canonical JSON the Python GraphBuilder consumes', async () => {
    const llm = new MockLLM(ADD_EMPLOYEE_DEFINITION);
    const result = await compileSkill(ADD_EMPLOYEE_SKILL, { llm, registry });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const pythonCopyPath = fileURLToPath(
      new URL(
        '../../../../services/langgraph/graph_builder/fixtures/add-employee.langgraph.json',
        import.meta.url,
      ),
    );
    const pythonFixture = JSON.parse(readFileSync(pythonCopyPath, 'utf8'));
    expect(result.langgraph_def).toEqual(pythonFixture);
  });
});

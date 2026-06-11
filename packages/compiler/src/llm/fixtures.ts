import type { LangGraphDefinition } from '@ops/shared';
import addEmployeeJson from './fixtures/add-employee.langgraph.json';

// Phase 1a — fixture LangGraph definitions the mock LLM returns.
//
// `ADD_EMPLOYEE_DEFINITION` is the canonical happy-path IR (spec Appendix C). It is loaded
// from the JSON file so the exact same bytes can be consumed by the Python GraphBuilder
// (round-trip acceptance). Bad variants are derived from it.

export const ADD_EMPLOYEE_DEFINITION = addEmployeeJson as LangGraphDefinition;

function clone(def: LangGraphDefinition): LangGraphDefinition {
  return structuredClone(def);
}

// --- Bad variants (each trips a specific validator) ---------------------------------------

/** Stage `structural_validate` — SQL/shell injection string smuggled into a node config. */
export function sqlInjectionDefinition(): LangGraphDefinition {
  const def = clone(ADD_EMPLOYEE_DEFINITION);
  (def.nodes[1]!.config as Record<string, unknown>).query =
    'SELECT * FROM employees; DROP TABLE employees;';
  return def;
}

/** Stage `structural_validate` — node uses a step_type not in the whitelist. */
export function badStepTypeDefinition(): LangGraphDefinition {
  const def = clone(ADD_EMPLOYEE_DEFINITION);
  def.nodes[0]!.step_type = 'frobnicate';
  return def;
}

/** Stage `structural_validate` (`tool_scope`) — HR Bot assigned a tool outside its scopes. */
export function agentScopeDefinition(): LangGraphDefinition {
  const def = clone(ADD_EMPLOYEE_DEFINITION);
  const create = def.nodes.find((n) => n.id === 'create_employee')!;
  create.config.tool = 'payroll_update'; // not in hr_bot scopes ["employees:*","leave_requests:*"]
  return def;
}

/** Stage `structural_validate` — node references a token not present in the skill text. */
export function unknownTokenInOutputDefinition(): LangGraphDefinition {
  const def = clone(ADD_EMPLOYEE_DEFINITION);
  def.nodes[0]!.config.tokens = ['@tools:describe:unicorns'];
  return def;
}

/** Stage `data_flow_validate` (`pii`) — a PII field fed into a non-pii_safe tool. */
export function piiLeakDefinition(): LangGraphDefinition {
  const def = clone(ADD_EMPLOYEE_DEFINITION);
  const analyze = def.nodes.find((n) => n.id === 'analyze_linkedin')!;
  analyze.config.tool_inputs = ['email']; // email is PII; linkedin_analyzer is pii_safe:false
  return def;
}

// --- HRIS sync (destructive-gate) fixtures ------------------------------------------------

/** Stage `data_flow_validate` (`destructive`) — destructive tool with no human_input ancestor. */
export const HRIS_SYNC_NO_HITL_DEFINITION: LangGraphDefinition = {
  name: 'Sync HRIS',
  description: 'Push the record to the external HRIS.',
  state_schema: { fields: { record: { type: 'object', description: 'record' } } },
  entry_point: 'load_schema',
  nodes: [
    { id: 'load_schema', step_type: 'entity_tool', config: { tokens: ['@tools:describe:people'], entity: 'people', op: 'describe' } },
    { id: 'sync', step_type: 'enrich', config: { tokens: ['@tool:hris_sync'], tool: 'hris_sync' } },
    { id: 'complete', step_type: 'end', config: {} },
  ],
  edges: [
    { from: 'load_schema', to: 'sync' },
    { from: 'sync', to: 'complete' },
  ],
};

/** Passing counterpart — same flow with a human_input (approval) ancestor before the sync. */
export const HRIS_SYNC_WITH_HITL_DEFINITION: LangGraphDefinition = {
  name: 'Sync HRIS',
  description: 'Push the record to the external HRIS after approval.',
  state_schema: { fields: { record: { type: 'object', description: 'record' } } },
  entry_point: 'load_schema',
  nodes: [
    { id: 'load_schema', step_type: 'entity_tool', config: { tokens: ['@tools:describe:people'], entity: 'people', op: 'describe' } },
    { id: 'approve', step_type: 'human_input', config: { kind: 'approval', target: 'hr_admin' } },
    { id: 'sync', step_type: 'enrich', config: { tokens: ['@tool:hris_sync'], tool: 'hris_sync' } },
    { id: 'complete', step_type: 'end', config: {} },
  ],
  edges: [
    { from: 'load_schema', to: 'approve' },
    { from: 'approve', to: 'sync' },
    { from: 'sync', to: 'complete' },
  ],
};

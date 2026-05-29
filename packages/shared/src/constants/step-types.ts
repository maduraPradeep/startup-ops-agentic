// Phase 1a — LangGraph IR step-type whitelist (spec §4.5).

export const VALID_STEP_TYPES = [
  'collect',
  'enrich',
  'entity_tool',
  'notify',
  'start_agent',
  'condition',
  'human_input',
  'end',
] as const;

export type StepType = (typeof VALID_STEP_TYPES)[number];

export const STEP_TYPE_SET: ReadonlySet<string> = new Set(VALID_STEP_TYPES);

// Entity-tool operations that are inherently destructive (spec Appendix B).
// Destructive operations must have a human_input ancestor (Data Flow Validator).
export const DESTRUCTIVE_ENTITY_OPS: ReadonlySet<string> = new Set(['delete', 'terminate']);

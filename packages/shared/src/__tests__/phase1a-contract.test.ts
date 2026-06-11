import { describe, it, expect } from 'vitest';
import {
  LangGraphDefinitionSchema,
  ExecutionStateSchema,
  CompilationStageSchema,
  VALID_STEP_TYPES,
  STEP_TYPE_SET,
  DESTRUCTIVE_ENTITY_OPS,
  TOKEN_PREFIX_SET,
} from '../index';

describe('Phase 1a contract', () => {
  it('parses a minimal valid LangGraph definition and defaults config/description', () => {
    const parsed = LangGraphDefinitionSchema.parse({
      name: 'X',
      entry_point: 'a',
      nodes: [{ id: 'a', step_type: 'end' }],
      edges: [],
    });
    expect(parsed.description).toBe('');
    expect(parsed.nodes[0]!.config).toEqual({});
    expect(parsed.state_schema.fields).toEqual({});
  });

  it('keeps step_type permissive so the validator (not the parser) catches bad types', () => {
    const parsed = LangGraphDefinitionSchema.parse({
      name: 'X',
      entry_point: 'a',
      nodes: [{ id: 'a', step_type: 'frobnicate' }],
      edges: [],
    });
    expect(parsed.nodes[0]!.step_type).toBe('frobnicate');
    expect(STEP_TYPE_SET.has('frobnicate')).toBe(false);
  });

  it('exposes the spec ExecutionState union including both HITL states', () => {
    for (const s of ['awaiting_human_input', 'awaiting_approval', 'completed', 'cancelled']) {
      expect(ExecutionStateSchema.safeParse(s).success).toBe(true);
    }
    expect(ExecutionStateSchema.safeParse('approved').success).toBe(false);
  });

  it('exposes the 6 compilation stages', () => {
    expect(CompilationStageSchema.options).toEqual([
      'parse',
      'cache_check',
      'compile',
      'structural_validate',
      'data_flow_validate',
      'generate_flow',
    ]);
  });

  it('exposes step-type and token constants', () => {
    expect(VALID_STEP_TYPES).toContain('entity_tool');
    expect(DESTRUCTIVE_ENTITY_OPS.has('terminate')).toBe(true);
    expect(TOKEN_PREFIX_SET.has('tools')).toBe(true);
    expect(TOKEN_PREFIX_SET.has('tool')).toBe(true);
  });
});

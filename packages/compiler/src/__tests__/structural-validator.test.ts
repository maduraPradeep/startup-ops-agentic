import { describe, it, expect } from 'vitest';
import { validateStructural } from '../validators/structural-validator';
import { parseTokens } from '../parser/token-parser';
import { MockRegistry } from '../registry/mock-registry';
import {
  ADD_EMPLOYEE_DEFINITION,
  sqlInjectionDefinition,
  badStepTypeDefinition,
  agentScopeDefinition,
  unknownTokenInOutputDefinition,
} from '../llm/fixtures';
import { ADD_EMPLOYEE_SKILL } from '../llm/skill-fixtures';

const registry = new MockRegistry();
const parsed = parseTokens(ADD_EMPLOYEE_SKILL);

describe('structural validator', () => {
  it('accepts the canonical Add Employee definition', () => {
    expect(validateStructural(ADD_EMPLOYEE_DEFINITION, parsed, registry)).toBeNull();
  });

  it('rejects SQL/shell injection at structural_validate', () => {
    const err = validateStructural(sqlInjectionDefinition(), parsed, registry);
    expect(err?.stage).toBe('structural_validate');
    expect(err?.error_type).toBe('injection');
  });

  it('rejects an invalid step_type', () => {
    const err = validateStructural(badStepTypeDefinition(), parsed, registry);
    expect(err?.stage).toBe('structural_validate');
    expect(err?.error_type).toBe('invalid_step_type');
  });

  it('rejects an agent missing the required tool scope', () => {
    const err = validateStructural(agentScopeDefinition(), parsed, registry);
    expect(err?.stage).toBe('structural_validate');
    expect(err?.error_type).toBe('tool_scope');
    expect(err?.token_at_fault).toBe('@agent:hr_bot');
  });

  it('rejects a node referencing a token absent from the skill text', () => {
    const err = validateStructural(unknownTokenInOutputDefinition(), parsed, registry);
    expect(err?.stage).toBe('structural_validate');
    expect(err?.error_type).toBe('unknown_token');
    expect(err?.token_at_fault).toBe('@tools:describe:unicorns');
  });
});

import { describe, it, expect } from 'vitest';
import { validateDataFlow, type AuthorContext } from '../validators/data-flow-validator';
import { parseTokens } from '../parser/token-parser';
import { resolveTokens } from '../parser/token-resolver';
import { MockRegistry } from '../registry/mock-registry';
import {
  ADD_EMPLOYEE_DEFINITION,
  piiLeakDefinition,
  HRIS_SYNC_NO_HITL_DEFINITION,
  HRIS_SYNC_WITH_HITL_DEFINITION,
} from '../llm/fixtures';
import { ADD_EMPLOYEE_SKILL, HRIS_SYNC_SKILL } from '../llm/skill-fixtures';

const registry = new MockRegistry();
const employeeResolved = resolveTokens(parseTokens(ADD_EMPLOYEE_SKILL), registry);
const hrisResolved = resolveTokens(parseTokens(HRIS_SYNC_SKILL), registry);

const hrAdmin: AuthorContext = { role: 'hr_admin', permissions: ['notifications:broadcast'] };
const employee: AuthorContext = { role: 'employee', permissions: [] };

describe('data flow validator', () => {
  it('accepts the canonical Add Employee definition for an hr_admin author', () => {
    expect(validateDataFlow(ADD_EMPLOYEE_DEFINITION, employeeResolved, registry, hrAdmin)).toBeNull();
  });

  it('rejects PII flowing into a non-pii_safe tool', () => {
    const err = validateDataFlow(piiLeakDefinition(), employeeResolved, registry, hrAdmin);
    expect(err?.stage).toBe('data_flow_validate');
    expect(err?.error_type).toBe('pii');
    expect(err?.token_at_fault).toBe('@tool:linkedin_analyzer');
  });

  it('rejects @role:all broadcast when the author lacks notifications:broadcast', () => {
    const err = validateDataFlow(ADD_EMPLOYEE_DEFINITION, employeeResolved, registry, employee);
    expect(err?.stage).toBe('data_flow_validate');
    expect(err?.error_type).toBe('broadcast');
    expect(err?.token_at_fault).toBe('@role:all');
  });

  it('rejects a destructive tool with no human_input ancestor', () => {
    const err = validateDataFlow(HRIS_SYNC_NO_HITL_DEFINITION, hrisResolved, registry, hrAdmin);
    expect(err?.stage).toBe('data_flow_validate');
    expect(err?.error_type).toBe('destructive');
  });

  it('accepts a destructive tool that has a human_input ancestor', () => {
    expect(validateDataFlow(HRIS_SYNC_WITH_HITL_DEFINITION, hrisResolved, registry, hrAdmin)).toBeNull();
  });
});

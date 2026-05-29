import { describe, it, expect } from 'vitest';
import { scopeMatches } from '../validators/tool-scope-checker';

describe('agent tool-scope matching', () => {
  it('matches exact scopes', () => {
    expect(scopeMatches(['employees:create'], 'employees:create')).toBe(true);
  });

  it('matches wildcard scopes', () => {
    expect(scopeMatches(['employees:*'], 'employees:create')).toBe(true);
    expect(scopeMatches(['send:*'], 'send:email')).toBe(true);
  });

  it('matches the global wildcard', () => {
    expect(scopeMatches(['*'], 'anything:goes')).toBe(true);
  });

  it('rejects out-of-scope tools', () => {
    expect(scopeMatches(['employees:*', 'leave_requests:*'], 'payroll_update')).toBe(false);
    expect(scopeMatches(['employees:*'], 'expenses:create')).toBe(false);
  });
});

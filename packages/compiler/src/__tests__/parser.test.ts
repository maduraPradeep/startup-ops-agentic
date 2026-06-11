import { describe, it, expect } from 'vitest';
import { parseTokens } from '../parser/token-parser';
import { resolveTokens } from '../parser/token-resolver';
import { MockRegistry } from '../registry/mock-registry';
import { TokenError } from '../errors';
import { ADD_EMPLOYEE_SKILL } from '../llm/skill-fixtures';

describe('token parser', () => {
  it('classifies all five token kinds', () => {
    const tokens = parseTokens(ADD_EMPLOYEE_SKILL);
    const byRaw = new Map(tokens.map((t) => [t.raw, t]));

    expect(byRaw.get('@entity:people')?.kind).toBe('entity');
    expect(byRaw.get('@entity:people.linkedin_summary')?.kind).toBe('entity_field');
    expect(byRaw.get('@entity:people.linkedin_summary')?.field).toBe('linkedin_summary');
    expect(byRaw.get('@role:owner')?.kind).toBe('role');
    expect(byRaw.get('@agent:onboarding')?.kind).toBe('agent');
    expect(byRaw.get('@tool:linkedin_analyzer')?.kind).toBe('external_tool');

    const et = byRaw.get('@tools:describe:people');
    expect(et?.kind).toBe('entity_tool');
    expect(et?.op).toBe('describe');
    expect(et?.entity).toBe('people');
  });

  it('deduplicates repeated tokens', () => {
    const tokens = parseTokens('@role:owner and again @role:owner');
    expect(tokens.filter((t) => t.raw === '@role:owner')).toHaveLength(1);
  });

  it('fails fast on an unknown token kind', () => {
    expect(() => parseTokens('use @widget:sprocket')).toThrowError(TokenError);
    try {
      parseTokens('use @widget:sprocket');
    } catch (e) {
      expect((e as TokenError).token).toBe('@widget:sprocket');
      expect((e as TokenError).errorType).toBe('unknown_token_kind');
    }
  });

  it('rejects a malformed entity tool', () => {
    expect(() => parseTokens('@tools:describe')).toThrowError(/form @tools/);
  });
});

describe('token resolver', () => {
  const registry = new MockRegistry();

  it('resolves valid tokens with their context', () => {
    const resolved = resolveTokens(parseTokens(ADD_EMPLOYEE_SKILL), registry);
    const agent = resolved.find((r) => r.raw === '@agent:onboarding');
    expect(agent?.resolved.tool_scopes).toBeDefined();
    const tool = resolved.find((r) => r.raw === '@tool:linkedin_analyzer');
    expect(tool?.resolved.pii_safe).toBe(false);
  });

  it('fails fast on an unknown entity reference', () => {
    expect(() => resolveTokens(parseTokens('@entity:unicorn'), registry)).toThrowError(
      /Unknown entity/,
    );
  });

  it('fails fast on an unknown entity field', () => {
    expect(() => resolveTokens(parseTokens('@entity:people.nonexistent'), registry)).toThrowError(
      /no field/,
    );
  });

  it('fails fast on an unsupported entity-tool operation', () => {
    expect(() => resolveTokens(parseTokens('@tools:teleport:people'), registry)).toThrowError(
      /does not support operation/,
    );
  });
});

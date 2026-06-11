import { describe, it, expect } from 'vitest';
import type { ResolvedTokenContext } from '@ops/shared';
import { computeHash } from '../cache/compilation-cache';

describe('compilation cache hash', () => {
  const a: ResolvedTokenContext = { raw: '@entity:people', kind: 'entity', resolved: { entity: 'people' } };
  const b: ResolvedTokenContext = { raw: '@role:owner', kind: 'role', resolved: { name: 'owner' } };

  it('is a 64-char hex digest', () => {
    expect(computeHash('text', [a, b])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent over resolved tokens', () => {
    expect(computeHash('text', [a, b])).toBe(computeHash('text', [b, a]));
  });

  it('is stable across calls', () => {
    expect(computeHash('text', [a, b])).toBe(computeHash('text', [a, b]));
  });

  it('changes when the skill text changes', () => {
    expect(computeHash('text', [a, b])).not.toBe(computeHash('text!', [a, b]));
  });

  it('changes when a resolved token context changes', () => {
    const aPrime: ResolvedTokenContext = { ...a, resolved: { entity: 'people', extra: 1 } };
    expect(computeHash('text', [a, b])).not.toBe(computeHash('text', [aPrime, b]));
  });
});

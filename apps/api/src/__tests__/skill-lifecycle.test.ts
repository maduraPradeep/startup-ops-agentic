import { describe, expect, it } from 'vitest';
import {
  applyTransition,
  canTransition,
  IllegalSkillTransitionError,
  nextStatus,
  type SkillAction,
  type SkillStatus,
} from '../services/skill-lifecycle';

// Phase 1c — pure lifecycle state machine (spec §4.7): draft→compiled→validated→live→archived.

describe('skill-lifecycle nextStatus', () => {
  const cases: [SkillStatus, SkillAction, SkillStatus | null][] = [
    ['draft', 'compile', 'compiled'],
    ['compiled', 'validate', 'validated'],
    ['validated', 'publish', 'live'],
    ['live', 'publish', 'live'], // re-publish a newer candidate
    ['live', 'rollback', 'live'],
    ['live', 'compile', 'live'], // stage a new candidate without unpublishing
    ['draft', 'edit', 'draft'],
    ['compiled', 'edit', 'draft'], // editing invalidates the compilation
    ['validated', 'edit', 'draft'],
    ['live', 'archive', 'archived'],
    ['archived', 'restore', 'draft'],
  ];
  it.each(cases)('%s --%s--> %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });
});

describe('skill-lifecycle illegal transitions', () => {
  const illegal: [SkillStatus, SkillAction][] = [
    ['draft', 'validate'], // must compile first
    ['draft', 'publish'], // nothing to publish
    ['compiled', 'publish'], // must validate first
    ['draft', 'rollback'], // not live
    ['live', 'edit'], // text is locked while live
    ['archived', 'compile'], // archived is terminal except restore
    ['archived', 'publish'],
  ];
  it.each(illegal)('%s cannot %s', (from, action) => {
    expect(nextStatus(from, action)).toBeNull();
    expect(canTransition(from, action)).toBe(false);
    expect(() => applyTransition(from, action)).toThrow(IllegalSkillTransitionError);
  });
});

describe('applyTransition', () => {
  it('returns the target status for a legal action', () => {
    expect(applyTransition('validated', 'publish')).toBe('live');
  });

  it('carries the offending action + from-state on the error', () => {
    try {
      applyTransition('draft', 'publish');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalSkillTransitionError);
      const e = err as IllegalSkillTransitionError;
      expect(e.action).toBe('publish');
      expect(e.from).toBe('draft');
    }
  });
});

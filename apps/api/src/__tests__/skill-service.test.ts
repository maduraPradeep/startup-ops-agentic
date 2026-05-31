import { describe, expect, it } from 'vitest';
import { InMemorySkillStore } from '../services/skill-store';
import {
  IllegalSkillTransitionError,
  SkillConflictError,
  SkillNotFoundError,
  SkillPreconditionError,
  SkillService,
} from '../services/skill.service';

// Phase 1c — Skill lifecycle orchestration over the in-memory store (spec §4.7, PRD §8.4).

const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-0000000000ff';
const COMP_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMP_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function build() {
  const store = new InMemorySkillStore();
  return { store, skills: new SkillService(store) };
}

async function liveSkill(skills: SkillService) {
  const skill = await skills.create(TENANT, { name: 'Onboard', skillText: 'add an @entity:people' });
  await skills.markCompiled(TENANT, skill.id, COMP_A);
  await skills.validate(TENANT, skill.id);
  return skills.publish(TENANT, skill.id);
}

describe('SkillService.create', () => {
  it('creates a draft skill', async () => {
    const { skills } = build();
    const skill = await skills.create(TENANT, { name: 'Leave', skillText: 'when ...', authorRole: 'hr' });
    expect(skill.status).toBe('draft');
    expect(skill.tenant_id).toBe(TENANT);
    expect(skill.author_role).toBe('hr');
    expect(skill.live_compilation_id).toBeNull();
  });

  it('rejects a blank name', async () => {
    const { skills } = build();
    await expect(skills.create(TENANT, { name: '  ', skillText: 'x' })).rejects.toThrow(
      SkillPreconditionError,
    );
  });

  it('rejects a duplicate name within a tenant', async () => {
    const { skills } = build();
    await skills.create(TENANT, { name: 'Dup', skillText: 'a' });
    await expect(skills.create(TENANT, { name: 'Dup', skillText: 'b' })).rejects.toThrow(
      SkillConflictError,
    );
  });

  it('allows the same name in a different tenant', async () => {
    const { skills } = build();
    await skills.create(TENANT, { name: 'Shared', skillText: 'a' });
    await expect(skills.create(OTHER, { name: 'Shared', skillText: 'b' })).resolves.toBeDefined();
  });
});

describe('SkillService lifecycle happy path', () => {
  it('walks draft → compiled → validated → live and sets the live pointer', async () => {
    const { skills } = build();
    const draft = await skills.create(TENANT, { name: 'Onboard', skillText: 'add' });

    const compiled = await skills.markCompiled(TENANT, draft.id, COMP_A);
    expect(compiled.status).toBe('compiled');
    expect(compiled.compiled_compilation_id).toBe(COMP_A);

    const validated = await skills.validate(TENANT, draft.id);
    expect(validated.status).toBe('validated');

    const live = await skills.publish(TENANT, draft.id);
    expect(live.status).toBe('live');
    expect(live.live_compilation_id).toBe(COMP_A);
    expect(live.previous_compilation_id).toBeNull();
  });

  it('re-publishing a newer compilation demotes the old live to previous', async () => {
    const { skills } = build();
    const skill = await liveSkill(skills); // live on COMP_A

    // Stage + publish a new compilation while live.
    await skills.markCompiled(TENANT, skill.id, COMP_B);
    const republished = await skills.publish(TENANT, skill.id);
    expect(republished.live_compilation_id).toBe(COMP_B);
    expect(republished.previous_compilation_id).toBe(COMP_A);
  });

  it('rollback swaps live ↔ previous', async () => {
    const { skills } = build();
    const skill = await liveSkill(skills);
    await skills.markCompiled(TENANT, skill.id, COMP_B);
    await skills.publish(TENANT, skill.id); // live=B previous=A

    const rolled = await skills.rollback(TENANT, skill.id);
    expect(rolled.status).toBe('live');
    expect(rolled.live_compilation_id).toBe(COMP_A);
    expect(rolled.previous_compilation_id).toBe(COMP_B);
  });
});

describe('SkillService.update', () => {
  it('editing text resets a compiled skill to draft and clears the candidate', async () => {
    const { skills } = build();
    const skill = await skills.create(TENANT, { name: 'Onboard', skillText: 'add' });
    await skills.markCompiled(TENANT, skill.id, COMP_A);

    const edited = await skills.update(TENANT, skill.id, { skillText: 'add and notify' });
    expect(edited.status).toBe('draft');
    expect(edited.compiled_compilation_id).toBeNull();
    expect(edited.skill_text).toBe('add and notify');
  });

  it('renaming without a text change preserves the lifecycle state', async () => {
    const { skills } = build();
    const skill = await skills.create(TENANT, { name: 'Onboard', skillText: 'add' });
    await skills.markCompiled(TENANT, skill.id, COMP_A);

    const renamed = await skills.update(TENANT, skill.id, { name: 'Onboard v2' });
    expect(renamed.name).toBe('Onboard v2');
    expect(renamed.status).toBe('compiled');
  });

  it('rejects editing a live skill', async () => {
    const { skills } = build();
    const skill = await liveSkill(skills);
    await expect(skills.update(TENANT, skill.id, { skillText: 'changed' })).rejects.toThrow(
      IllegalSkillTransitionError,
    );
  });
});

describe('SkillService guards', () => {
  it('publish without a candidate is rejected', async () => {
    const { skills } = build();
    const skill = await skills.create(TENANT, { name: 'Onboard', skillText: 'add' });
    await skills.markCompiled(TENANT, skill.id, COMP_A);
    await skills.validate(TENANT, skill.id);
    // Force the candidate away to simulate a missing pointer (defensive guard).
    const store = (skills as unknown as { store: InMemorySkillStore }).store;
    await store.update(TENANT, skill.id, { compiledCompilationId: null });
    await expect(skills.publish(TENANT, skill.id)).rejects.toThrow(SkillPreconditionError);
  });

  it('validate before compile is an illegal transition', async () => {
    const { skills } = build();
    const skill = await skills.create(TENANT, { name: 'Onboard', skillText: 'add' });
    await expect(skills.validate(TENANT, skill.id)).rejects.toThrow(IllegalSkillTransitionError);
  });

  it('rollback without a previous compilation is rejected', async () => {
    const { skills } = build();
    const skill = await liveSkill(skills);
    await expect(skills.rollback(TENANT, skill.id)).rejects.toThrow(SkillPreconditionError);
  });

  it('archive then restore returns to draft', async () => {
    const { skills } = build();
    const skill = await liveSkill(skills);
    const archived = await skills.archive(TENANT, skill.id);
    expect(archived.status).toBe('archived');
    const restored = await skills.restore(TENANT, skill.id);
    expect(restored.status).toBe('draft');
  });

  it('operations on a missing / cross-tenant skill throw SkillNotFoundError', async () => {
    const { skills } = build();
    const skill = await skills.create(TENANT, { name: 'Onboard', skillText: 'add' });
    await expect(skills.get(OTHER, skill.id)).rejects.toThrow(SkillNotFoundError);
    await expect(skills.validate(TENANT, COMP_A)).rejects.toThrow(SkillNotFoundError);
  });
});

import {
  applyTransition,
  IllegalSkillTransitionError,
  type SkillStatus,
} from './skill-lifecycle';
import type { NewSkill, SkillRecord, SkillStore } from './skill-store';

// Phase 1c — Skill lifecycle orchestration (spec §4.7, PRD §8.4, deliverable #3).
//
// Owns the `draft → compiled → validated → live → archived` machine on top of SkillStore.
// Every mutation routes through the pure transition rules in skill-lifecycle.ts, then
// updates the row's status + the three compilation pointers (candidate / live / previous)
// that back publish and rollback. The store is interface-only so this is unit-tested with
// InMemorySkillStore and no DB.

export class SkillNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No skill with id ${id}`);
    this.name = 'SkillNotFoundError';
  }
}

export class SkillConflictError extends Error {
  constructor(public readonly name: string) {
    super(`A skill named '${name}' already exists`);
    this.name = 'SkillConflictError';
  }
}

/** A transition is legal but a required pointer is missing (e.g. publish with no candidate). */
export class SkillPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillPreconditionError';
  }
}

export { IllegalSkillTransitionError };

export interface CreateSkillInput {
  name: string;
  skillText: string;
  authorRole?: string | null;
}

export interface UpdateSkillInput {
  name?: string;
  skillText?: string;
}

export class SkillService {
  constructor(private readonly store: SkillStore) {}

  list(tenantId: string): Promise<SkillRecord[]> {
    return this.store.list(tenantId);
  }

  async get(tenantId: string, id: string): Promise<SkillRecord> {
    const skill = await this.store.findById(tenantId, id);
    if (!skill) throw new SkillNotFoundError(id);
    return skill;
  }

  async create(tenantId: string, input: CreateSkillInput): Promise<SkillRecord> {
    const name = input.name?.trim();
    if (!name) throw new SkillPreconditionError('name is required');
    if (typeof input.skillText !== 'string') {
      throw new SkillPreconditionError('skillText is required');
    }
    if (await this.store.findByName(tenantId, name)) throw new SkillConflictError(name);

    const newSkill: NewSkill = {
      name,
      skillText: input.skillText,
      authorRole: input.authorRole ?? null,
    };
    return this.store.insert(tenantId, newSkill);
  }

  /**
   * Edit a skill's name/text. Changing the text invalidates any prior compilation, so the
   * skill resets to `draft` and its candidate pointer is cleared (state machine `edit`).
   * Renaming alone (no text change) does not reset the lifecycle. Editing a `live` skill is
   * rejected — archive it or work on a copy first.
   */
  async update(tenantId: string, id: string, input: UpdateSkillInput): Promise<SkillRecord> {
    const skill = await this.get(tenantId, id);

    if (input.name !== undefined && input.name.trim() !== skill.name) {
      const nextName = input.name.trim();
      if (!nextName) throw new SkillPreconditionError('name cannot be empty');
      const clash = await this.store.findByName(tenantId, nextName);
      if (clash && clash.id !== id) throw new SkillConflictError(nextName);
    }

    const textChanged = input.skillText !== undefined && input.skillText !== skill.skill_text;
    if (!textChanged) {
      // Pure rename / no-op — lifecycle untouched.
      return this.applyPatch(tenantId, id, {
        name: input.name?.trim(),
      });
    }

    const status = this.transition(skill, 'edit'); // throws from `live`/`archived`
    return this.applyPatch(tenantId, id, {
      name: input.name?.trim(),
      skillText: input.skillText,
      status,
      compiledCompilationId: null, // stale candidate
    });
  }

  /**
   * Record that a successful compilation (id `compilationId`) is now bound to this skill.
   * Advances `draft|compiled|validated → compiled`; a `live` skill stays live but stages the
   * new compilation as its candidate so it can be re-published.
   */
  async markCompiled(tenantId: string, id: string, compilationId: string): Promise<SkillRecord> {
    const skill = await this.get(tenantId, id);
    const status = this.transition(skill, 'compile');
    return this.applyPatch(tenantId, id, { status, compiledCompilationId: compilationId });
  }

  /** `compiled → validated`: operator confirms the compiled graph. */
  async validate(tenantId: string, id: string): Promise<SkillRecord> {
    const skill = await this.get(tenantId, id);
    const status = this.transition(skill, 'validate');
    return this.applyPatch(tenantId, id, { status });
  }

  /**
   * `validated → live` (or re-publish a newer candidate on an already-live skill). Promotes
   * the candidate compilation to live and demotes the current live one to previous, so
   * rollback can restore it. In-flight executions pin their own compilation and are unaffected.
   */
  async publish(tenantId: string, id: string): Promise<SkillRecord> {
    const skill = await this.get(tenantId, id);
    const status = this.transition(skill, 'publish');
    if (!skill.compiled_compilation_id) {
      throw new SkillPreconditionError('Cannot publish: no compiled candidate for this skill');
    }
    return this.applyPatch(tenantId, id, {
      status,
      liveCompilationId: skill.compiled_compilation_id,
      previousCompilationId: skill.live_compilation_id,
    });
  }

  /** Swap `live ↔ previous` compilation pointers; stays `live`. */
  async rollback(tenantId: string, id: string): Promise<SkillRecord> {
    const skill = await this.get(tenantId, id);
    const status = this.transition(skill, 'rollback');
    if (!skill.previous_compilation_id) {
      throw new SkillPreconditionError('Cannot rollback: no previous compilation to restore');
    }
    return this.applyPatch(tenantId, id, {
      status,
      liveCompilationId: skill.previous_compilation_id,
      previousCompilationId: skill.live_compilation_id,
    });
  }

  /** Retire the skill (`* → archived`). */
  async archive(tenantId: string, id: string): Promise<SkillRecord> {
    const skill = await this.get(tenantId, id);
    const status = this.transition(skill, 'archive');
    return this.applyPatch(tenantId, id, { status });
  }

  /** Bring an archived skill back to `draft`. */
  async restore(tenantId: string, id: string): Promise<SkillRecord> {
    const skill = await this.get(tenantId, id);
    const status = this.transition(skill, 'restore');
    return this.applyPatch(tenantId, id, { status });
  }

  private transition(skill: SkillRecord, action: Parameters<typeof applyTransition>[1]): SkillStatus {
    return applyTransition(skill.status, action);
  }

  private async applyPatch(
    tenantId: string,
    id: string,
    patch: Parameters<SkillStore['update']>[2],
  ): Promise<SkillRecord> {
    const updated = await this.store.update(tenantId, id, patch);
    if (!updated) throw new SkillNotFoundError(id);
    return updated;
  }
}

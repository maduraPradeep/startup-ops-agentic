// Phase 1c — Skill lifecycle state machine (spec §4.7, deliverable #3).
//
// Pure, dependency-free transition rules so they can be unit-tested in isolation and
// reused by SkillService without touching a store. The graph:
//
//   draft ──compile──▶ compiled ──validate──▶ validated ──publish──▶ live
//     ▲                   │                       │                    │
//     └── edit text ──────┴───────────────────────┘            rollback│ (live → live)
//                                                                       │
//   (any non-archived) ──archive──▶ archived ──restore──▶ draft         ▼
//
// Editing skill text invalidates any prior compilation, so it always resets to `draft`.

export type SkillStatus = 'draft' | 'compiled' | 'validated' | 'live' | 'archived';

export const SKILL_STATUSES: readonly SkillStatus[] = [
  'draft',
  'compiled',
  'validated',
  'live',
  'archived',
] as const;

/** Named lifecycle actions an operator can take. */
export type SkillAction =
  | 'compile'   // a successful compilation bound to the skill
  | 'edit'      // skill text changed — invalidates compilation
  | 'validate'  // operator confirms the compiled graph
  | 'publish'   // make live (first time, or re-publish a newer compilation)
  | 'rollback'  // swap live ↔ previous compilation (stays live)
  | 'archive'   // retire the skill
  | 'restore';  // bring an archived skill back to draft

/** Allowed `from → to` states for each action. A missing entry ⇒ action illegal there. */
const TRANSITIONS: Record<SkillAction, Partial<Record<SkillStatus, SkillStatus>>> = {
  // Compiling is legal from any pre-live editing state and re-compiling a live skill
  // (which produces a new candidate compilation without unpublishing the live one).
  compile: { draft: 'compiled', compiled: 'compiled', validated: 'compiled', live: 'live' },
  // Editing text invalidates the compilation everywhere except archived/live.
  edit: { draft: 'draft', compiled: 'draft', validated: 'draft' },
  validate: { compiled: 'validated' },
  publish: { validated: 'live', live: 'live' },
  rollback: { live: 'live' },
  archive: { draft: 'archived', compiled: 'archived', validated: 'archived', live: 'archived' },
  restore: { archived: 'draft' },
};

export class IllegalSkillTransitionError extends Error {
  constructor(
    public readonly action: SkillAction,
    public readonly from: SkillStatus,
  ) {
    super(`Cannot ${action} a skill in '${from}' state`);
    this.name = 'IllegalSkillTransitionError';
  }
}

/** The resulting status for an action, or `null` if the action is illegal from `from`. */
export function nextStatus(from: SkillStatus, action: SkillAction): SkillStatus | null {
  return TRANSITIONS[action][from] ?? null;
}

export function canTransition(from: SkillStatus, action: SkillAction): boolean {
  return nextStatus(from, action) !== null;
}

/** Like {@link nextStatus} but throws {@link IllegalSkillTransitionError} when illegal. */
export function applyTransition(from: SkillStatus, action: SkillAction): SkillStatus {
  const to = nextStatus(from, action);
  if (to === null) throw new IllegalSkillTransitionError(action, from);
  return to;
}

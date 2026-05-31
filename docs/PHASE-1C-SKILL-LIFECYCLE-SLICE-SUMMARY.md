# Phase 1c — Skill Lifecycle Slice — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** Deliverables #3 + #4 (and the #10 pointer-swap mechanism) of `PHASE-1C-SKILL-EXECUTION.md`
/ PRD §8.4 — the operator-facing **skill lifecycle**: `draft → compiled → validated → live →
archived`, the CRUD + transition HTTP routes, and the live/previous compilation pointers that back
publish and rollback. **Out of scope (later slices):** `fork/:id` (lands with default skills #7),
in-flight execution pinning (lands with the TS↔Python execution bridge), and the `SkillEditor`
lifecycle UI (#11).

---

## 1. What was delivered

```
skill-lifecycle.ts   Pure, dependency-free state machine: SkillStatus + SkillAction, a
                     TRANSITIONS table, nextStatus/canTransition/applyTransition, and
                     IllegalSkillTransitionError. No store, no I/O — unit-tested in isolation.
skill-store.ts       SkillStore interface + PostgresSkillStore + InMemorySkillStore over the
                     `skills` table. Patch writes go through a fixed camelCase→column allowlist
                     (raw identifiers never reach SQL). tenant-scoped reads/writes.
skill.service.ts     SkillService — orchestrates the machine over the store: create/list/get/
                     update + markCompiled/validate/publish/rollback/archive/restore. Maps the
                     three compilation pointers (candidate/live/previous) on each transition.
skill.controller.ts  Adds CRUD + lifecycle handlers; compile now threads skill_id and, on a
                     successful skill-bound compile, calls markCompiled (best-effort).
routes/skills        GET / · POST / · GET /:id · PATCH /:id · POST /:id/{validate,publish,
                     rollback,archive,restore} (+ existing /compile, /tokens/resolve).
migration 006        skills.status (CHECK-constrained) + compiled/live/previous_compilation_id
                     FKs (ON DELETE SET NULL) + idx_skills_status. Idempotent.
```

## 2. The state machine (spec §4.7)

```
draft ──compile──▶ compiled ──validate──▶ validated ──publish──▶ live
  ▲                   │                        │                   │
  └──── edit ─────────┴────────────────────────┘          rollback │ (live → live, swap pointers)
                                                                   │
 (draft|compiled|validated|live) ──archive──▶ archived ──restore──▶ draft
```

- **`compile`** is legal from `draft|compiled|validated` (→ `compiled`) and from `live` (stays
  `live`, staging a new candidate without unpublishing the running version).
- **`edit`** (changing skill text) invalidates the compilation and resets to `draft`; it is
  **rejected on a `live` skill** (text is locked — archive or work on a copy). A pure rename leaves
  the lifecycle untouched.
- **`publish`** promotes `compiled_compilation_id` → `live_compilation_id` and demotes the current
  live one → `previous_compilation_id`. Re-publishing a newer candidate on an already-live skill is
  allowed.
- **`rollback`** swaps `live ↔ previous` (stays `live`).

Illegal transitions throw `IllegalSkillTransitionError` (HTTP 409); legal-but-unsatisfiable ones
(publish with no candidate, rollback with no previous) throw `SkillPreconditionError` (HTTP 400).

## 3. Compilation linkage

`SkillCompilerService.compile` gained an optional `skillId` and now returns
`{ result, compilationId }`; `CompilationStore.save(tenant, result, skillId?)` returns the persisted
`skill_compilations.id` (null for the failed-compilation sentinel) and binds `skill_id`. When the
compile endpoint receives a `skill_id`, a successful compile advances the skill to `compiled` and
stages the new compilation as the publish candidate — **best-effort**: a missing/illegal skill is
logged, never turning a valid compilation into an HTTP error. The stateless compile path (no
`skill_id`) is unchanged.

## 4. Conventions kept

- **Interface-first, in-memory-tested.** `SkillService` depends only on `SkillStore`; the lifecycle
  is fully exercised with `InMemorySkillStore` and no DB (mirrors `EntityService`/`EntityStore`).
- **Graceful degradation.** No DB → `InMemorySkillStore` is decorated as `fastify.skills`, so the
  routes work in dev/CI without Postgres.
- **Injection-safe SQL.** Table/column identifiers come only from a fixed allowlist; all values are
  parameterized.
- **App-layer tenant scoping** with RLS as the net (skills already under `tenant_isolation` in 005).

## 5. Files

| Area | File | Change |
|------|------|--------|
| State machine | `apps/api/src/services/skill-lifecycle.ts` | **new** |
| Store | `apps/api/src/services/skill-store.ts` | **new** |
| Service | `apps/api/src/services/skill.service.ts` | **new** |
| Controller | `apps/api/src/controllers/skill.controller.ts` | CRUD + lifecycle + compile linkage |
| Routes | `apps/api/src/routes/skills/index.ts` | CRUD + transition routes |
| Compile | `apps/api/src/services/skill-compiler.service.ts` | `skillId`, `CompileOutcome` |
| Compile store | `apps/api/src/services/compilation-store.ts` | `skillId`, returns id |
| Wiring | `apps/api/src/plugins/platform.plugin.ts` | `SkillStore` + `fastify.skills` |
| Migration | `supabase/migrations/006_skill_lifecycle.sql` | **new** |
| Tests | `apps/api/src/__tests__/skill-lifecycle.test.ts` | **new** (20) |
| Tests | `apps/api/src/__tests__/skill-service.test.ts` | **new** (15) |
| Tests | `apps/api/src/__tests__/skill-compiler.test.ts` | updated for `CompileOutcome` |

## 6. Verify

- `pnpm -r typecheck` — green.
- `pnpm --filter @ops/api test` — **105 passed | 6 skipped** (+35 new: 20 lifecycle, 15 service).
- Migrations `001`–`006` apply clean against local Supabase (`:54322`); `006` is idempotent.

## 7. Next

- **TS↔Python execution bridge** (`skill-executor.service.ts`) — trigger a `live` skill's
  `live_compilation_id` → Python runtime; pins the compilation for in-flight executions (#5/#10).
- **Default skills + fork** (#7): author Leave Request / Employee Onboarding as `default_skills`
  rows; `POST /admin/skills/fork/:id` clones into a tenant `skills` row (draft) with traceability.
- **`SkillEditor` lifecycle controls** (#11) on top of these routes.

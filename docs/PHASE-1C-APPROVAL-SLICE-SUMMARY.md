# Phase 1c — Single-Role Approval Slice (Summary)

**Status:** Done. **Scope:** deliverable #8 — the single-role approval HTTP flow that resolves an
`awaiting_approval` gate. The execution bridge (deliverable #4) already parks a run at
`awaiting_approval` and exposes a generic `resume`; this slice adds the approval-specific route,
the single-role authorization check, and an approval audit trail. **TS-only** — the Python runtime
needs no change (resume already advances past the interrupt).

## What this slice does

```
POST /api/v1/admin/skills/executions/:execId/approve   body: { decision?: 'approve'|'reject', comment? }
  → load execution (tenant-scoped)
  → read the live runtime snapshot — must be `awaiting_approval` (else 409), yields the paused node
  → enforce single-role gate: paused node's config.approver_role (fallback config.target) must
    match the approver's role when set (else 403); unset ⇒ any tenant user may resolve it
  → append an audit entry to context._approvals { node, by, role, decision, comment?, at }
  → approve: runtime.resume(execId) → persist new state (one step)
    reject:  mark execution `cancelled` + finished_at, no resume
```

The route lives on the **new execution surface** (`/admin/skills/executions/...`), not the legacy
Directus `/workflows/:id/approve` route — that controller still targets the old model and is being
retired. `decision` defaults to `'approve'`; an invalid value is a 400.

## TypeScript (`apps/api`)

- **`services/skill-executor.service.ts`** — `SkillExecutorService.approve(tenantId, execId,
  approver, { decision, comment })`. New typed errors: `ExecutionNotAwaitingApprovalError` (409),
  `ApprovalForbiddenError` (403). New types `Approver`, `ApprovalDecision`, `ApprovalAudit`.
  `enforceApproverRole` reads the paused node from the pinned compilation via the existing
  `CompilationReader`. `persist` gained an optional `extraContext` merge; `resume` now forwards any
  prior `_approvals` so the audit survives a later plain resume (graph state never carries it).
- **`controllers/skill.controller.ts`** — `approveExecution` reads the approver identity from
  `request.user` (`userId`/`role`, set by the auth plugin), validates `decision`, maps the new
  errors (409/403) in the shared `sendError`.
- **`routes/skills/index.ts`** — `POST /executions/:execId/approve` (after `/resume`).

## Design notes

- **Source of truth for "is it at a gate?"** is the runtime snapshot (`runtime.get`), because it
  carries the paused node id; the persisted row only has `state`. Runtime unreachable ⇒ 502
  (`ExecutionRuntimeError`), consistent with trigger/resume.
- **Single-role** means an exact role match when the gate names a role; a gate with no role is
  resolvable by any authenticated tenant user (best-effort, forward-compatible — the IR schema
  keeps node `config` permissive/passthrough, so `approver_role` rides there).
- **Reject is terminal** (`cancelled`), distinct from a generic resume; in-flight pinning is
  unaffected (the run already pinned its `compilation_id` at trigger time).

## Tests / verified

- `__tests__/skill-executor.test.ts`: +5 tests — approve → completed + audit; reject → cancelled,
  no resume, audit; role mismatch → `ApprovalForbiddenError`; not-awaiting-approval → 409;
  unknown/cross-tenant → 404.
- `pnpm --filter @ops/api test` **119 passed | 6 skipped**; `pnpm -r typecheck` green.

## Not in this slice

Real-time state streaming (WebSocket/SSE → frontend, deliverable #7), default skills + fork (#6),
compilation cache-at-rest (#5), and the frontend `ApprovalCard`/`WorkflowStatusCard` controls.

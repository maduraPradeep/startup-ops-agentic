# Phase 1c — Skill Execution (Planning)

**Goal:** Make compiled skills actually run. Promote the Phase 1a `GraphBuilder`/`ExecutionRunner`
from in-memory mocks to a real LangGraph service with Postgres checkpointing, the full skill
lifecycle, the `ExecutionState` machine over the wire, compilation caching at rest, default
skills, real-time updates, single-role approvals, and rollback.

**Spec reference:** §4.7–4.9 (lifecycle, execution, DB), §7 (workflow engine), Phase 1c.

---

## Builds directly on Phase 1a / 1b

| Asset | How Phase 1c uses it |
|-------|----------------------|
| `GraphBackend` abstraction | ✅ `LangGraphBackend` now executes a real `StateGraph`; in-memory stays the default/fallback. |
| `InMemoryCheckpointer` | ✅ `PostgresSaver` (langgraph checkpointer) wired against the Phase 1b Supabase DB; `MemorySaver` for tests. |
| `ExecutionRunner` + `ExecutionState` | Drive the real runtime; publish each transition. |
| `skill_compilations` / `skill_executions` tables (1b) | Persist compilations and pin `compilation_id` at trigger time. |
| Canonical "Add Employee" IR | First real end-to-end execution. |

---

## Deliverables

1. **Real LangGraph runtime** — ✅ **Done (2026-05-30).** Installed `langgraph==0.6.8` +
   `langgraph-checkpoint-postgres==2.0.24` (+ `psycopg`/`psycopg-pool`). `LangGraphBackend` now
   builds a real `StateGraph` over a permissive dict-state (default overwrite reducer — the
   slice-#2 handlers emit full-value deltas, so no custom reducer is needed) and registers the
   slice-#2 handler closures unchanged via `add_node`. `human_input` nodes compile as
   `interrupt_before` points: a run **pauses** there and **resumes from the checkpoint** on
   `invoke(None, {thread_id})`; the paused node's `config.kind` maps to `AWAITING_APPROVAL`
   (`approval`) vs `AWAITING_HUMAN_INPUT`, exactly as the custom runner does. A thin
   `LangGraphExecutor` drives a compiled graph and exposes `ExecutionState` + merged state + pause
   point. Checkpointing: `MemorySaver` for tests, langgraph's `PostgresSaver` for production
   against the Phase 1b Supabase DB (DSN from `LANGGRAPH_DB_URL`/`SUPABASE_DB_URL`/`DATABASE_URL`,
   local `:54322` fallback) — its own `checkpoint*` tables (`.setup()`), kept **separate** from our
   `skill_executions` index (untouched this slice). Graceful degradation preserved: when
   `langgraph` is absent, the in-memory backend stays the default and all existing tests pass; the
   langgraph + PostgresSaver tests skip-not-fail (gated on `langgraph_available()` / DB
   reachability). See `PHASE-1C-RUNTIME-SLICE-SUMMARY.md`.
2. **Step handlers** — ✅ **Done (2026-05-30).** Implemented each side-effecting `step_type`
   (`collect`, `enrich`, `entity_tool`, `notify`, `start_agent`, `condition`) as backend-agnostic
   closures over `(node, context)` returning a state delta; `human_input`/`end` are control no-ops.
   Side effects go through injected `Protocol` ports (`EntityClient`/`ToolClient`/`Notifier`/
   `AgentClient`) bundled in an `ExecutionContext`, with in-memory fakes as the default. The runner
   now invokes each handler and merges its delta before checkpointing, preserving one-checkpoint-
   per-node. See `PHASE-1C-STEP-HANDLERS-SLICE-SUMMARY.md`. _(No real langgraph runtime / no
   PostgresSaver yet — that is deliverable #1, the next slice.)_
3. **Skill lifecycle** — `draft → compiled → validated → live → archived` (spec §4.7).
4. **`ExecutionState` machine over the wire** — distinguish `awaiting_human_input` vs
   `awaiting_approval`; persist `current_state` on `skill_executions`.
5. **Compilation cache at rest** — move the in-memory cache to the `skill_compilations` table
   keyed by `compilation_hash` with a 7-day window (spec §4.4 caching SQL).
6. **Default skills** — author Leave Request & Employee Onboarding as `default_skills` rows;
   implement fork (`POST /admin/skills/fork/:id`) with traceability fields.
7. **Real-time** — WebSocket + SSE fallback; Redis pub/sub → execution state updates → frontend.
8. **Single-role approval flow** — `POST /workflows/:id/approve` resolves `awaiting_approval`.
9. **Rollback** — `live_compilation_id` / `previous_compilation_id` swap; in-flight executions
   unaffected (pinned compilation).

---

## Key files to create / change

| Area | Files |
|------|-------|
| Runtime | ✅ `graph_builder/handlers.py` (closures); ✅ `graph_builder/langgraph_backend.py` (real `StateGraph`) + `graph_builder/langgraph_executor.py` (run/resume) |
| Checkpointer | ✅ `graph_builder/postgres_checkpointer.py` (langgraph's `PostgresSaver` binding + DSN/reachability helpers); `MemorySaver` for tests |
| Service bridge | `apps/api/src/services/skill-executor.service.ts` (trigger → call Python → stream state) |
| Lifecycle | `routes/skills/{publish,validate,rollback,execute,fork}.ts` |
| Real-time | `plugins/websocket.plugin.ts` (user-msg vs ping handling), SSE route |
| Web | `SkillEditor` lifecycle controls; `WorkflowStatusCard`, `ApprovalCard` |

---

## Execution flow (spec §4.8)

```
1. Load skill.live_compilation_id → langgraph_def
2. Python GraphBuilder.validate(definition)
3. build_graph(definition) → StateGraph (LangGraphBackend)
4. Execute node by node; update ExecutionState each transition
5. Pause at human_input → awaiting_human_input (data) | awaiting_approval (auth gate)
6. Resume from checkpoint
7. Checkpoint to Postgres after each node
8. Publish state → Redis → WebSocket → frontend
9. On error: retry 3× (1s/2s/4s) → retrying → error
10. On completion: completed, notify author
```

---

## Tests / acceptance

- The Phase 1a runner tests carry over; add handler-level tests per step type.
- "Add Employee" runs end to end against a real `langgraph` + `PostgresSaver`, pausing at the
  LinkedIn `human_input` and resuming.
- Approval: an execution parks at `awaiting_approval`; `POST /approve` advances it.
- Rollback: publishing v2 then rolling back restores v1; an execution started on v2 finishes on v2.
- WebSocket: a revoked `jti` cannot connect (carried from 1b); state updates stream live.

---

## Risks

- **Handler correctness** — each step type is new surface; test in isolation before wiring.
- **Checkpoint compatibility** — langgraph's `PostgresSaver` schema vs our `skill_executions`;
  keep them separate (checkpoints are langgraph-owned; `skill_executions` is our index).
- **Retry/error semantics** — make transient vs permanent classification explicit (spec §11.6).

---

## Exit criteria → Phase 1d

A live skill executes end to end with real LangGraph, pauses for input and approval, checkpoints
to Postgres, streams state to the UI, and can be rolled back safely.

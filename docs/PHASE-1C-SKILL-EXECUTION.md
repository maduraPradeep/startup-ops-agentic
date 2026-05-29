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
| `GraphBackend` abstraction | Swap `InMemoryBackend` → `LangGraphBackend` (already written, guarded). |
| `InMemoryCheckpointer` | Swap → `PostgresSaver` (langgraph checkpointer) against the Phase 1b DB. |
| `ExecutionRunner` + `ExecutionState` | Drive the real runtime; publish each transition. |
| `skill_compilations` / `skill_executions` tables (1b) | Persist compilations and pin `compilation_id` at trigger time. |
| Canonical "Add Employee" IR | First real end-to-end execution. |

---

## Deliverables

1. **Real LangGraph runtime** — install `langgraph`, enable `LangGraphBackend`, `PostgresSaver`.
2. **Step handlers** — implement each `step_type`: `collect`, `enrich`, `entity_tool`, `notify`,
   `start_agent`, `condition`, `human_input`, `end` (Phase 1a runner currently no-ops them).
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
| Runtime | `services/langgraph/graph_builder/handlers/*.py` (one per step type), wire into `builder.py` `_make_handler` |
| Checkpointer | `services/langgraph/graph_builder/postgres_checkpointer.py` (or langgraph's `PostgresSaver`) |
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

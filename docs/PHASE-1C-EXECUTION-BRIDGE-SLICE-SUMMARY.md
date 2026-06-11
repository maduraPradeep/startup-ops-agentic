# Phase 1c — Skill Execution Bridge Slice (Summary)

**Status:** Done. **Scope:** the TS↔Python execution bridge (PRD §"Key files → Service bridge"),
which lands **deliverable #4** (`ExecutionState` machine over the wire + persist `current_state`
on `skill_executions`). Runs a *live* skill's `live_compilation_id` against the Python runtime and
records the run.

## What this slice does

Triggering a live skill now actually executes its compiled graph:

```
POST /api/v1/admin/skills/:id/execute
  → load skill (must be `live` + have live_compilation_id)
  → read that compilation's langgraph_def from skill_compilations
  → insert a skill_executions row (state=running) — its id is the shared execution id
  → POST it to the Python runtime → run to completion or the first human_input/approval pause
  → persist the returned state + merged context (finished_at stamped on terminal states)

POST /api/v1/admin/skills/executions/:execId/resume
  → advance the parked run past exactly one interrupt (provide input / approve)

GET  /api/v1/admin/skills/executions            → list this tenant's runs
GET  /api/v1/admin/skills/executions/:execId    → one run
```

The run **pins** the `compilation_id` it started on, so a later publish/rollback never disturbs an
in-flight execution (spec §4.9). One id threads TS → Python → langgraph checkpoint: the
`skill_executions` row id is sent as the runtime `execution_id`/`thread_id`.

## Python (`services/langgraph`)

- **`graph_builder/execution_service.py`** — `ExecutionService`, an in-process run registry. `start`
  builds the graph via `build_graph` and runs it; `resume` advances past one interrupt; `get`
  reports the snapshot. Backend selection mirrors the suite's graceful degradation: real
  `LangGraphBackend` + checkpointer when `langgraph` is installed, else the Phase 1a in-memory
  `ExecutionRunner` (always available) — pause/resume is **single-step** either way, so an approval
  gate resolves one decision at a time. Returns an `ExecutionSnapshot`
  (`execution_id, state, data, paused_node, paused_kind, backend`). Invalid IR raises `ValueError`.
  _Known limitation:_ the compiled-graph object is in-process; a restart drops in-flight runs even
  though the langgraph checkpoint persists. Durable rehydration is future work.
- **`main.py`** — `POST /executions`, `POST /executions/{id}/resume`, `GET /executions/{id}`
  (400 on bad IR, 404 on unknown id), backed by a module-level `ExecutionService()`.
- **Tests** — `tests/test_execution_service.py`: 10 service/HTTP tests on the in-memory backend
  (pause→resume→completed, condition branches, idempotent terminal resume, unknown→KeyError,
  bad IR→ValueError, FastAPI TestClient round-trip + 404/400) + 1 langgraph-gated test.
  **40 passed, 7 skipped.**

## TypeScript (`apps/api`)

- **`services/skill-executor.service.ts`** — `SkillExecutorService` orchestration over three
  injected ports: `SkillExecutionRuntime` (HTTP to Python), `CompilationReader`
  (`skill_compilations` read side), and `ExecutionStore`. Typed errors:
  `SkillNotExecutableError` (409), `CompilationNotFoundError`/`ExecutionNotFoundError` (404),
  `ExecutionRuntimeError` (502 — the runtime is unreachable, distinct from a clean run result).
- **`services/execution-store.ts`** — `ExecutionStore` over `skill_executions`
  (`PostgresExecutionStore`/`InMemoryExecutionStore`), kept separate from langgraph's own
  `checkpoints*` tables.
- **`services/langgraph-runtime.ts`** — `HttpSkillExecutionRuntime`, the port's HTTP binding
  (`LANGGRAPH_URL`/`LANGGRAPH_API_KEY`, injectable `fetch`).
- **`services/compilation-store.ts`** — `PostgresCompilationStore` now also implements
  `CompilationReader.findLangGraphDef`; `NullCompilationReader` is the no-DB fallback.
- **Wiring** — `platform.plugin.ts` decorates `fastify.skillExecutor` (Postgres stores +
  `HttpSkillExecutionRuntime` with a DB; in-memory store + `NullCompilationReader` without).
  Routes added in `routes/skills/index.ts`; handlers + error mapping in `skill.controller.ts`.
- **Tests** — `__tests__/skill-executor.test.ts`: 9 tests (live trigger persists the paused run +
  shared id + initial state; not-live→409; missing/cross-tenant skill→404; no stored graph→404;
  runtime failure marks `error` + rethrows; resume→completed stamps `finished_at`; get/list +
  tenant scoping). **114 passed | 6 skipped.**

## Verified

`pnpm -r typecheck` green; `pnpm --filter @ops/api test` 114/6; `python -m pytest` 40/7. Live HTTP
smoke (uvicorn): add-employee `POST /executions` → `awaiting_human_input` at `ask_linkedin` →
`resume` → `completed` with a created employee id.

## Not in this slice

Real-time state streaming (WebSocket/SSE → frontend, deliverable #7), the single-role approval
*HTTP* flow (`POST /workflows/:id/approve`, #8) — the runtime already parks at `awaiting_approval`
and `resume` advances it; this slice exposes resume, not the approval-specific route — default
skills + fork (#6), and compilation cache-at-rest (#5). Frontend execution controls
(`WorkflowStatusCard`/`ApprovalCard`) are also pending.

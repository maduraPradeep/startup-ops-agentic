# Phase 1c — Real LangGraph Runtime Slice — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** Deliverable #1 of `PHASE-1C-SKILL-EXECUTION.md` — promote the guarded `LangGraphBackend`
to a **real, executing langgraph runtime**: install `langgraph`, build/compile a real `StateGraph`
from the IR, register the slice-#2 handler closures unchanged, pause/resume at `human_input` via
langgraph interrupts, and checkpoint with `MemorySaver` (tests) / `PostgresSaver` (production,
Supabase). The slice-#2 step handlers and `Protocol` ports carry over **with zero changes** — only
the backend binding, the executor, and the checkpointer are new. **Out of scope (next slices):**
skill lifecycle states (#3–#4), compilation-cache-at-rest (#5), default-skill fork (#6), real-time
WS/SSE (#7), the approval HTTP route (#8), rollback (#9), and the TS↔Python service bridge.

---

## 1. What was delivered

```
LangGraphBackend      builds a real StateGraph over a permissive dict-state; registers the
                      slice-#2 handler closures via add_node; wires normal + conditional edges
                      (reusing _make_router) and END; human_input nodes -> interrupt_before
LangGraphCompiledGraph  wraps the compiled Pregel runnable + static topology so it still
                      satisfies CompiledGraph (entry_point/successors/node_ids) for the executor
LangGraphExecutor     drives a compiled graph: run() / resume(); reports ExecutionState, merged
                      state, and the paused human_input node (AWAITING_APPROVAL vs AWAITING_HUMAN_INPUT)
postgres_checkpointer  PostgresSaver binding (DSN from env + local :54322 fallback), .setup(),
                      DB-reachability probe for skip-not-fail test gating
```

**How it executes.** `build_graph(definition, backend=LangGraphBackend(), checkpointer=…)` adds
each node's slice-#2 closure (`node(state) -> delta`) via `StateGraph.add_node`, wires edges
(`"end"` → langgraph `END`) and conditional edges (the existing `_make_router` + a path map), sets
the entry point, and `compile()`s with a checkpointer (defaulting to an in-process `MemorySaver`).
The dict-state uses langgraph's **default overwrite reducer** — the slice-#2 handlers already emit
full-value deltas (e.g. `notify` reads then re-emits the whole `notifications_sent` list), so
last-write-wins is exactly correct and no custom reducer is needed.

**Pause/resume.** `human_input` nodes are collected during `build_graph` (via `backend.mark_interrupt`)
and compiled as `interrupt_before=[…]`. `LangGraphExecutor.run()` calls `invoke(initial, {thread_id})`;
if it parks, `get_state(config).next` names the pending `human_input` node, whose `config.kind` maps
to `AWAITING_APPROVAL` (`approval`) or `AWAITING_HUMAN_INPUT` — identical to the custom
`ExecutionRunner`. `resume()` calls `invoke(None, {thread_id})`, continuing from the **persisted
checkpoint** on the same `thread_id`, and loops so a graph with several human_input nodes drains to
`COMPLETED`.

**Checkpointers.** `MemorySaver` for tests; langgraph's `PostgresSaver` for production against the
Phase 1b Supabase DB. `PostgresSaver` owns its own `checkpoints` / `checkpoint_blobs` /
`checkpoint_writes` / `checkpoint_migrations` tables (created by `.setup()`) — **separate from our
`skill_executions` index, which is untouched this slice.**

**Graceful degradation.** Every langgraph import stays guarded (`langgraph_available()`) or lazy.
When `langgraph` is absent the in-memory backend remains the default, the package still imports, and
the Phase 1a/1c in-memory tests all pass; the langgraph + PostgresSaver tests skip-not-fail (gated
on `langgraph_available()` and DB reachability) — the same convention as the rest of the suite.

---

## 2. Files added / changed (`services/langgraph`)

| Area | File | Responsibility |
|------|------|----------------|
| Backend | `graph_builder/langgraph_backend.py` | Real `StateGraph` build + compile; `default_state_type()`; `mark_interrupt`; `LangGraphCompiledGraph` topology+runnable wrapper; guarded import + `langgraph_available()` |
| Executor | `graph_builder/langgraph_executor.py` *(new)* | `LangGraphExecutor`: run/resume a compiled langgraph graph; map pause → `AWAITING_*`; expose `ExecutionState` + merged state |
| Checkpointer | `graph_builder/postgres_checkpointer.py` *(new)* | `PostgresSaver` binding (`postgres_saver()` ctx mgr + `.setup()`), `resolve_dsn()`, `postgres_reachable()` |
| Builder | `graph_builder/builder.py` | Mark `human_input` nodes as interrupts when the backend supports it (`mark_interrupt`) |
| Exports | `graph_builder/__init__.py` | export `LangGraphBackend`, `LangGraphCompiledGraph`, `LangGraphExecutor`, `langgraph_available`, `default_state_type` |
| Deps | `requirements.txt` | `langgraph==0.6.8`, `langgraph-checkpoint-postgres==2.0.24`, `psycopg[binary]==3.2.10`, `psycopg-pool==3.2.6` |
| Tests | `tests/test_langgraph_runtime.py` *(new, 5 tests)* | add-employee end-to-end on the real backend; pause→resume (data + approval); condition routes both branches; `PostgresSaver` persist+resume (DB-gated) |

---

## 3. Design notes

- **Handlers reused verbatim.** A handler is still a plain `state -> delta` closure built by the
  single construction point `_make_handler` → `handlers.make_handler`. The real backend registers
  the identical callables via `StateGraph.add_node` — no handler logic changed for langgraph.
- **One backend API, two implementations.** `LangGraphBackend` implements the same `GraphBackend`
  ABC as `InMemoryBackend`, so `build_graph` is backend-agnostic. The only addition is the optional
  `mark_interrupt` hook (duck-typed via `getattr`) so the in-memory backend needs no change.
- **Topology + runtime in one object.** `LangGraphCompiledGraph` carries both the live Pregel
  `runnable` and the static topology, so it satisfies the `CompiledGraph` interface (entry point,
  successors) used by the existing build tests *and* gives the executor a handle to invoke.
- **Coexistence, not replacement.** The custom-walker `ExecutionRunner` is unchanged and all its
  tests stay green; `LangGraphExecutor` is the parallel langgraph path with the same observable
  semantics (state machine, pause mapping, resume-from-checkpoint).
- **Checkpoint isolation.** langgraph's checkpoint tables are created and owned by `PostgresSaver`;
  this slice does not read or write `skill_executions` (that index is wired in later deliverables).

---

## 4. Verify

```
cd services/langgraph && .venv/bin/python -m pytest        # 36 passed in ~1.3s (0 skipped)
```

In this environment `langgraph` is installed and the local Supabase Postgres (`:54322`) is
reachable, so **all langgraph runtime tests ran** (including the `PostgresSaver` persist+resume leg)
— nothing skipped. The previously-skipped `test_langgraph_backend_satisfies_interface` now runs.
Where `langgraph` is absent or the DB is down, those tests skip-not-fail and the in-memory suite
still passes (verified by simulating a blocked `langgraph` import: package imports,
`langgraph_available() == False`, add-employee runs to `completed` on the in-memory path).

## 5. Deferred / next

- **#3–#4 Skill lifecycle + `ExecutionState` over the wire** — persist `current_state` on
  `skill_executions`; `draft → compiled → validated → live → archived`.
- **#5 Compilation cache at rest** — `skill_compilations` table keyed by `compilation_hash`.
- **#6 Default skills + fork** — `default_skills` rows + `POST /admin/skills/fork/:id`.
- **#7 Real-time** — WebSocket + SSE; Redis pub/sub → execution state → frontend.
- **#8 Approval HTTP route** — `POST /workflows/:id/approve` resolves `awaiting_approval`.
- **#9 Rollback** — `live_compilation_id` / `previous_compilation_id` swap; in-flight pinned.
- **TS↔Python service bridge** — `apps/api` triggers a run → calls the Python runtime → streams state.
- **Retry/error classification** (spec §11.6) around handler failures (`RETRYING`/`ERROR`).
- Real Entity System / tool runtime / notifier / sub-agent bindings behind the existing ports.

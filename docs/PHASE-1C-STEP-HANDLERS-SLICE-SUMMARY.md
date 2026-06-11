# Phase 1c — Step Handlers Slice — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** Deliverable #2 of `PHASE-1C-SKILL-EXECUTION.md` — implement the LangGraph **step
handlers** (one per side-effecting `step_type`), the foundation the rest of Phase 1c builds on.
Handlers depend on injected `typing.Protocol` ports with in-memory fakes (mirroring the apps/api
"interface + real + fake, unit-test the fake" convention), so everything is CI-testable with **no
new external dependencies, no `langgraph`, no live DB**. The runner now actually invokes handlers.
**Out of scope (next slice):** installing `langgraph`, the real `LangGraphBackend` execution, and
`PostgresSaver` checkpointing — that is deliverable #1.

---

## 1. What was delivered

```
collect       seed declared inputs/fields/tokens into state.employee_data
entity_tool   describe | list | get | create | update via EntityClient; merge result + employee_id
enrich        ToolClient.invoke(tool, inputs); merge output under config.output_field
notify        Notifier.notify(target, message); non-blocking marker (notifications_sent)
start_agent   AgentClient.delegate(agent, state); record delegation
condition     pass-through (+ config defaults) feeding the existing _make_router booleans
human_input   control node — no-op (runner owns pause / awaiting_* transitions)
end           control node — no-op (runner owns the terminal transition)
```

Handlers are **closures over `(node, context)` returning a state delta dict** — exactly the
LangGraph `node(state) -> partial_state` convention — so the identical closures are reusable by the
future `LangGraphBackend` with zero changes. The `ExecutionRunner` runs each side-effecting node's
handler and merges the delta into `self.data` **before** checkpointing, so the single per-node
checkpoint captures post-handler state. An optional `context` param (default = in-memory fakes) was
added to `ExecutionRunner.__init__` and `build_graph`, so every existing test passes unchanged.

---

## 2. Files added / changed (`services/langgraph`)

| Area | File | Responsibility |
|------|------|----------------|
| Ports | `graph_builder/ports.py` *(new)* | `EntityClient` / `ToolClient` / `Notifier` / `AgentClient` Protocols + `ExecutionContext` dataclass + `default_context()` |
| Fakes | `graph_builder/fakes.py` *(new)* | `InMemoryEntityClient` (seeded `people` rows, records writes), `RecordingToolClient`, `RecordingNotifier`, `RecordingAgentClient` |
| Handlers | `graph_builder/handlers.py` *(new)* | one closure per step type + `make_handler(node, context)`; control nodes → no-op |
| Builder | `graph_builder/builder.py` | `_make_handler(node, context)` delegates to `handlers.make_handler`; `build_graph(..., context=None)` defaults to fakes |
| Runner | `graph_builder/runner.py` | `__init__(..., context=None)`; `_run_handler` invokes handler + merges delta before `_enter` checkpoints |
| Exports | `graph_builder/__init__.py` | export ports, fakes, `ExecutionContext`, `make_handler`, `default_context` |
| Tests | `tests/test_handlers.py` *(new, 11 tests)* | per-step-type handler tests + end-to-end add-employee run with side-effects observable on fakes |

---

## 3. Design notes

- **Backend-agnostic handlers.** A handler is a plain `state -> delta` callable closed over its
  node config and the `ExecutionContext`. That is precisely what `StateGraph.add_node` expects, so
  the next slice wires the same closures into `LangGraphBackend` without rewriting handler logic.
  `_make_handler` stays the single construction point for both backends.
- **Ports + fakes, not mocks.** Side effects flow through narrow `Protocol`s; the in-memory fakes
  are real (the entity fake stores rows and records `created`/`updated`), so tests assert on
  observable state rather than on call spies. `default_context()` makes the fakes the zero-wiring
  default — existing call sites and the Phase 1a tests need no changes.
- **One-checkpoint-per-node preserved.** Handlers run *before* `_enter`, and `_enter` is still the
  sole checkpoint per node. Control nodes (`human_input`, `end`) keep their existing runner-owned
  transitions and contribute exactly one checkpoint each, so add-employee still checkpoints 9 times
  and the latest checkpoint still reports `node == "complete"`.
- **State-key alignment.** `entity_tool create` surfaces the new record id as `employee_id` (the
  add-employee state-schema field); `enrich` writes its scalar under `config.output_field`
  (`linkedin_summary`). `condition` leaves the router contract intact — the boolean is read off
  state by the existing `_make_router`.

---

## 4. Verify

```
cd services/langgraph && python -m pytest        # 30 passed, 1 skipped
```

(The 1 skip is `test_langgraph_backend_satisfies_interface`, guarded on `langgraph` not being
installed — intentional this slice.)

## 5. Deferred / next

- **Deliverable #1 (next slice):** install `langgraph`, enable `LangGraphBackend` real execution,
  and swap `InMemoryCheckpointer` → `PostgresSaver`. The handler closures and ports carry over
  unchanged; only the backend binding and checkpointer change.
- Real Entity System / tool runtime / notifier / sub-agent bindings behind the same ports (the
  fakes are the seam).
- Retry/error classification (spec §11.6) and the `RETRYING`/`ERROR` transitions around handler
  failures.
- `condition` evaluation richer than upstream-supplied booleans, once a real branching skill needs
  it.

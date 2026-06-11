"""Phase 1c (deliverable #1) -- the **real langgraph runtime**.

These tests exercise ``LangGraphBackend`` executing actual langgraph graphs:

* the canonical add-employee IR runs end-to-end to COMPLETED with side-effects observable on the
  injected fakes (employee created, notifications sent, sub-agent delegated, tool invoked);
* a run **pauses** at a ``human_input`` node (mapped to the right AWAITING_* state) and **resumes**
  to completion from the checkpoint on the same ``thread_id``;
* a ``condition`` graph routes **both** branches on the real backend;
* a ``PostgresSaver``-backed run persists a checkpoint and resumes (against local Supabase).

Everything langgraph-requiring is gated on ``langgraph_available()`` (skip when absent); the
Postgres leg is additionally gated on DB reachability -- skip-not-fail, matching the suite.
"""

import uuid

import pytest

from graph_builder import (
    ExecutionContext,
    ExecutionState,
    InMemoryEntityClient,
    RecordingAgentClient,
    RecordingNotifier,
    RecordingToolClient,
    build_graph,
    load_add_employee,
    langgraph_available,
)

pytestmark = pytest.mark.skipif(
    not langgraph_available(), reason="langgraph not installed"
)


def _ctx(**overrides) -> ExecutionContext:
    ctx = ExecutionContext(
        entities=InMemoryEntityClient(),
        tools=RecordingToolClient(),
        notifier=RecordingNotifier(),
        agents=RecordingAgentClient(),
    )
    for key, value in overrides.items():
        setattr(ctx, key, value)
    return ctx


def _thread() -> str:
    return f"t-{uuid.uuid4().hex[:8]}"


def _build_langgraph(definition, context, checkpointer=None):
    from graph_builder import LangGraphBackend

    backend = LangGraphBackend()
    return build_graph(
        definition, backend=backend, checkpointer=checkpointer, context=context
    )


# --- end to end on the real backend ----------------------------------------


def test_add_employee_runs_end_to_end_on_real_langgraph():
    from graph_builder import LangGraphExecutor

    ctx = _ctx()
    definition = load_add_employee()
    compiled = _build_langgraph(definition, ctx)
    executor = LangGraphExecutor(compiled, definition, thread_id=_thread())

    # add-employee has a human_input ("ask_linkedin"): run -> pause -> resume -> completed.
    state = executor.run(initial_state={})
    assert state == ExecutionState.AWAITING_HUMAN_INPUT
    assert executor.paused_node == "ask_linkedin"

    final = executor.resume()
    assert final == ExecutionState.COMPLETED
    assert executor.paused_node is None

    # Observable side-effects on the injected fakes (proves handlers actually ran).
    assert len(ctx.entities.created) == 1
    assert ctx.entities.created[0]["entity"] == "people"
    assert {n["target"] for n in ctx.notifier.sent} == {"owner", "all"}
    assert ctx.agents.delegations[0]["agent"] == "onboarding"
    assert ctx.tools.calls[0]["tool"] == "linkedin_analyzer"
    # Merged graph state carries the created employee id forward.
    assert executor.data.get("employee_id")


def test_pause_maps_to_awaiting_human_input_and_resumes():
    from graph_builder import LangGraphExecutor

    definition = {
        "name": "DataPause",
        "state_schema": {"fields": {}},
        "entry_point": "start",
        "nodes": [
            {"id": "start", "step_type": "entity_tool",
             "config": {"entity": "people", "op": "describe"}},
            {"id": "ask", "step_type": "human_input", "config": {"kind": "data"}},
            {"id": "done", "step_type": "end", "config": {}},
        ],
        "edges": [
            {"from": "start", "to": "ask"},
            {"from": "ask", "to": "done"},
        ],
    }
    compiled = _build_langgraph(definition, _ctx())
    executor = LangGraphExecutor(compiled, definition, thread_id=_thread())

    assert executor.run(initial_state={}) == ExecutionState.AWAITING_HUMAN_INPUT
    assert executor.paused_node == "ask"
    assert executor.resume() == ExecutionState.COMPLETED


def test_pause_maps_to_awaiting_approval():
    from graph_builder import LangGraphExecutor

    definition = {
        "name": "ApprovalPause",
        "state_schema": {"fields": {}},
        "entry_point": "start",
        "nodes": [
            {"id": "start", "step_type": "entity_tool",
             "config": {"entity": "people", "op": "describe"}},
            {"id": "gate", "step_type": "human_input", "config": {"kind": "approval"}},
            {"id": "done", "step_type": "end", "config": {}},
        ],
        "edges": [
            {"from": "start", "to": "gate"},
            {"from": "gate", "to": "done"},
        ],
    }
    compiled = _build_langgraph(definition, _ctx())
    executor = LangGraphExecutor(compiled, definition, thread_id=_thread())

    assert executor.run(initial_state={}) == ExecutionState.AWAITING_APPROVAL
    assert executor.paused_node == "gate"
    assert executor.resume() == ExecutionState.COMPLETED


def test_condition_routes_both_branches_on_real_backend():
    from graph_builder import LangGraphExecutor

    def _branch_def():
        return {
            "name": "Branch",
            "state_schema": {"fields": {}},
            "entry_point": "check",
            "nodes": [
                {"id": "check", "step_type": "condition", "config": {}},
                {"id": "yes", "step_type": "notify", "config": {"target": "owner"}},
                {"id": "no", "step_type": "notify", "config": {"target": "all"}},
                {"id": "done_yes", "step_type": "end", "config": {}},
                {"id": "done_no", "step_type": "end", "config": {}},
            ],
            "edges": [
                {"from": "check", "to": "yes", "condition": "approved"},
                {"from": "check", "to": "no"},
                {"from": "yes", "to": "done_yes"},
                {"from": "no", "to": "done_no"},
            ],
        }

    # Truthy branch.
    ctx_yes = _ctx()
    ex_yes = LangGraphExecutor(
        _build_langgraph(_branch_def(), ctx_yes), _branch_def(), thread_id=_thread()
    )
    assert ex_yes.run(initial_state={"approved": True}) == ExecutionState.COMPLETED
    assert [n["target"] for n in ctx_yes.notifier.sent] == ["owner"]

    # Falsy branch.
    ctx_no = _ctx()
    ex_no = LangGraphExecutor(
        _build_langgraph(_branch_def(), ctx_no), _branch_def(), thread_id=_thread()
    )
    assert ex_no.run(initial_state={"approved": False}) == ExecutionState.COMPLETED
    assert [n["target"] for n in ctx_no.notifier.sent] == ["all"]


# --- PostgresSaver leg (gated on DB reachability) --------------------------


def test_postgres_saver_persists_and_resumes():
    from graph_builder import LangGraphExecutor, LangGraphBackend
    from graph_builder.postgres_checkpointer import postgres_reachable, postgres_saver

    if not postgres_reachable():
        pytest.skip("local Supabase Postgres not reachable")

    definition = load_add_employee()
    thread_id = _thread()
    ctx = _ctx()

    with postgres_saver() as saver:
        backend = LangGraphBackend()
        compiled = build_graph(
            definition, backend=backend, checkpointer=saver, context=ctx
        )
        executor = LangGraphExecutor(compiled, definition, thread_id=thread_id)

        # Run to the human_input pause; the checkpoint must be persisted in Postgres.
        assert executor.run(initial_state={}) == ExecutionState.AWAITING_HUMAN_INPUT
        assert executor.paused_node == "ask_linkedin"

        # A fresh state read off the SAME thread sees the persisted checkpoint.
        snapshot = compiled.runnable.get_state(
            {"configurable": {"thread_id": thread_id}}
        )
        assert snapshot.next == ("ask_linkedin",)

        # Resume from the persisted checkpoint to completion.
        assert executor.resume() == ExecutionState.COMPLETED
        assert executor.data.get("employee_id")
        assert len(ctx.entities.created) == 1

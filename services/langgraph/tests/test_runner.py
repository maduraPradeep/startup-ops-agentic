"""Phase 1a -- ExecutionRunner state transitions, pause semantics, checkpointing,
and the cross-language round-trip (spec section 4.8, H2)."""

from graph_builder import (
    ExecutionRunner,
    ExecutionState,
    InMemoryCheckpointer,
    build_graph,
    load_add_employee,
    validate,
)


def _data_pause_def():
    return {
        "name": "DataPause",
        "entry_point": "start",
        "nodes": [
            {"id": "start", "step_type": "entity_tool", "config": {}},
            {"id": "ask", "step_type": "human_input", "config": {"kind": "data"}},
            {"id": "done", "step_type": "end", "config": {}},
        ],
        "edges": [
            {"from": "start", "to": "ask"},
            {"from": "ask", "to": "done"},
        ],
    }


def _approval_pause_def():
    d = _data_pause_def()
    d["nodes"][1]["config"] = {"kind": "approval"}
    return d


def test_full_run_reaches_completed():
    runner = ExecutionRunner(load_add_employee())
    final = runner.run(auto_resume=True)

    assert final == ExecutionState.COMPLETED
    assert runner.state_history[0] == ExecutionState.INITIATED
    assert runner.state_history[-1] == ExecutionState.COMPLETED
    assert ExecutionState.RUNNING in runner.state_history


def test_one_checkpoint_per_node():
    cp = InMemoryCheckpointer()
    definition = load_add_employee()
    runner = ExecutionRunner(definition, checkpointer=cp)
    runner.run(auto_resume=True)

    assert cp.count(runner.thread_id) == len(definition["nodes"])  # 9


def test_pause_on_data_collection():
    runner = ExecutionRunner(_data_pause_def())
    state = runner.run(auto_resume=False)

    assert state == ExecutionState.AWAITING_HUMAN_INPUT
    assert runner.current_node == "ask"


def test_pause_on_approval_gate():
    runner = ExecutionRunner(_approval_pause_def())
    state = runner.run(auto_resume=False)

    assert state == ExecutionState.AWAITING_APPROVAL
    assert runner.current_node == "ask"


def test_resume_after_pause_completes():
    runner = ExecutionRunner(_approval_pause_def())
    assert runner.run(auto_resume=False) == ExecutionState.AWAITING_APPROVAL
    assert runner.run(auto_resume=True) == ExecutionState.COMPLETED


def test_checkpoint_reflects_latest_state():
    cp = InMemoryCheckpointer()
    runner = ExecutionRunner(load_add_employee(), checkpointer=cp)
    runner.run(auto_resume=True)

    latest = cp.get(runner.thread_id)
    assert latest is not None
    assert latest["node"] == "complete"


def test_round_trip_canonical_fixture_validates_builds_and_runs():
    """H2: the same JSON the TS compiler emits validates, builds, and runs to completed."""
    definition = load_add_employee()
    assert validate(definition) == []
    build_graph(definition)
    runner = ExecutionRunner(definition)
    assert runner.run(auto_resume=True) == ExecutionState.COMPLETED

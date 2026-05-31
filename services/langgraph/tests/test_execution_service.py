"""Phase 1c -- the TS<->Python skill-execution bridge.

Exercises ``ExecutionService`` (the in-process run registry the HTTP gateway drives) plus the
``/executions`` FastAPI endpoints. The service is pinned to the in-memory ``ExecutionRunner``
backend (``use_langgraph=False``) so these run deterministically without the optional langgraph
dep or a DB; a separate langgraph-gated test covers the real backend the same way the runtime
suite does (skip-not-fail).
"""

import pytest

from graph_builder import ExecutionService, load_add_employee, langgraph_available


def _condition_def(branch_key: str = "approved"):
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
            {"from": "check", "to": "yes", "condition": branch_key},
            {"from": "check", "to": "no"},
            {"from": "yes", "to": "done_yes"},
            {"from": "no", "to": "done_no"},
        ],
    }


# --- ExecutionService, in-memory backend (always available) ----------------


def test_start_pauses_at_human_input_then_resume_completes():
    service = ExecutionService(use_langgraph=False)

    snap = service.start(load_add_employee(), execution_id="exec-1")
    assert snap.execution_id == "exec-1"
    assert snap.state == "awaiting_human_input"
    assert snap.paused_node == "ask_linkedin"
    assert snap.paused_kind == "data"
    assert snap.backend == "inmemory"

    resumed = service.resume("exec-1")
    assert resumed.state == "completed"
    assert resumed.paused_node is None
    assert resumed.paused_kind is None
    # The created employee id is carried forward in the merged execution data.
    assert resumed.data.get("employee_id")


def test_start_runs_to_completion_when_no_pause():
    service = ExecutionService(use_langgraph=False)

    truthy = service.start(_condition_def(), initial_state={"approved": True}, execution_id="t")
    assert truthy.state == "completed"
    assert truthy.paused_node is None

    falsy = service.start(_condition_def(), initial_state={"approved": False}, execution_id="f")
    assert falsy.state == "completed"


def test_get_reflects_current_state():
    service = ExecutionService(use_langgraph=False)
    service.start(load_add_employee(), execution_id="exec-g")
    assert service.get("exec-g").state == "awaiting_human_input"
    service.resume("exec-g")
    assert service.get("exec-g").state == "completed"


def test_resume_is_idempotent_once_terminal():
    service = ExecutionService(use_langgraph=False)
    service.start(_condition_def(), initial_state={"approved": True}, execution_id="done")
    # Already completed: resume is a no-op, not an error.
    assert service.resume("done").state == "completed"


def test_unknown_execution_raises_keyerror():
    service = ExecutionService(use_langgraph=False)
    with pytest.raises(KeyError):
        service.get("nope")
    with pytest.raises(KeyError):
        service.resume("nope")


def test_invalid_ir_raises_valueerror():
    service = ExecutionService(use_langgraph=False)
    bad = {
        "name": "Bad",
        "state_schema": {"fields": {}},
        "entry_point": "missing",  # not a declared node
        "nodes": [{"id": "only", "step_type": "end", "config": {}}],
        "edges": [],
    }
    with pytest.raises(ValueError):
        service.start(bad, execution_id="bad")


def test_mints_execution_id_when_absent():
    service = ExecutionService(use_langgraph=False)
    snap = service.start(_condition_def(), initial_state={"approved": True})
    assert snap.execution_id  # a uuid hex was generated
    assert service.get(snap.execution_id).state == "completed"


# --- FastAPI HTTP surface --------------------------------------------------


def _client():
    from fastapi.testclient import TestClient

    import main

    return TestClient(main.app)


def test_http_start_resume_get_round_trip():
    client = _client()

    started = client.post(
        "/executions",
        json={"definition": load_add_employee(), "execution_id": "http-1"},
    )
    assert started.status_code == 200
    assert started.json()["state"] == "awaiting_human_input"
    assert started.json()["paused_node"] == "ask_linkedin"

    fetched = client.get("/executions/http-1")
    assert fetched.status_code == 200
    assert fetched.json()["state"] == "awaiting_human_input"

    resumed = client.post("/executions/http-1/resume")
    assert resumed.status_code == 200
    assert resumed.json()["state"] == "completed"


def test_http_unknown_execution_is_404():
    client = _client()
    assert client.get("/executions/ghost").status_code == 404
    assert client.post("/executions/ghost/resume").status_code == 404


def test_http_invalid_ir_is_400():
    client = _client()
    res = client.post(
        "/executions",
        json={"definition": {"name": "x", "entry_point": "missing", "nodes": [], "edges": []}},
    )
    assert res.status_code == 400


# --- real langgraph backend (gated) ----------------------------------------


@pytest.mark.skipif(not langgraph_available(), reason="langgraph not installed")
def test_langgraph_backend_start_and_resume():
    service = ExecutionService(use_langgraph=True)
    snap = service.start(load_add_employee(), execution_id="lg-1")
    assert snap.backend == "langgraph"
    assert snap.state == "awaiting_human_input"
    assert service.resume("lg-1").state == "completed"

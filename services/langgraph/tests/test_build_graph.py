"""Phase 1a -- GraphBuilder.build_graph() (spec section 4.8)."""

import pytest

from graph_builder import build_graph, load_add_employee
from graph_builder.inmemory_backend import InMemoryBackend
from graph_builder.langgraph_backend import LangGraphBackend, langgraph_available


def test_build_graph_from_valid_definition():
    definition = load_add_employee()
    graph = build_graph(definition)

    assert graph.entry_point == definition["entry_point"]
    assert set(graph.node_ids()) == {n["id"] for n in definition["nodes"]}
    # Linear graph: load_schema -> collect_details
    assert graph.successors("load_schema") == ["collect_details"]
    assert graph.successors("complete") == []  # terminal


def test_build_graph_refuses_invalid_definition():
    bad = {
        "name": "bad",
        "entry_point": "missing",
        "nodes": [{"id": "a", "step_type": "end", "config": {}}],
        "edges": [],
    }
    with pytest.raises(ValueError, match="IR validation failed"):
        build_graph(bad)


def test_condition_node_produces_conditional_edges():
    definition = {
        "name": "Branch",
        "entry_point": "check",
        "nodes": [
            {"id": "check", "step_type": "condition", "config": {}},
            {"id": "yes", "step_type": "end", "config": {}},
            {"id": "no", "step_type": "end", "config": {}},
        ],
        "edges": [
            {"from": "check", "to": "yes", "condition": "approved"},
            {"from": "check", "to": "no"},
        ],
    }
    graph = build_graph(definition)
    assert set(graph.successors("check")) == {"yes", "no"}
    # The in-memory backend records this source as conditional.
    assert graph.router("check") is not None


def test_inmemory_backend_is_default_no_langgraph_needed():
    graph = build_graph(load_add_employee(), backend=InMemoryBackend())
    assert graph.entry_point == "load_schema"


@pytest.mark.skipif(not langgraph_available(), reason="langgraph not installed")
def test_langgraph_backend_satisfies_interface():  # pragma: no cover
    from typing import TypedDict

    class S(TypedDict, total=False):
        x: str

    backend = LangGraphBackend(S)
    graph = build_graph(load_add_employee(), backend=backend)
    assert graph is not None

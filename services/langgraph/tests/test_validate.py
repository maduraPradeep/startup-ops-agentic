"""Phase 1a -- GraphBuilder.validate() (spec section 4.8)."""

import copy

from graph_builder import validate, load_add_employee


def _minimal():
    return {
        "name": "X",
        "entry_point": "a",
        "nodes": [
            {"id": "a", "step_type": "entity_tool", "config": {}},
            {"id": "b", "step_type": "end", "config": {}},
        ],
        "edges": [{"from": "a", "to": "b"}],
    }


def test_valid_add_employee_definition_has_no_errors():
    assert validate(load_add_employee()) == []


def test_valid_minimal_definition_has_no_errors():
    assert validate(_minimal()) == []


def test_entry_point_not_in_nodes():
    d = _minimal()
    d["entry_point"] = "missing"
    errors = validate(d)
    assert any("entry_point" in e for e in errors)


def test_edge_references_unknown_node():
    d = _minimal()
    d["edges"].append({"from": "b", "to": "ghost"})
    errors = validate(d)
    assert any("unknown node" in e and "ghost" in e for e in errors)


def test_invalid_step_type():
    d = _minimal()
    d["nodes"][0]["step_type"] = "frobnicate"
    errors = validate(d)
    assert any("invalid step_type" in e for e in errors)


def test_condition_node_must_have_two_outgoing_edges():
    d = {
        "name": "C",
        "entry_point": "c",
        "nodes": [
            {"id": "c", "step_type": "condition", "config": {}},
            {"id": "x", "step_type": "end", "config": {}},
        ],
        "edges": [{"from": "c", "to": "x"}],  # only 1 outgoing
    }
    errors = validate(d)
    assert any("exactly 2 outgoing edges" in e for e in errors)


def test_no_terminal_node_is_flagged():
    d = {
        "name": "Loop",
        "entry_point": "a",
        "nodes": [
            {"id": "a", "step_type": "collect", "config": {}},
            {"id": "b", "step_type": "collect", "config": {}},
        ],
        "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}],
    }
    errors = validate(d)
    assert any("terminal" in e for e in errors)


def test_errors_accumulate():
    d = copy.deepcopy(_minimal())
    d["entry_point"] = "missing"
    d["nodes"][0]["step_type"] = "frobnicate"
    errors = validate(d)
    assert len(errors) >= 2

"""Phase 1a -- GraphBuilder: validate() + build_graph() (spec section 4.8)."""

from typing import Any, Callable

from .graph_backend import CompiledGraph, GraphBackend
from .inmemory_backend import InMemoryBackend
from .ir import VALID_STEP_TYPES, LangGraphDefinition


def validate(definition: LangGraphDefinition) -> list[str]:
    """Return a list of IR problems (empty == valid). Accumulates all errors."""
    errors: list[str] = []
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])
    node_ids = {n["id"] for n in nodes}

    entry = definition.get("entry_point")
    if entry not in node_ids:
        errors.append(f"entry_point '{entry}' not in nodes")

    for edge in edges:
        for ref in ("from", "to"):
            target = edge.get(ref)
            if target != "end" and target not in node_ids:
                errors.append(f"Edge '{ref}' references unknown node: {target}")

    for node in nodes:
        step_type = node.get("step_type")
        if step_type not in VALID_STEP_TYPES:
            errors.append(f"Node '{node['id']}' has invalid step_type: {step_type}")
        if step_type == "condition":
            outgoing = [e for e in edges if e.get("from") == node["id"]]
            if len(outgoing) != 2:
                errors.append(
                    f"Condition node '{node['id']}' must have exactly 2 outgoing edges, "
                    f"found {len(outgoing)}"
                )

    has_outgoing = {e.get("from") for e in edges}
    terminal = [n for n in nodes if n["id"] not in has_outgoing]
    if not terminal:
        errors.append("Graph has no terminal nodes -- infinite loop risk")

    return errors


def _make_handler(node: dict[str, Any]) -> Callable[[dict[str, Any]], dict[str, Any]]:
    # Phase 1a handlers are no-ops; the ExecutionRunner drives state transitions.
    def handler(state: dict[str, Any]) -> dict[str, Any]:
        return {}

    handler.__name__ = f"handle_{node['id']}"
    return handler


def _make_router(outgoing: list[dict[str, Any]]) -> Callable[[dict[str, Any]], str]:
    def router(state: dict[str, Any]) -> str:
        for edge in outgoing:
            cond = edge.get("condition")
            if cond and state.get(cond):
                return edge["to"]
        return outgoing[-1]["to"]

    return router


def build_graph(
    definition: LangGraphDefinition,
    backend: GraphBackend | None = None,
    checkpointer: Any | None = None,
) -> CompiledGraph:
    """Validate then build a graph via the given backend (in-memory by default)."""
    errors = validate(definition)
    if errors:
        raise ValueError(f"IR validation failed: {'; '.join(errors)}")

    backend = backend or InMemoryBackend()
    edges = definition["edges"]

    for node in definition["nodes"]:
        backend.add_node(node["id"], _make_handler(node))

    condition_sources = {e["from"] for e in edges if e.get("condition")}

    for edge in edges:
        if edge["from"] in condition_sources:
            continue  # handled as conditional edges below
        if edge["to"] == "end":
            continue  # terminal; no explicit edge needed
        backend.add_edge(edge["from"], edge["to"])

    for source in condition_sources:
        outgoing = [e for e in edges if e["from"] == source]
        targets = [e["to"] for e in outgoing]
        backend.add_conditional_edges(source, _make_router(outgoing), targets)

    backend.set_entry_point(definition["entry_point"])
    return backend.compile(checkpointer=checkpointer)

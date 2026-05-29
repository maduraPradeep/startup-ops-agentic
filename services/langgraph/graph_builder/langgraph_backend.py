"""Phase 1a -- production graph backend bound to the real ``langgraph`` package.

Guarded import: the package may not be installed in the Phase 1a test environment. The
in-memory backend is used for tests; this class exists to prove the abstraction holds and to
be the drop-in production binding once ``langgraph`` is added to requirements.
"""

from typing import Any, Callable

from .graph_backend import CompiledGraph, GraphBackend

try:  # pragma: no cover - exercised only when langgraph is installed
    from langgraph.graph import StateGraph, END  # type: ignore

    _LANGGRAPH_AVAILABLE = True
except ImportError:  # pragma: no cover
    StateGraph = None  # type: ignore
    END = "__end__"  # type: ignore
    _LANGGRAPH_AVAILABLE = False


def langgraph_available() -> bool:
    return _LANGGRAPH_AVAILABLE


class LangGraphBackend(GraphBackend):  # pragma: no cover - requires langgraph installed
    def __init__(self, state_type: Any) -> None:
        if not _LANGGRAPH_AVAILABLE:
            raise RuntimeError("langgraph is not installed")
        self._graph = StateGraph(state_type)

    def add_node(self, node_id: str, handler: Callable[..., Any]) -> None:
        self._graph.add_node(node_id, handler)

    def add_edge(self, source: str, target: str) -> None:
        self._graph.add_edge(source, END if target == "end" else target)

    def add_conditional_edges(
        self, source: str, router: Callable[..., str], targets: list[str]
    ) -> None:
        self._graph.add_conditional_edges(source, router)

    def set_entry_point(self, node_id: str) -> None:
        self._graph.set_entry_point(node_id)

    def compile(self, checkpointer: Any | None = None) -> CompiledGraph:
        return self._graph.compile(checkpointer=checkpointer)

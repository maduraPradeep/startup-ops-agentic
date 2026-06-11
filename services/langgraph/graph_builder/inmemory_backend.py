"""Phase 1a -- lightweight in-memory graph backend (no real langgraph required)."""

from typing import Any, Callable

from .graph_backend import CompiledGraph, GraphBackend


class InMemoryGraph(CompiledGraph):
    def __init__(
        self,
        nodes: dict[str, Callable[..., Any]],
        edges: dict[str, list[str]],
        conditional: dict[str, tuple[Callable[..., str], list[str]]],
        entry: str,
        checkpointer: Any | None,
    ) -> None:
        self._nodes = nodes
        self._edges = edges
        self._conditional = conditional
        self._entry = entry
        self.checkpointer = checkpointer

    @property
    def entry_point(self) -> str:
        return self._entry

    def handler(self, node_id: str) -> Callable[..., Any]:
        return self._nodes[node_id]

    def successors(self, node_id: str) -> list[str]:
        if node_id in self._conditional:
            return list(self._conditional[node_id][1])
        return list(self._edges.get(node_id, []))

    def router(self, node_id: str) -> Callable[..., str] | None:
        if node_id in self._conditional:
            return self._conditional[node_id][0]
        return None

    def node_ids(self) -> list[str]:
        return list(self._nodes.keys())


class InMemoryBackend(GraphBackend):
    def __init__(self) -> None:
        self._nodes: dict[str, Callable[..., Any]] = {}
        self._edges: dict[str, list[str]] = {}
        self._conditional: dict[str, tuple[Callable[..., str], list[str]]] = {}
        self._entry: str | None = None

    def add_node(self, node_id: str, handler: Callable[..., Any]) -> None:
        self._nodes[node_id] = handler

    def add_edge(self, source: str, target: str) -> None:
        self._edges.setdefault(source, []).append(target)

    def add_conditional_edges(
        self, source: str, router: Callable[..., str], targets: list[str]
    ) -> None:
        self._conditional[source] = (router, targets)

    def set_entry_point(self, node_id: str) -> None:
        self._entry = node_id

    def compile(self, checkpointer: Any | None = None) -> InMemoryGraph:
        if self._entry is None:
            raise ValueError("entry point not set")
        return InMemoryGraph(
            self._nodes, self._edges, self._conditional, self._entry, checkpointer
        )

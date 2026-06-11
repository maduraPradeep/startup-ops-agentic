"""Phase 1a -- graph backend abstraction.

Lets GraphBuilder build a graph without requiring the real ``langgraph`` package, so the IR
round-trip and execution can be unit-tested with mocks/stubs. ``InMemoryBackend`` is the
default; ``LangGraphBackend`` (guarded import) is the production binding.
"""

from abc import ABC, abstractmethod
from typing import Any, Callable


class CompiledGraph(ABC):
    """A built graph. Phase 1a only needs to introspect topology + entry point."""

    @property
    @abstractmethod
    def entry_point(self) -> str: ...

    @abstractmethod
    def successors(self, node_id: str) -> list[str]: ...

    @abstractmethod
    def node_ids(self) -> list[str]: ...


class GraphBackend(ABC):
    @abstractmethod
    def add_node(self, node_id: str, handler: Callable[..., Any]) -> None: ...

    @abstractmethod
    def add_edge(self, source: str, target: str) -> None: ...

    @abstractmethod
    def add_conditional_edges(
        self, source: str, router: Callable[..., str], targets: list[str]
    ) -> None: ...

    @abstractmethod
    def set_entry_point(self, node_id: str) -> None: ...

    @abstractmethod
    def compile(self, checkpointer: Any | None = None) -> CompiledGraph: ...

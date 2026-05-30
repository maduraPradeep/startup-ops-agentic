"""Phase 1c -- production graph backend bound to the real ``langgraph`` package.

Guarded import: ``langgraph`` may not be installed in every environment (CI without the dep, the
Phase 1a baseline). When absent, ``langgraph_available()`` returns ``False`` and the in-memory
backend (the default) keeps every existing test green -- graceful degradation, mirroring the
project convention of skipping the optional leg rather than failing.

When present, ``LangGraphBackend`` builds a real ``StateGraph`` over a permissive dict-state and
registers the identical slice-1 handler closures via ``add_node``. ``human_input`` nodes are
collected so the graph compiles with ``interrupt_before=[...]`` -- a run pauses there and resumes
from the checkpoint on the next ``invoke(None, config)``. The compiled object is wrapped in
``LangGraphCompiledGraph`` so it still satisfies the ``CompiledGraph`` topology interface while
exposing the live runtime for the executor.
"""

from typing import Annotated, Any, Callable

from .graph_backend import CompiledGraph, GraphBackend

try:  # pragma: no cover - import outcome depends on the environment
    from langgraph.checkpoint.memory import MemorySaver  # type: ignore
    from langgraph.graph import END, StateGraph  # type: ignore
    from typing_extensions import TypedDict  # type: ignore

    _LANGGRAPH_AVAILABLE = True
except ImportError:  # pragma: no cover
    StateGraph = None  # type: ignore
    MemorySaver = None  # type: ignore
    END = "__end__"  # type: ignore
    TypedDict = dict  # type: ignore
    _LANGGRAPH_AVAILABLE = False


def langgraph_available() -> bool:
    """True iff the real ``langgraph`` package is importable in this environment."""
    return _LANGGRAPH_AVAILABLE


# The executor reads/writes the accumulated execution dict under this single channel.
STATE_CHANNEL = "state"


def _merge_state(left: dict | None, right: dict | None) -> dict:
    """Reducer for the ``state`` channel: shallow-merge each node's delta (last-write-wins)."""
    return {**(left or {}), **(right or {})}


def default_state_type() -> Any:
    """A single ``state`` channel holding the whole execution dict, with a merge reducer.

    A plain ``StateGraph(dict)`` is unreliable here: dynamically-created channels are only
    surfaced by ``invoke()``'s return value, while ``get_state().values`` (what the executor
    reads to detect pauses + carry state forward) collapses to just the last node's writes. A
    single ``Annotated[dict, _merge_state]`` channel instead **accumulates** every handler's
    delta -- arbitrary keys included (IR ``state_schema`` fields plus bookkeeping like
    ``entity_record`` / ``employee_id`` / ``notifications_sent``) -- and persists across nodes
    and across an interrupt/resume, so ``get_state().values["state"]`` is the full state.
    """
    if not _LANGGRAPH_AVAILABLE:  # pragma: no cover - guarded by callers
        raise RuntimeError("langgraph is not installed")

    class GraphState(TypedDict):
        state: Annotated[dict, _merge_state]

    return GraphState


def _wrap_node(handler: Callable[..., Any]) -> Callable[..., Any]:
    """Adapt a slice-2 ``(state) -> delta`` handler to a single-channel langgraph node."""

    def node(graph_state: dict[str, Any]) -> dict[str, Any]:
        delta = handler(graph_state.get(STATE_CHANNEL, {}) or {})
        return {STATE_CHANNEL: delta or {}}

    return node


def _wrap_router(router: Callable[..., str]) -> Callable[..., str]:
    """Adapt a ``(state) -> target`` router to read the single-channel graph state."""

    def route(graph_state: dict[str, Any]) -> str:
        return router(graph_state.get(STATE_CHANNEL, {}) or {})

    return route


class LangGraphCompiledGraph(CompiledGraph):  # pragma: no cover - requires langgraph installed
    """Adapts a compiled langgraph ``Pregel`` graph to the ``CompiledGraph`` topology interface.

    Carries the live ``runnable`` plus the static topology so the executor can both *run* the graph
    and *introspect* it (entry point, successors) the same way the in-memory graph is inspected.
    ``interrupt_nodes`` records which ``human_input`` nodes were wired as ``interrupt_before`` so
    the executor can map a pause to the right ``AWAITING_*`` state.
    """

    def __init__(
        self,
        runnable: Any,
        *,
        entry: str,
        edges: dict[str, list[str]],
        conditional: dict[str, tuple[Callable[..., str], list[str]]],
        node_ids: list[str],
        interrupt_nodes: list[str],
    ) -> None:
        self.runnable = runnable
        self._entry = entry
        self._edges = edges
        self._conditional = conditional
        self._node_ids = node_ids
        self.interrupt_nodes = interrupt_nodes

    @property
    def entry_point(self) -> str:
        return self._entry

    def successors(self, node_id: str) -> list[str]:
        if node_id in self._conditional:
            return list(self._conditional[node_id][1])
        return list(self._edges.get(node_id, []))

    def node_ids(self) -> list[str]:
        return list(self._node_ids)


class LangGraphBackend(GraphBackend):  # pragma: no cover - requires langgraph installed
    """Builds a real ``langgraph.StateGraph`` from the IR via the shared ``GraphBackend`` API."""

    def __init__(self, state_type: Any | None = None) -> None:
        if not _LANGGRAPH_AVAILABLE:
            raise RuntimeError("langgraph is not installed")
        self._state_type = state_type or default_state_type()
        self._graph = StateGraph(self._state_type)
        self._entry: str | None = None
        self._edges: dict[str, list[str]] = {}
        self._conditional: dict[str, tuple[Callable[..., str], list[str]]] = {}
        self._node_ids: list[str] = []
        # human_input nodes wired as interrupt points (set by build_graph via mark_interrupt).
        self._interrupt_nodes: list[str] = []

    def add_node(self, node_id: str, handler: Callable[..., Any]) -> None:
        # Handlers are backend-agnostic (state)->delta closures; wrap them to read/write the
        # single ``state`` channel so the merge reducer accumulates each node's delta.
        self._graph.add_node(node_id, _wrap_node(handler))
        self._node_ids.append(node_id)

    def add_edge(self, source: str, target: str) -> None:
        resolved = END if target == "end" else target
        self._graph.add_edge(source, resolved)
        self._edges.setdefault(source, []).append(target)

    def add_conditional_edges(
        self, source: str, router: Callable[..., str], targets: list[str]
    ) -> None:
        # Map the router's logical targets ("end" -> END) so langgraph resolves the terminal sink.
        path_map = {t: (END if t == "end" else t) for t in targets}
        self._graph.add_conditional_edges(source, _wrap_router(router), path_map)
        self._conditional[source] = (router, targets)

    def set_entry_point(self, node_id: str) -> None:
        self._graph.set_entry_point(node_id)
        self._entry = node_id

    def mark_interrupt(self, node_id: str) -> None:
        """Record a node that should pause execution (``human_input``) before it runs."""
        if node_id not in self._interrupt_nodes:
            self._interrupt_nodes.append(node_id)

    def compile(self, checkpointer: Any | None = None) -> "LangGraphCompiledGraph":
        if self._entry is None:
            raise ValueError("entry point not set")
        # A checkpointer is required for interrupt/resume; default to an in-process MemorySaver.
        saver = checkpointer or MemorySaver()
        runnable = self._graph.compile(
            checkpointer=saver,
            interrupt_before=list(self._interrupt_nodes) or None,
        )
        return LangGraphCompiledGraph(
            runnable,
            entry=self._entry,
            edges=self._edges,
            conditional=self._conditional,
            node_ids=self._node_ids,
            interrupt_nodes=list(self._interrupt_nodes),
        )

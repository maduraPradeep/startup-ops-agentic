"""Phase 1c -- drive a compiled **real langgraph** graph and observe ``ExecutionState``.

``LangGraphExecutor`` is the langgraph counterpart of the custom-walker ``ExecutionRunner``: it
runs a ``LangGraphCompiledGraph`` to completion or to a ``human_input`` pause, exposing the same
observables (current ``ExecutionState``, the merged graph state, and -- when paused -- which node
parked the run and whether it is data collection vs an approval gate).

Pause/resume rides on langgraph interrupts + checkpointing:

* The graph is compiled with ``interrupt_before=[human_input nodes]`` and a checkpointer.
* ``run()`` calls ``invoke(initial, config)``; if the run parks, ``get_state(config).next`` names
  the pending ``human_input`` node. Its ``config.kind`` maps to ``AWAITING_APPROVAL`` (``approval``)
  or ``AWAITING_HUMAN_INPUT`` (anything else) -- identical to ``ExecutionRunner``.
* ``resume()`` calls ``invoke(None, config)`` with the **same ``thread_id``**, continuing from the
  persisted checkpoint. It loops so a graph with several human_input nodes drains to completion.

The checkpointer (``MemorySaver`` for tests, ``PostgresSaver`` for production) is supplied at
*compile* time on the backend; the executor only needs the ``thread_id`` to address the thread.
"""

from typing import Any

from .execution_state import ExecutionState
from .ir import LangGraphDefinition
from .langgraph_backend import LangGraphCompiledGraph


class LangGraphExecutor:  # pragma: no cover - requires langgraph installed
    def __init__(
        self,
        compiled: LangGraphCompiledGraph,
        definition: LangGraphDefinition,
        thread_id: str = "thread-1",
    ) -> None:
        self.compiled = compiled
        self.definition = definition
        self.thread_id = thread_id
        self._nodes = {n["id"]: n for n in definition["nodes"]}
        self.state: ExecutionState = ExecutionState.INITIATED
        self.data: dict[str, Any] = {}
        self.paused_node: str | None = None

    @property
    def _config(self) -> dict[str, Any]:
        return {"configurable": {"thread_id": self.thread_id}}

    def _pause_state_for(self, node_id: str) -> ExecutionState:
        kind = (self._nodes.get(node_id, {}).get("config", {}) or {}).get("kind", "data")
        return (
            ExecutionState.AWAITING_APPROVAL
            if kind == "approval"
            else ExecutionState.AWAITING_HUMAN_INPUT
        )

    def _sync_from_thread(self) -> None:
        """Refresh ``data`` from the persisted checkpoint (post-invoke source of truth)."""
        snapshot = self.compiled.runnable.get_state(self._config)
        self.data = dict(snapshot.values or {})
        # ``next`` is the tuple of nodes about to run; empty == the graph finished.
        nxt = tuple(snapshot.next or ())
        self.paused_node = nxt[0] if nxt else None

    def run(self, initial_state: dict[str, Any] | None = None) -> ExecutionState:
        """Invoke the graph; return COMPLETED or the AWAITING_* pause state."""
        self.state = ExecutionState.RUNNING
        self.compiled.runnable.invoke(dict(initial_state or {}), self._config)
        self._sync_from_thread()
        return self._settle()

    def resume(self, auto: bool = True) -> ExecutionState:
        """Continue a parked run from its checkpoint (same thread). Drains all pauses if ``auto``."""
        if self.paused_node is None:
            return self.state
        while self.paused_node is not None:
            self.compiled.runnable.invoke(None, self._config)
            self._sync_from_thread()
            settled = self._settle()
            if not auto or settled != ExecutionState.RUNNING:
                # _settle returns RUNNING only transiently; a real pause/finish breaks the loop.
                break
        return self.state

    def _settle(self) -> ExecutionState:
        if self.paused_node is not None:
            self.state = self._pause_state_for(self.paused_node)
        else:
            self.state = ExecutionState.COMPLETED
        return self.state

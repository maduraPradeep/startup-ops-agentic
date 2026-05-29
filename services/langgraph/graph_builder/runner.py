"""Phase 1a -- ExecutionRunner: walk the graph, transition ExecutionState, pause at
human_input, checkpoint after each node (spec section 4.8)."""

from typing import Any

from .checkpointer import InMemoryCheckpointer
from .execution_state import ExecutionState
from .ir import LangGraphDefinition


class ExecutionRunner:
    def __init__(
        self,
        definition: LangGraphDefinition,
        checkpointer: InMemoryCheckpointer | None = None,
        thread_id: str = "thread-1",
    ) -> None:
        self.definition = definition
        self.thread_id = thread_id
        self.checkpointer = checkpointer or InMemoryCheckpointer()
        self._nodes = {n["id"]: n for n in definition["nodes"]}
        self.data: dict[str, Any] = {}
        self.state: ExecutionState = ExecutionState.INITIATED
        self.state_history: list[ExecutionState] = [ExecutionState.INITIATED]
        self.current_node: str | None = definition["entry_point"]
        self._awaiting_node: str | None = None

    def run(self, auto_resume: bool = True) -> ExecutionState:
        if self.state in (ExecutionState.COMPLETED, ExecutionState.CANCELLED):
            return self.state

        self.state = ExecutionState.RUNNING
        node_id = self.current_node

        while node_id is not None:
            # Resuming past a human_input node we already paused/checkpointed at.
            if node_id == self._awaiting_node:
                self._awaiting_node = None
                node_id = self._next(node_id)
                continue

            node = self._nodes[node_id]
            step_type = node["step_type"]

            if step_type == "human_input":
                kind = node.get("config", {}).get("kind", "data")
                pause = (
                    ExecutionState.AWAITING_APPROVAL
                    if kind == "approval"
                    else ExecutionState.AWAITING_HUMAN_INPUT
                )
                self._enter(node_id, pause)
                self._awaiting_node = node_id
                if not auto_resume:
                    self.current_node = node_id
                    return pause
                continue  # auto-resume: loop hits the resume branch and advances

            if step_type == "end":
                self._enter(node_id, ExecutionState.RUNNING)
                self.current_node = None
                self.state = ExecutionState.COMPLETED
                self.state_history.append(ExecutionState.COMPLETED)
                return self.state

            self._enter(node_id, ExecutionState.RUNNING)
            node_id = self._next(node_id)

        # Reached a terminal node without an explicit 'end' step.
        self.current_node = None
        self.state = ExecutionState.COMPLETED
        self.state_history.append(ExecutionState.COMPLETED)
        return self.state

    def _enter(self, node_id: str, state: ExecutionState) -> None:
        self.state = state
        self.state_history.append(state)
        self.checkpointer.put(
            self.thread_id,
            {"node": node_id, "state": state.value, "data": dict(self.data)},
        )

    def _next(self, node_id: str) -> str | None:
        for edge in self.definition["edges"]:
            if edge["from"] == node_id:
                return None if edge["to"] == "end" else edge["to"]
        return None

"""Phase 1c -- in-process execution registry bridging HTTP triggers to the runtime.

The TS gateway (``apps/api/src/services/skill-executor.service.ts``) loads a live skill's
``live_compilation_id``, reads its ``langgraph_def``, and POSTs it here to run. This module turns
that definition into a running graph and exposes the same observables over a stable id: the
current ``ExecutionState``, the merged execution ``data``, and -- when parked -- which
``human_input`` node paused the run and whether it is a data-collection or an approval gate.

Backend selection mirrors the rest of the suite's graceful degradation: use the real
``LangGraphBackend`` + a checkpointer when ``langgraph`` is installed, otherwise fall back to the
Phase 1a in-memory ``ExecutionRunner`` (always available) so the bridge is exercisable without the
optional dep. Either way pause/resume is **single-step**: each ``resume`` advances past exactly one
interrupt, so an approval gate resolves one decision at a time (spec section 4.8 steps 5-6).

Runs live in an in-process registry keyed by ``execution_id``. The gateway supplies the
``skill_executions`` row id as the execution id, so a single id threads TS -> Python -> langgraph
checkpoint. The langgraph checkpoint itself is durable (``PostgresSaver``) but the compiled-graph
object is not, so a process restart drops in-flight runs -- acceptable for this slice; durable
rehydration from the checkpoint is future work.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .builder import build_graph
from .execution_state import ExecutionState
from .ir import LangGraphDefinition
from .langgraph_backend import langgraph_available
from .ports import ExecutionContext, default_context
from .runner import ExecutionRunner

_AWAITING = (ExecutionState.AWAITING_HUMAN_INPUT, ExecutionState.AWAITING_APPROVAL)


@dataclass
class ExecutionSnapshot:
    """The observable state of a run, returned to the TS gateway over HTTP."""

    execution_id: str
    state: str
    data: dict[str, Any]
    paused_node: Optional[str]
    paused_kind: Optional[str]  # 'approval' | 'data' (when paused) else None
    backend: str  # 'langgraph' | 'inmemory'

    def to_dict(self) -> dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "state": self.state,
            "data": self.data,
            "paused_node": self.paused_node,
            "paused_kind": self.paused_kind,
            "backend": self.backend,
        }


@dataclass
class _Run:
    kind: str  # 'langgraph' | 'inmemory'
    definition: LangGraphDefinition
    executor: Any = None  # LangGraphExecutor (kind == 'langgraph')
    runner: ExecutionRunner | None = None  # (kind == 'inmemory')


class ExecutionService:
    """Builds, runs, and resumes compiled skills over a stable ``execution_id``.

    ``use_langgraph`` defaults to auto-detection; tests pin it to ``False`` to exercise the
    always-available in-memory path deterministically (no langgraph dep, no DB). A
    ``checkpointer_factory`` may supply a langgraph checkpointer (``PostgresSaver``) per run;
    when ``None`` the backend defaults to an in-process ``MemorySaver`` at compile time.
    """

    def __init__(
        self,
        *,
        use_langgraph: bool | None = None,
        checkpointer_factory: Callable[[], Any] | None = None,
    ) -> None:
        self._use_langgraph = (
            langgraph_available() if use_langgraph is None else use_langgraph
        )
        self._checkpointer_factory = checkpointer_factory
        self._runs: dict[str, _Run] = {}

    def start(
        self,
        definition: LangGraphDefinition,
        initial_state: dict[str, Any] | None = None,
        execution_id: str | None = None,
        tenant_id: str | None = None,
    ) -> ExecutionSnapshot:
        """Build the graph and run to completion or the first ``human_input`` pause.

        Raises ``ValueError`` (from ``build_graph``) when the IR fails validation; the HTTP layer
        maps that to a 400. ``execution_id`` is supplied by the gateway (the ``skill_executions``
        row id) so the id is shared end to end; a uuid is minted only when absent.
        """
        execution_id = execution_id or uuid.uuid4().hex
        context = self._context(tenant_id)

        if self._use_langgraph:
            run = self._start_langgraph(definition, initial_state, execution_id, context)
        else:
            run = self._start_inmemory(definition, initial_state, execution_id, context)

        self._runs[execution_id] = run
        return self._snapshot(execution_id)

    def resume(self, execution_id: str) -> ExecutionSnapshot:
        """Advance a parked run past exactly one interrupt (idempotent once terminal)."""
        run = self._require(execution_id)
        if run.kind == "langgraph":
            run.executor.resume(auto=False)
        else:
            assert run.runner is not None
            run.runner.run(auto_resume=False)
        return self._snapshot(execution_id)

    def get(self, execution_id: str) -> ExecutionSnapshot:
        self._require(execution_id)
        return self._snapshot(execution_id)

    # ----- backend starts --------------------------------------------------------------

    def _start_langgraph(
        self,
        definition: LangGraphDefinition,
        initial_state: dict[str, Any] | None,
        execution_id: str,
        context: ExecutionContext,
    ) -> _Run:
        from .langgraph_backend import LangGraphBackend
        from .langgraph_executor import LangGraphExecutor

        checkpointer = (
            self._checkpointer_factory() if self._checkpointer_factory else None
        )
        compiled = build_graph(
            definition,
            backend=LangGraphBackend(),
            checkpointer=checkpointer,
            context=context,
        )
        executor = LangGraphExecutor(compiled, definition, thread_id=execution_id)
        executor.run(initial_state=dict(initial_state or {}))
        return _Run(kind="langgraph", definition=definition, executor=executor)

    def _start_inmemory(
        self,
        definition: LangGraphDefinition,
        initial_state: dict[str, Any] | None,
        execution_id: str,
        context: ExecutionContext,
    ) -> _Run:
        # build_graph still validates the IR (raising ValueError on bad input) before we run the
        # custom walker, so the in-memory path rejects the same definitions as the langgraph one.
        build_graph(definition, context=context)
        runner = ExecutionRunner(definition, thread_id=execution_id, context=context)
        if initial_state:
            runner.data.update(initial_state)
        runner.run(auto_resume=False)
        return _Run(kind="inmemory", definition=definition, runner=runner)

    # ----- snapshots -------------------------------------------------------------------

    def _snapshot(self, execution_id: str) -> ExecutionSnapshot:
        run = self._runs[execution_id]
        if run.kind == "langgraph":
            ex = run.executor
            paused = ex.paused_node
            return ExecutionSnapshot(
                execution_id=execution_id,
                state=ex.state.value,
                data=dict(ex.data),
                paused_node=paused,
                paused_kind=self._kind_for(run.definition, paused),
                backend="langgraph",
            )

        runner = run.runner
        assert runner is not None
        paused = runner.current_node if runner.state in _AWAITING else None
        return ExecutionSnapshot(
            execution_id=execution_id,
            state=runner.state.value,
            data=dict(runner.data),
            paused_node=paused,
            paused_kind=self._kind_for(run.definition, paused),
            backend="inmemory",
        )

    @staticmethod
    def _kind_for(
        definition: LangGraphDefinition, node_id: str | None
    ) -> Optional[str]:
        if node_id is None:
            return None
        node = next((n for n in definition["nodes"] if n["id"] == node_id), {})
        return (node.get("config", {}) or {}).get("kind", "data")

    def _context(self, tenant_id: str | None) -> ExecutionContext:
        context = default_context()
        if tenant_id is not None:
            context.tenant_id = tenant_id
        return context

    def _require(self, execution_id: str) -> _Run:
        run = self._runs.get(execution_id)
        if run is None:
            raise KeyError(execution_id)
        return run

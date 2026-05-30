"""Phase 1c -- side-effecting ports for step handlers (spec section 4.8 step 4).

Handlers depend on small ``typing.Protocol`` ports, never on concrete clients. The real bindings
(Postgres entity service, tool runtime, notifier, sub-agent runtime) and the in-memory fakes in
``fakes.py`` both satisfy these protocols, mirroring the apps/api convention: depend on an
interface, provide a real + an in-memory impl, unit-test with the fake.

``ExecutionContext`` bundles the ports a handler may reach for. It is backend-agnostic: the same
context (and the same handler closures) drive both the in-memory backend today and the future
``LangGraphBackend``.
"""

from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class EntityClient(Protocol):
    """Entity System port (mirrors the apps/api EntityService surface) for ``entity_tool``."""

    def describe(self, entity: str, *, tenant_id: str | None = None) -> dict[str, Any]: ...

    def list(self, entity: str, *, tenant_id: str | None = None) -> dict[str, Any]: ...

    def get(
        self, entity: str, record_id: str, *, tenant_id: str | None = None
    ) -> dict[str, Any]: ...

    def create(
        self, entity: str, payload: dict[str, Any], *, tenant_id: str | None = None
    ) -> dict[str, Any]: ...

    def update(
        self,
        entity: str,
        record_id: str,
        payload: dict[str, Any],
        *,
        tenant_id: str | None = None,
    ) -> dict[str, Any]: ...


@runtime_checkable
class ToolClient(Protocol):
    """Tool runtime port for ``enrich`` (e.g. the LinkedIn analyzer)."""

    def invoke(self, tool: str, inputs: dict[str, Any]) -> dict[str, Any]: ...


@runtime_checkable
class Notifier(Protocol):
    """Notification port for ``notify`` (owner / team broadcasts)."""

    def notify(self, target: str, message: dict[str, Any]) -> None: ...


@runtime_checkable
class AgentClient(Protocol):
    """Sub-agent delegation port for ``start_agent``."""

    def delegate(self, agent: str, state: dict[str, Any]) -> dict[str, Any]: ...


@dataclass
class ExecutionContext:
    """The side-effecting dependencies a handler may reach for."""

    entities: EntityClient
    tools: ToolClient
    notifier: Notifier
    agents: AgentClient
    tenant_id: str | None = None


def default_context() -> "ExecutionContext":
    """The zero-wiring default: in-memory fakes seeded with a couple of people rows.

    Imported lazily to keep ``ports`` free of any dependency on ``fakes``.
    """
    from .fakes import (
        InMemoryEntityClient,
        RecordingAgentClient,
        RecordingNotifier,
        RecordingToolClient,
    )

    return ExecutionContext(
        entities=InMemoryEntityClient(),
        tools=RecordingToolClient(),
        notifier=RecordingNotifier(),
        agents=RecordingAgentClient(),
    )

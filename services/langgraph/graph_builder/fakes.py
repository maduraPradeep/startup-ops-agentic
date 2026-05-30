"""Phase 1c -- in-memory fakes for the step-handler ports (default ExecutionContext).

These are the CI-testable bindings: no DB, no network, no langgraph. Each fake records its
writes/calls so handler tests can assert side-effects on the injected context. They are the
default context so existing call sites and tests work with zero wiring.
"""

from typing import Any


class InMemoryEntityClient:
    """A tiny in-memory Entity System, seeded with a couple of ``people`` rows.

    ``describe`` returns a fixed field set; reads/writes are tenant-scoped on a best-effort
    basis (matching the apps/api EntityService shape). Created records are recorded in
    ``self.created`` for assertions.
    """

    _SCHEMAS: dict[str, dict[str, Any]] = {
        "people": {
            "collection": "people",
            "fields": [
                {"name": "name", "type": "string", "required": True},
                {"name": "email", "type": "string", "required": True},
                {"name": "role", "type": "string", "required": False},
                {"name": "start_date", "type": "string", "required": False},
            ],
        }
    }

    def __init__(self) -> None:
        self._rows: dict[str, list[dict[str, Any]]] = {
            "people": [
                {"id": "p-1", "name": "Ada Lovelace", "email": "ada@example.com", "role": "engineer"},
                {"id": "p-2", "name": "Alan Turing", "email": "alan@example.com", "role": "engineer"},
            ]
        }
        self.created: list[dict[str, Any]] = []
        self.updated: list[dict[str, Any]] = []
        self._seq = 0

    def describe(self, entity: str, *, tenant_id: str | None = None) -> dict[str, Any]:
        return dict(self._SCHEMAS.get(entity, {"collection": entity, "fields": []}))

    def list(self, entity: str, *, tenant_id: str | None = None) -> dict[str, Any]:
        rows = list(self._rows.get(entity, []))
        return {"data": rows, "meta": {"count": len(rows)}}

    def get(
        self, entity: str, record_id: str, *, tenant_id: str | None = None
    ) -> dict[str, Any]:
        for row in self._rows.get(entity, []):
            if row.get("id") == record_id:
                return dict(row)
        raise KeyError(f"{entity}/{record_id} not found")

    def create(
        self, entity: str, payload: dict[str, Any], *, tenant_id: str | None = None
    ) -> dict[str, Any]:
        self._seq += 1
        record = {"id": f"{entity[:3]}-new-{self._seq}", **payload}
        if tenant_id is not None:
            record["tenant_id"] = tenant_id
        self._rows.setdefault(entity, []).append(record)
        self.created.append({"entity": entity, "record": dict(record)})
        return dict(record)

    def update(
        self,
        entity: str,
        record_id: str,
        payload: dict[str, Any],
        *,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        for row in self._rows.get(entity, []):
            if row.get("id") == record_id:
                row.update(payload)
                self.updated.append({"entity": entity, "record": dict(row)})
                return dict(row)
        raise KeyError(f"{entity}/{record_id} not found")


class RecordingToolClient:
    """Records every ``invoke`` and returns a deterministic, inspectable result."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def invoke(self, tool: str, inputs: dict[str, Any]) -> dict[str, Any]:
        self.calls.append({"tool": tool, "inputs": dict(inputs)})
        return {"tool": tool, "summary": f"{tool} ran", "inputs": dict(inputs)}


class RecordingNotifier:
    """Records every notification sent (no real transport)."""

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    def notify(self, target: str, message: dict[str, Any]) -> None:
        self.sent.append({"target": target, "message": dict(message)})


class RecordingAgentClient:
    """Records every sub-agent delegation; returns a stub acknowledgement."""

    def __init__(self) -> None:
        self.delegations: list[dict[str, Any]] = []

    def delegate(self, agent: str, state: dict[str, Any]) -> dict[str, Any]:
        self.delegations.append({"agent": agent, "state": dict(state)})
        return {"agent": agent, "delegated": True}

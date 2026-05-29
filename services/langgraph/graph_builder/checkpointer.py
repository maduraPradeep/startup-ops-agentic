"""Phase 1a -- in-memory checkpointer (mock PostgresSaver, spec section 4.8 step 7)."""

from typing import Any


class InMemoryCheckpointer:
    """Stores per-thread checkpoints in memory. Production swaps in PostgresSaver."""

    def __init__(self) -> None:
        self._latest: dict[str, dict[str, Any]] = {}
        self._history: dict[str, list[dict[str, Any]]] = {}

    def put(self, thread_id: str, checkpoint: dict[str, Any]) -> None:
        self._latest[thread_id] = checkpoint
        self._history.setdefault(thread_id, []).append(checkpoint)

    def get(self, thread_id: str) -> dict[str, Any] | None:
        return self._latest.get(thread_id)

    def history(self, thread_id: str) -> list[dict[str, Any]]:
        return list(self._history.get(thread_id, []))

    def count(self, thread_id: str) -> int:
        return len(self._history.get(thread_id, []))

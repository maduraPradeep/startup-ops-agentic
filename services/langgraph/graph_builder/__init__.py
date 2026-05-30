"""Phase 1a/1c -- GraphBuilder package (IR validation, graph building, execution, handlers)."""

from .builder import build_graph, validate
from .checkpointer import InMemoryCheckpointer
from .execution_state import ExecutionState
from .fakes import (
    InMemoryEntityClient,
    RecordingAgentClient,
    RecordingNotifier,
    RecordingToolClient,
)
from .fixtures import load_add_employee
from .handlers import make_handler
from .inmemory_backend import InMemoryBackend, InMemoryGraph
from .ports import (
    AgentClient,
    EntityClient,
    ExecutionContext,
    Notifier,
    ToolClient,
    default_context,
)
from .runner import ExecutionRunner

__all__ = [
    "validate",
    "build_graph",
    "make_handler",
    "InMemoryBackend",
    "InMemoryGraph",
    "InMemoryCheckpointer",
    "ExecutionState",
    "ExecutionRunner",
    "ExecutionContext",
    "default_context",
    "EntityClient",
    "ToolClient",
    "Notifier",
    "AgentClient",
    "InMemoryEntityClient",
    "RecordingToolClient",
    "RecordingNotifier",
    "RecordingAgentClient",
    "load_add_employee",
]

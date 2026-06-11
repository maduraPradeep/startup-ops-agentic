"""Phase 1a/1c -- GraphBuilder package (IR validation, graph building, execution, handlers)."""

from .builder import build_graph, validate
from .checkpointer import InMemoryCheckpointer
from .execution_service import ExecutionService, ExecutionSnapshot
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
from .langgraph_backend import (
    LangGraphBackend,
    LangGraphCompiledGraph,
    default_state_type,
    langgraph_available,
)
from .ports import (
    AgentClient,
    EntityClient,
    ExecutionContext,
    Notifier,
    ToolClient,
    default_context,
)
from .langgraph_executor import LangGraphExecutor
from .runner import ExecutionRunner

__all__ = [
    "validate",
    "build_graph",
    "make_handler",
    "InMemoryBackend",
    "InMemoryGraph",
    "InMemoryCheckpointer",
    "ExecutionState",
    "ExecutionService",
    "ExecutionSnapshot",
    "ExecutionRunner",
    "LangGraphBackend",
    "LangGraphCompiledGraph",
    "LangGraphExecutor",
    "langgraph_available",
    "default_state_type",
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

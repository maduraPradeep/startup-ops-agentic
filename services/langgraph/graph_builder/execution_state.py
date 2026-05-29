"""Phase 1a -- execution state machine (spec section 4.8, changelog #19).

Mirrors the TypeScript ExecutionState union in @ops/shared. ``awaiting_human_input`` is data
collection (any session user); ``awaiting_approval`` is an authorization gate (a specific role).
"""

from enum import Enum


class ExecutionState(str, Enum):
    INITIATED = "initiated"
    RUNNING = "running"
    AWAITING_HUMAN_INPUT = "awaiting_human_input"
    AWAITING_APPROVAL = "awaiting_approval"
    RETRYING = "retrying"
    ERROR = "error"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

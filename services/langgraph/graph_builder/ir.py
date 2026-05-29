"""Phase 1a -- LangGraph IR mirror (spec section 4.5).

The IR is consumed as plain dicts (exactly the JSON the TS compiler emits) so the round-trip
fixture is byte-for-byte shared. VALID_STEP_TYPES mirrors @ops/shared constants/step-types.
"""

from typing import Any

VALID_STEP_TYPES: set[str] = {
    "collect",
    "enrich",
    "entity_tool",
    "notify",
    "start_agent",
    "condition",
    "human_input",
    "end",
}

# A LangGraph definition is a dict with: name, description, state_schema, entry_point,
# nodes (list of {id, step_type, config}), edges (list of {from, to, condition?}).
LangGraphDefinition = dict[str, Any]
LangGraphNode = dict[str, Any]
LangGraphEdge = dict[str, Any]

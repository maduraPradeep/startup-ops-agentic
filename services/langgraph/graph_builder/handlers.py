"""Phase 1c -- step handlers, one per side-effecting ``step_type`` (spec section 4.8 step 4).

Each handler is a **closure over ``(node, context)``** that takes the current state and returns a
**state delta dict** (a partial state update) -- never mutating the input in place. This is exactly
the LangGraph node convention (``node(state) -> partial_state``), so the same closures are
backend-agnostic: the in-memory backend invokes them today, and the future ``LangGraphBackend``
registers the identical callables via ``StateGraph.add_node``.

Control nodes (``human_input``, ``end``) have no side effect -- the ExecutionRunner owns pause and
terminal transitions -- so they map to a no-op handler.
"""

from typing import Any, Callable

from .ports import ExecutionContext

Handler = Callable[[dict[str, Any]], dict[str, Any]]


def _config(node: dict[str, Any]) -> dict[str, Any]:
    return node.get("config", {}) or {}


def _collect_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Seed declared inputs/tokens from config into state."""
    cfg = _config(node)

    def handler(state: dict[str, Any]) -> dict[str, Any]:
        fields = cfg.get("fields", [])
        existing = dict(state.get("employee_data", {}) or {})
        for field in fields:
            existing.setdefault(field, state.get(field))
        delta: dict[str, Any] = {
            "collected": {
                "entity": cfg.get("entity"),
                "fields": list(fields),
                "tokens": list(cfg.get("tokens", [])),
            }
        }
        if cfg.get("entity") == "people" or fields:
            delta["employee_data"] = existing
        return delta

    return handler


def _entity_tool_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Run ``config.entity`` + ``config.op`` via the EntityClient; merge the result into state."""
    cfg = _config(node)
    entity = cfg.get("entity")
    op = cfg.get("op", "describe")

    def handler(state: dict[str, Any]) -> dict[str, Any]:
        tenant_id = context.tenant_id

        if op == "describe":
            schema = context.entities.describe(entity, tenant_id=tenant_id)
            return {"entity_schema": schema, "schema": schema}

        if op == "list":
            return {"entity_list": context.entities.list(entity, tenant_id=tenant_id)}

        if op == "get":
            record_id = cfg.get("record_id") or state.get("record_id")
            record = context.entities.get(entity, record_id, tenant_id=tenant_id)
            return {"entity_record": record}

        if op == "create":
            payload = dict(state.get("employee_data", {}) or {})
            payload = {k: v for k, v in payload.items() if v is not None}
            record = context.entities.create(entity, payload, tenant_id=tenant_id)
            delta: dict[str, Any] = {"entity_record": record}
            rid = record.get("id")
            if rid is not None:
                # Surface the new id under the IR's state-schema field for people.
                delta["employee_id"] = rid
            return delta

        if op == "update":
            record_id = cfg.get("record_id") or state.get("employee_id") or state.get("record_id")
            payload = dict(state.get("employee_data", {}) or {})
            record = context.entities.update(entity, record_id, payload, tenant_id=tenant_id)
            return {"entity_record": record}

        raise ValueError(f"unsupported entity op: {op}")

    return handler


def _enrich_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Call ``ToolClient.invoke(config.tool, ...)`` and merge the output."""
    cfg = _config(node)
    tool = cfg.get("tool")
    input_fields = cfg.get("tool_inputs", [])
    output_field = cfg.get("output_field")

    def handler(state: dict[str, Any]) -> dict[str, Any]:
        inputs = {field: state.get(field) for field in input_fields}
        result = context.tools.invoke(tool, inputs)
        delta: dict[str, Any] = {"enrichment": result}
        if output_field:
            # Prefer a 'summary' style scalar when present, else the whole result.
            delta[output_field] = result.get("summary", result)
        return delta

    return handler


def _notify_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Send via ``Notifier`` using config target/template; return a small marker (non-blocking)."""
    cfg = _config(node)
    target = cfg.get("target", "owner")

    def handler(state: dict[str, Any]) -> dict[str, Any]:
        message = {
            "node": node["id"],
            "template": cfg.get("template"),
            "employee_id": state.get("employee_id"),
        }
        context.notifier.notify(target, message)
        sent = list(state.get("notifications_sent", []) or [])
        sent.append(target)
        return {"notifications_sent": sent}

    return handler


def _start_agent_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Delegate to a sub-agent via ``AgentClient`` and record the delegation."""
    cfg = _config(node)
    agent = cfg.get("agent")

    def handler(state: dict[str, Any]) -> dict[str, Any]:
        result = context.agents.delegate(agent, state)
        return {"delegated_agent": agent, "delegation": result}

    return handler


def _condition_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Compute/store the boolean(s) the existing ``_make_router`` reads off state.

    The router keys on the edge's ``condition`` string (e.g. ``state.get("approved")``). This
    handler is a pass-through by default -- the boolean is expected to already live in state
    (set upstream by collect/enrich/human_input). A config-declared default keeps router behavior
    intact even when nothing upstream set it.
    """
    cfg = _config(node)
    defaults = cfg.get("defaults", {}) or {}

    def handler(state: dict[str, Any]) -> dict[str, Any]:
        delta: dict[str, Any] = {}
        for key, value in defaults.items():
            if key not in state:
                delta[key] = value
        return delta

    return handler


def _noop_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Control nodes (human_input, end): the runner owns the transition; handler does nothing."""

    def handler(state: dict[str, Any]) -> dict[str, Any]:
        return {}

    return handler


_HANDLERS: dict[str, Callable[[dict[str, Any], ExecutionContext], Handler]] = {
    "collect": _collect_handler,
    "entity_tool": _entity_tool_handler,
    "enrich": _enrich_handler,
    "notify": _notify_handler,
    "start_agent": _start_agent_handler,
    "condition": _condition_handler,
    "human_input": _noop_handler,
    "end": _noop_handler,
}

# step_types whose handler performs a side effect / state delta and should run in the runner.
SIDE_EFFECTING_STEP_TYPES: frozenset[str] = frozenset(
    {"collect", "entity_tool", "enrich", "notify", "start_agent", "condition"}
)


def make_handler(node: dict[str, Any], context: ExecutionContext) -> Handler:
    """Build the backend-agnostic handler closure for a node.

    Unknown step types fall back to a no-op so the graph still builds (validation catches them).
    """
    factory = _HANDLERS.get(node.get("step_type"), _noop_handler)
    handler = factory(node, context)
    handler.__name__ = f"handle_{node['id']}"
    return handler

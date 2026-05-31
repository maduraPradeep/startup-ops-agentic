"""
LangGraph agent service — stub implementation.
Replace with real LangGraph graph definitions when building out agents.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from graph_builder import ExecutionService

app = FastAPI(title="Ops Platform — LangGraph Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory workflow state (replace with LangGraph persistence) ──────────
_workflows: dict[str, dict] = {}

# ── Phase 1c skill-execution bridge ─────────────────────────────────────────
# Drives compiled skills (langgraph_def) sent by the TS gateway. Uses the real langgraph backend
# when installed, else the in-memory ExecutionRunner — pause/resume works either way.
_executions = ExecutionService()


# ── Request / response models ──────────────────────────────────────────────

class MessageRequest(BaseModel):
    conversationId: str
    content: str
    channel: str
    tenantId: str
    actor: dict[str, Any]


class ActionRequest(BaseModel):
    collection: str
    entityId: str
    action: str
    payload: dict[str, Any] | None = None
    actor: dict[str, Any]
    tenantId: str


class CancelRequest(BaseModel):
    actor: dict[str, Any]
    tenantId: str


class StartExecutionRequest(BaseModel):
    """Trigger a compiled skill. ``definition`` is the @ops/compiler ``langgraph_def``."""

    definition: dict[str, Any]
    initial_state: dict[str, Any] | None = None
    execution_id: str | None = None  # the gateway's skill_executions row id (shared id)
    tenant_id: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/invoke/message")
async def invoke_message(body: MessageRequest) -> dict:
    """
    Stub: route user message to the appropriate agent and return a response.
    Real implementation: LangGraph orchestrator graph with intake → specialist agents.
    """
    workflow_id = str(uuid.uuid4())

    # Create a stub workflow for the conversation
    _workflows[workflow_id] = {
        "workflow_id": workflow_id,
        "name": f"Processing: {body.content[:40]}…",
        "current_state": "initiated",
        "progress": 10,
        "history": [
            {"state": "initiated", "timestamp": datetime.utcnow().isoformat(), "agent": "intake"}
        ],
        "participants": [body.actor.get("userId", "")],
        "tenant_id": body.tenantId,
    }

    return {
        "type": "message",
        "conversationId": body.conversationId,
        "content": (
            f"I received your message: \"{body.content}\". "
            "I'm processing this request — a workflow has been initiated."
        ),
        "sender": {
            "type": "agent",
            "id": "intake",
            "name": "Intake Agent",
            "avatar": "🤖",
            "color": "#6366f1",
        },
        "payload": {
            "type": "workflow_status",
            "workflow": _workflows[workflow_id],
        },
        "workflow_id": workflow_id,
    }


@app.post("/invoke/action")
async def invoke_action(body: ActionRequest) -> dict:
    """
    Stub: execute an entity action via the appropriate specialist agent.
    Real implementation: action-specific LangGraph subgraph.
    """
    workflow_id = str(uuid.uuid4())

    _workflows[workflow_id] = {
        "workflow_id": workflow_id,
        "name": f"{body.action} on {body.collection}/{body.entityId}",
        "current_state": "collecting_info",
        "progress": 25,
        "history": [
            {"state": "initiated",       "timestamp": datetime.utcnow().isoformat(), "agent": "orchestrator"},
            {"state": "collecting_info", "timestamp": datetime.utcnow().isoformat(), "agent": "policy"},
        ],
        "participants": [body.actor.get("userId", "")],
        "tenant_id": body.tenantId,
    }

    return {
        "status": "initiated",
        "workflow_id": workflow_id,
        "message": f"Action '{body.action}' initiated for {body.collection}/{body.entityId}",
    }


@app.get("/workflows/active")
async def list_active_workflows(tenantId: str) -> list[dict]:
    """Return active workflows for a tenant."""
    return [
        wf for wf in _workflows.values()
        if wf.get("tenant_id") == tenantId
        and wf.get("current_state") not in ("completed", "rejected", "error")
    ]


@app.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> dict:
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


# ── Skill execution (Phase 1c bridge) ───────────────────────────────────────

@app.post("/executions")
async def start_execution(body: StartExecutionRequest) -> dict:
    """Build + run a compiled skill; return the execution snapshot (state + pause point)."""
    try:
        snapshot = _executions.start(
            body.definition,
            initial_state=body.initial_state,
            execution_id=body.execution_id,
            tenant_id=body.tenant_id,
        )
    except ValueError as exc:  # IR validation failed
        raise HTTPException(status_code=400, detail=str(exc))
    return snapshot.to_dict()


@app.post("/executions/{execution_id}/resume")
async def resume_execution(execution_id: str) -> dict:
    """Advance a parked run past one interrupt (human input / approval gate)."""
    try:
        return _executions.resume(execution_id).to_dict()
    except KeyError:
        raise HTTPException(status_code=404, detail="Execution not found")


@app.get("/executions/{execution_id}")
async def get_execution(execution_id: str) -> dict:
    try:
        return _executions.get(execution_id).to_dict()
    except KeyError:
        raise HTTPException(status_code=404, detail="Execution not found")


@app.post("/workflows/{workflow_id}/cancel")
async def cancel_workflow(workflow_id: str, body: CancelRequest) -> dict:
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf["current_state"] = "rejected"
    wf["progress"] = 100
    wf["history"].append({
        "state": "rejected",
        "timestamp": datetime.utcnow().isoformat(),
        "agent": "orchestrator",
        "message": f"Cancelled by {body.actor.get('email', 'unknown')}",
    })

    return {"status": "cancelled", "workflow_id": workflow_id}

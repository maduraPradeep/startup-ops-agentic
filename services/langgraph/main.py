"""
LangGraph agent service implementation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, TypedDict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
import httpx
import os

app = FastAPI(title="Ops Platform — LangGraph Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── LangGraph State Definition ─────────────────────────────────────────────

class AgentState(TypedDict):
    conversation_id: Optional[str]
    content: Optional[str]
    action: Optional[str]
    collection: Optional[str]
    entity_id: Optional[str]
    payload: Optional[Dict[str, Any]]
    actor: Dict[str, Any]
    tenant_id: str

    # Internal state
    status: str
    progress: int
    history: List[Dict[str, Any]]
    validation_results: Optional[Dict[str, Any]]
    output: Optional[Dict[str, Any]]

# ── Node Implementations ───────────────────────────────────────────────────

def intake_node(state: AgentState) -> Dict[str, Any]:
    print(f"--- INTAKE: {state.get('action') or state.get('content')} ---")
    history = list(state.get("history", []))
    history.append({
        "state": "initiated",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent": "intake"
    })

    return {
        "status": "initiated",
        "progress": 10,
        "history": history
    }

def policy_agent_node(state: AgentState) -> Dict[str, Any]:
    print("--- POLICY AGENT: Validating ---")
    action = state.get("action")
    payload = state.get("payload") or {}

    validation = {"valid": True, "notes": "Policy check passed automatically."}

    # Simple simulated policy logic
    if action == "approveRequest":
        pass
    elif action == "rejectRequest":
        if not payload.get("approval_notes"):
            validation = {"valid": True, "notes": "Rejection policy: notes are recommended but not mandatory."}

    history = list(state.get("history", []))
    history.append({
        "state": "validating",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent": "policy",
        "message": validation["notes"]
    })

    return {
        "status": "validated",
        "progress": 50,
        "validation_results": validation,
        "history": history
    }

def orchestrator_node(state: AgentState) -> Dict[str, Any]:
    print("--- ORCHESTRATOR: Finalizing ---")
    action = state.get("action")
    content = state.get("content")

    output = {}
    if action:
        output = {
            "type": "action_result",
            "status": "completed",
            "message": f"Action '{action}' processed successfully."
        }
    else:
        output = {
            "type": "message",
            "content": f"I've processed your request: {content}",
            "sender": {
                "type": "agent",
                "id": "orchestrator",
                "name": "Orchestrator",
                "avatar": "🤖",
                "color": "#6366f1",
            }
        }

    history = list(state.get("history", []))
    history.append({
        "state": "completed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent": "orchestrator"
    })

    return {
        "status": "completed",
        "progress": 100,
        "output": output,
        "history": history
    }

# ── Graph Construction ─────────────────────────────────────────────────────

workflow = StateGraph(AgentState)

workflow.add_node("intake", intake_node)
workflow.add_node("policy", policy_agent_node)
workflow.add_node("orchestrator", orchestrator_node)

workflow.set_entry_point("intake")
workflow.add_edge("intake", "policy")
workflow.add_edge("policy", "orchestrator")
workflow.add_edge("orchestrator", END)

executor = workflow.compile()

# ── In-memory store for workflows ──────────────────────────────────────────
_workflows: Dict[str, Dict] = {}

DIRECTUS_URL = os.getenv("DIRECTUS_URL", "http://localhost:8055")
DIRECTUS_TOKEN = os.getenv("DIRECTUS_ADMIN_TOKEN", "your-static-admin-token")

async def get_workflow_definitions(tenant_id: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{DIRECTUS_URL}/items/workflow_definitions",
            params={"filter": {"tenant_id": {"_eq": tenant_id}, "status": {"_eq": "active"}}},
            headers={"Authorization": f"Bearer {DIRECTUS_TOKEN}"}
        )
        if response.status_code == 200:
            return response.json().get("data", [])
        return []

# ── Request / response models ──────────────────────────────────────────────

class MessageRequest(BaseModel):
    conversationId: str
    content: str
    channel: str
    tenantId: str
    actor: Dict[str, Any]

class ActionRequest(BaseModel):
    collection: str
    entityId: str
    action: str
    payload: Optional[Dict[str, Any]] = None
    actor: Dict[str, Any]
    tenantId: str

class CancelRequest(BaseModel):
    actor: Dict[str, Any]
    tenantId: str

# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> Dict:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.post("/invoke/message")
async def invoke_message(body: MessageRequest) -> Dict:
    # Look for matching workflow definitions
    definitions = await get_workflow_definitions(body.tenantId)
    # Simple matching logic: for now just take the first one or default to generic agent
    # In a real app, we'd use LLM to decide which workflow to trigger

    active_wf_def = next((d for d in definitions if d["trigger"]["type"] == "message"), None)

    workflow_id = str(uuid.uuid4())

    initial_state: AgentState = {
        "conversation_id": body.conversationId,
        "content": body.content,
        "action": None,
        "collection": None,
        "entity_id": None,
        "payload": None,
        "actor": body.actor,
        "tenant_id": body.tenantId,
        "status": "starting",
        "progress": 0,
        "history": [],
        "validation_results": None,
        "output": None
    }

    result = executor.invoke(initial_state)

    # Store workflow state
    _workflows[workflow_id] = {
        "workflow_id": workflow_id,
        "name": active_wf_def["name"] if active_wf_def else f"Message: {body.content[:30]}...",
        "current_state": result["status"],
        "progress": result["progress"],
        "history": result["history"],
        "participants": [body.actor.get("userId", "")],
        "tenant_id": body.tenantId,
    }

    output = result["output"]
    return {
        **output,
        "conversationId": body.conversationId,
        "workflow_id": workflow_id,
        "payload": {
            "type": "workflow_status",
            "workflow": _workflows[workflow_id],
        }
    }

@app.post("/invoke/action")
async def invoke_action(body: ActionRequest) -> Dict:
    workflow_id = str(uuid.uuid4())

    initial_state: AgentState = {
        "conversation_id": None,
        "content": None,
        "action": body.action,
        "collection": body.collection,
        "entity_id": body.entityId,
        "payload": body.payload,
        "actor": body.actor,
        "tenant_id": body.tenantId,
        "status": "starting",
        "progress": 0,
        "history": [],
        "validation_results": None,
        "output": None
    }

    result = executor.invoke(initial_state)

    _workflows[workflow_id] = {
        "workflow_id": workflow_id,
        "name": f"{body.action} on {body.collection}/{body.entityId}",
        "current_state": result["status"],
        "progress": result["progress"],
        "history": result["history"],
        "participants": [body.actor.get("userId", "")],
        "tenant_id": body.tenantId,
    }

    return {
        "status": result["status"],
        "workflow_id": workflow_id,
        "message": result["output"]["message"] if result["output"] else f"Action {body.action} initiated",
    }

@app.get("/workflows/active")
async def list_active_workflows(tenantId: str) -> List[Dict]:
    return [
        wf for wf in _workflows.values()
        if wf.get("tenant_id") == tenantId
        and wf.get("current_state") not in ("completed", "rejected", "error")
    ]

@app.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> Dict:
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf

@app.post("/workflows/{workflow_id}/cancel")
async def cancel_workflow(workflow_id: str, body: CancelRequest) -> Dict:
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf["current_state"] = "rejected"
    wf["progress"] = 100
    wf["history"].append({
        "state": "rejected",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent": "orchestrator",
        "message": f"Cancelled by {body.actor.get('email', 'unknown')}",
    })

    return {"status": "cancelled", "workflow_id": workflow_id}

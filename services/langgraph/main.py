"""
LangGraph agent service implementation.
"""
from __future__ import annotations

import asyncio
import json
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

DIRECTUS_URL = os.getenv("DIRECTUS_URL", "http://localhost:8055")
DIRECTUS_TOKEN = os.getenv("DIRECTUS_ADMIN_TOKEN", "your-static-admin-token")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

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

# ── Directus helpers (sync wrappers for use inside LangGraph nodes) ─────────

def _directus_get_sync(path: str, params: Optional[Dict] = None) -> Any:
    """Synchronous Directus GET request for use inside LangGraph sync nodes."""
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                f"{DIRECTUS_URL}{path}",
                params=params,
                headers={"Authorization": f"Bearer {DIRECTUS_TOKEN}"}
            )
            if response.status_code == 200:
                return response.json().get("data", [])
    except Exception as e:
        print(f"Directus GET {path} error: {e}")
    return []


async def _directus_get_async(path: str, params: Optional[Dict] = None) -> Any:
    """Async Directus GET request for use in FastAPI route handlers."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{DIRECTUS_URL}{path}",
                params=params,
                headers={"Authorization": f"Bearer {DIRECTUS_TOKEN}"}
            )
            if response.status_code == 200:
                return response.json().get("data")
    except Exception as e:
        print(f"Directus GET {path} error: {e}")
    return None


async def _directus_post_async(path: str, data: Dict) -> Optional[Dict]:
    """Async Directus POST request for persisting records."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{DIRECTUS_URL}{path}",
                json=data,
                headers={
                    "Authorization": f"Bearer {DIRECTUS_TOKEN}",
                    "Content-Type": "application/json",
                }
            )
            if response.status_code in (200, 201):
                return response.json().get("data")
            print(f"Directus POST {path} returned {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Directus POST {path} error: {e}")
    return None


async def _directus_patch_async(path: str, data: Dict) -> Optional[Dict]:
    """Async Directus PATCH request for updating existing records."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.patch(
                f"{DIRECTUS_URL}{path}",
                json=data,
                headers={
                    "Authorization": f"Bearer {DIRECTUS_TOKEN}",
                    "Content-Type": "application/json",
                }
            )
            if response.status_code in (200, 201):
                return response.json().get("data")
            print(f"Directus PATCH {path} returned {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Directus PATCH {path} error: {e}")
    return None


async def persist_workflow(workflow_id: str, workflow_record: Dict) -> None:
    """
    Write or update a workflow record in Directus.
    Falls back silently if Directus is unavailable.
    """
    # Directus stores JSON fields — ensure they are serialisable
    record = {
        "workflow_id": workflow_record["workflow_id"],
        "name": workflow_record["name"],
        "current_state": workflow_record["current_state"],
        "progress": workflow_record["progress"],
        "history": workflow_record["history"],
        "participants": workflow_record["participants"],
        "tenant_id": workflow_record["tenant_id"],
    }

    # Check if record already exists by workflow_id
    existing = await _directus_get_async(
        "/items/workflows",
        params={"filter[workflow_id][_eq]": workflow_id, "limit": 1}
    )
    if isinstance(existing, list) and existing:
        item_id = existing[0].get("id")
        if item_id:
            await _directus_patch_async(f"/items/workflows/{item_id}", record)
            return

    await _directus_post_async("/items/workflows", record)


async def fetch_workflow_from_directus(workflow_id: str) -> Optional[Dict]:
    """Fetch a single workflow record from Directus by workflow_id."""
    data = await _directus_get_async(
        "/items/workflows",
        params={"filter[workflow_id][_eq]": workflow_id, "limit": 1}
    )
    if isinstance(data, list) and data:
        return data[0]
    return None


async def fetch_active_workflows_from_directus(tenant_id: str) -> List[Dict]:
    """Fetch all non-terminal workflows for a tenant from Directus."""
    data = await _directus_get_async(
        "/items/workflows",
        params={
            "filter[tenant_id][_eq]": tenant_id,
            "filter[current_state][_nin]": "completed,rejected,error",
        }
    )
    if isinstance(data, list):
        return data
    return []

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


def _fetch_leave_policies_sync(tenant_id: str, collection: Optional[str]) -> List[Dict]:
    """Fetch leave policies from Directus for the given tenant (sync)."""
    if not collection or "leave" not in collection.lower():
        return []
    params: Dict = {"filter[tenant_id][_eq]": tenant_id, "limit": 100}
    result = _directus_get_sync("/items/leave_policies", params)
    if isinstance(result, list):
        return result
    return []


def _fetch_overlapping_leaves_sync(entity_id: Optional[str], payload: Dict) -> List[Dict]:
    """
    Fetch approved leave requests that could overlap with the requested period (sync).
    Uses start_date / end_date from payload if available.
    """
    if not entity_id:
        return []
    params: Dict = {
        "filter[employee_id][_eq]": entity_id,
        "filter[status][_eq]": "approved",
        "limit": 50,
    }
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    if start_date:
        params["filter[end_date][_gte]"] = start_date
    if end_date:
        params["filter[start_date][_lte]"] = end_date
    result = _directus_get_sync("/items/leave_requests", params)
    if isinstance(result, list):
        return result
    return []


def _check_policy_rules(
    policies: List[Dict],
    overlapping: List[Dict],
    payload: Dict,
) -> Dict[str, Any]:
    """
    Explicit (non-LLM) policy rule checks. Returns validation dict.
    """
    notes = []

    for policy in policies:
        # Check max_days_per_year (column name in schema)
        max_days = policy.get("max_days_per_year") or policy.get("max_days")
        requested_days = payload.get("days_requested") or payload.get("days") or payload.get("duration_days")
        if max_days is not None and requested_days is not None:
            try:
                if float(requested_days) > int(max_days):
                    return {
                        "valid": False,
                        "notes": f"Request exceeds maximum allowed days ({max_days})."
                    }
            except (ValueError, TypeError):
                pass

        # Check blackout_dates
        blackout_dates = policy.get("blackout_dates") or []
        if isinstance(blackout_dates, str):
            try:
                blackout_dates = json.loads(blackout_dates)
            except Exception:
                blackout_dates = []
        start_date = payload.get("start_date", "")
        end_date = payload.get("end_date", "")
        for bd in blackout_dates:
            if start_date and bd and start_date <= bd <= (end_date or start_date):
                return {
                    "valid": False,
                    "notes": f"Request falls on a blackout date: {bd}."
                }

        # Check notice_days_required (column name in schema)
        min_notice = policy.get("notice_days_required") or policy.get("min_days_notice")
        if min_notice is not None and start_date:
            try:
                from datetime import date
                requested_start = date.fromisoformat(start_date)
                days_notice = (requested_start - date.today()).days
                if days_notice < int(min_notice):
                    return {
                        "valid": False,
                        "notes": f"Insufficient notice: {days_notice} days given, {min_notice} required."
                    }
            except (ValueError, TypeError):
                pass

    if overlapping:
        notes.append(
            f"Note: {len(overlapping)} overlapping approved leave request(s) found for this employee."
        )

    return {"valid": True, "notes": " ".join(notes) if notes else "Policy check passed."}


def policy_agent_node(state: AgentState) -> Dict[str, Any]:
    print("--- POLICY AGENT: Validating ---")
    action = state.get("action")
    payload = state.get("payload") or {}
    tenant_id = state.get("tenant_id", "")
    collection = state.get("collection")
    entity_id = state.get("entity_id")

    validation: Dict[str, Any] = {"valid": True, "notes": "Policy check passed automatically."}

    if action == "approveRequest":
        # ── Task 6: Fetch leave policies and overlapping leave requests ──────
        policies = _fetch_leave_policies_sync(tenant_id, collection)
        overlapping = _fetch_overlapping_leaves_sync(entity_id, payload)

        # ── Task 1: Try Claude for policy evaluation ─────────────────────────
        if ANTHROPIC_API_KEY:
            try:
                import anthropic
                client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

                policies_text = json.dumps(policies, indent=2) if policies else "No specific policies found."
                overlapping_text = (
                    json.dumps(overlapping, indent=2) if overlapping else "None."
                )
                payload_text = json.dumps(payload, indent=2)

                system_prompt = (
                    "You are a leave policy compliance agent. Evaluate whether a leave request "
                    "should be approved based on the company policies and existing approved leaves. "
                    "Respond ONLY with a JSON object in the exact format: "
                    '{"valid": true|false, "notes": "<brief reason>"}'
                )
                user_message = (
                    f"Leave request details:\n{payload_text}\n\n"
                    f"Company leave policies:\n{policies_text}\n\n"
                    f"Overlapping approved leave requests for this employee:\n{overlapping_text}\n\n"
                    "Evaluate whether this request complies with the policies. "
                    "Reply with the JSON decision only."
                )

                response = client.messages.create(
                    model="claude-sonnet-4-5",
                    max_tokens=256,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                )
                raw = response.content[0].text.strip()
                # Extract JSON even if there is surrounding text
                start = raw.find("{")
                end = raw.rfind("}") + 1
                if start != -1 and end > start:
                    validation = json.loads(raw[start:end])
                else:
                    raise ValueError("No JSON found in Claude response")

            except Exception as e:
                print(f"Claude policy evaluation failed ({e}), falling back to rule check")
                validation = _check_policy_rules(policies, overlapping, payload)
        else:
            # No API key — use explicit rule-based check with fetched data
            validation = _check_policy_rules(policies, overlapping, payload)

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
    validation_results = state.get("validation_results") or {}
    actor = state.get("actor") or {}

    output: Dict[str, Any] = {}

    if action:
        # ── Task 1: Try Claude to generate a natural language action summary ─
        if ANTHROPIC_API_KEY:
            try:
                import anthropic
                client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

                actor_name = actor.get("name") or actor.get("email") or "a user"
                validation_note = validation_results.get("notes", "")
                valid = validation_results.get("valid", True)
                decision = "approved" if valid else "rejected"

                response = client.messages.create(
                    model="claude-sonnet-4-5",
                    max_tokens=128,
                    messages=[
                        {
                            "role": "user",
                            "content": (
                                f"Generate a brief, professional one-sentence notification message for "
                                f"the following workflow result. "
                                f"Action: '{action}'. "
                                f"Actor: {actor_name}. "
                                f"Decision: {decision}. "
                                f"Policy notes: {validation_note}. "
                                "Reply with only the message text, no quotes."
                            )
                        }
                    ],
                )
                message_text = response.content[0].text.strip()
                output = {
                    "type": "action_result",
                    "status": "completed",
                    "message": message_text,
                }
            except Exception as e:
                print(f"Claude orchestrator generation failed ({e}), using fallback")
                output = {
                    "type": "action_result",
                    "status": "completed",
                    "message": f"Action '{action}' processed successfully."
                }
        else:
            output = {
                "type": "action_result",
                "status": "completed",
                "message": f"Action '{action}' processed successfully."
            }
    else:
        # Message workflow
        if ANTHROPIC_API_KEY:
            try:
                import anthropic
                client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

                response = client.messages.create(
                    model="claude-sonnet-4-5",
                    max_tokens=256,
                    system=(
                        "You are a helpful operations assistant for a startup. "
                        "Respond concisely and professionally to the user's message."
                    ),
                    messages=[
                        {"role": "user", "content": content or ""}
                    ],
                )
                reply_text = response.content[0].text.strip()
                output = {
                    "type": "message",
                    "content": reply_text,
                    "sender": {
                        "type": "agent",
                        "id": "orchestrator",
                        "name": "Orchestrator",
                        "avatar": "🤖",
                        "color": "#6366f1",
                    }
                }
            except Exception as e:
                print(f"Claude message generation failed ({e}), using fallback")
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

# ── In-memory store for workflows (cache — Directus is source of truth) ────
_workflows: Dict[str, Dict] = {}

# ── Directus async helpers (used only in routes) ───────────────────────────

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

    wf_record = {
        "workflow_id": workflow_id,
        "name": active_wf_def["name"] if active_wf_def else f"Message: {body.content[:30]}...",
        "current_state": result["status"],
        "progress": result["progress"],
        "history": result["history"],
        "participants": [body.actor.get("userId", "")],
        "tenant_id": body.tenantId,
    }

    # Store in cache and persist to Directus
    _workflows[workflow_id] = wf_record
    await persist_workflow(workflow_id, wf_record)

    output = result["output"]
    return {
        **output,
        "conversationId": body.conversationId,
        "workflow_id": workflow_id,
        "payload": {
            "type": "workflow_status",
            "workflow": wf_record,
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

    wf_record = {
        "workflow_id": workflow_id,
        "name": f"{body.action} on {body.collection}/{body.entityId}",
        "current_state": result["status"],
        "progress": result["progress"],
        "history": result["history"],
        "participants": [body.actor.get("userId", "")],
        "tenant_id": body.tenantId,
    }

    # Store in cache and persist to Directus
    _workflows[workflow_id] = wf_record
    await persist_workflow(workflow_id, wf_record)

    return {
        "status": result["status"],
        "workflow_id": workflow_id,
        "message": result["output"]["message"] if result["output"] else f"Action {body.action} initiated",
    }

@app.get("/workflows/active")
async def list_active_workflows(tenantId: str) -> List[Dict]:
    # Try Directus first, fall back to in-memory cache
    try:
        directus_results = await fetch_active_workflows_from_directus(tenantId)
        if directus_results:
            return directus_results
    except Exception as e:
        print(f"Directus fetch failed, using in-memory cache: {e}")

    return [
        wf for wf in _workflows.values()
        if wf.get("tenant_id") == tenantId
        and wf.get("current_state") not in ("completed", "rejected", "error")
    ]

@app.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> Dict:
    # Try Directus first
    try:
        wf = await fetch_workflow_from_directus(workflow_id)
        if wf:
            # Refresh local cache
            _workflows[workflow_id] = wf
            return wf
    except Exception as e:
        print(f"Directus fetch failed, using in-memory cache: {e}")

    # Fall back to in-memory
    wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf

@app.post("/workflows/{workflow_id}/cancel")
async def cancel_workflow(workflow_id: str, body: CancelRequest) -> Dict:
    # Try Directus first, then fall back to in-memory
    wf = None
    try:
        wf = await fetch_workflow_from_directus(workflow_id)
        if wf:
            _workflows[workflow_id] = wf
    except Exception as e:
        print(f"Directus fetch failed, using in-memory cache: {e}")

    if not wf:
        wf = _workflows.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    wf["current_state"] = "rejected"
    wf["progress"] = 100
    history = list(wf.get("history") or [])
    history.append({
        "state": "rejected",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent": "orchestrator",
        "message": f"Cancelled by {body.actor.get('email', 'unknown')}",
    })
    wf["history"] = history
    _workflows[workflow_id] = wf

    await persist_workflow(workflow_id, wf)

    return {"status": "cancelled", "workflow_id": workflow_id}

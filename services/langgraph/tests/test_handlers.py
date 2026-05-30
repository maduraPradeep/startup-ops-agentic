"""Phase 1c -- step-handler unit tests (one per step type) + an end-to-end run with handlers
active whose side-effects are observable on the injected fakes (spec section 4.8 step 4)."""

from graph_builder import (
    ExecutionContext,
    ExecutionRunner,
    ExecutionState,
    InMemoryCheckpointer,
    InMemoryEntityClient,
    RecordingAgentClient,
    RecordingNotifier,
    RecordingToolClient,
    build_graph,
    load_add_employee,
    make_handler,
)


def _ctx(**overrides) -> ExecutionContext:
    ctx = ExecutionContext(
        entities=InMemoryEntityClient(),
        tools=RecordingToolClient(),
        notifier=RecordingNotifier(),
        agents=RecordingAgentClient(),
    )
    for key, value in overrides.items():
        setattr(ctx, key, value)
    return ctx


# --- per step type ---------------------------------------------------------


def test_collect_seeds_state():
    node = {
        "id": "collect_details",
        "step_type": "collect",
        "config": {"entity": "people", "fields": ["name", "email"]},
    }
    delta = make_handler(node, _ctx())({"name": "Grace"})
    assert delta["collected"]["entity"] == "people"
    assert delta["collected"]["fields"] == ["name", "email"]
    assert delta["employee_data"]["name"] == "Grace"


def test_entity_tool_describe_returns_schema():
    node = {"id": "load_schema", "step_type": "entity_tool",
            "config": {"entity": "people", "op": "describe"}}
    delta = make_handler(node, _ctx())({})
    assert delta["entity_schema"]["collection"] == "people"
    assert any(f["name"] == "email" for f in delta["entity_schema"]["fields"])


def test_entity_tool_create_writes_through_client_and_lands_in_state():
    entities = InMemoryEntityClient()
    ctx = _ctx(entities=entities)
    node = {"id": "create_employee", "step_type": "entity_tool",
            "config": {"entity": "people", "op": "create"}}
    state = {"employee_data": {"name": "Grace Hopper", "email": "grace@example.com"}}

    delta = make_handler(node, ctx)(state)

    assert delta["entity_record"]["name"] == "Grace Hopper"
    assert delta["employee_id"] == delta["entity_record"]["id"]
    # Wrote through the fake.
    assert len(entities.created) == 1
    assert entities.created[0]["record"]["email"] == "grace@example.com"


def test_enrich_calls_tool_and_merges_output():
    tools = RecordingToolClient()
    ctx = _ctx(tools=tools)
    node = {
        "id": "analyze_linkedin",
        "step_type": "enrich",
        "config": {"tool": "linkedin_analyzer", "tool_inputs": ["linkedin_url"],
                   "output_field": "linkedin_summary"},
    }
    delta = make_handler(node, ctx)({"linkedin_url": "https://lnkd.in/grace"})

    assert tools.calls[0]["tool"] == "linkedin_analyzer"
    assert tools.calls[0]["inputs"] == {"linkedin_url": "https://lnkd.in/grace"}
    assert delta["linkedin_summary"] == "linkedin_analyzer ran"


def test_notify_records_a_message():
    notifier = RecordingNotifier()
    ctx = _ctx(notifier=notifier)
    node = {"id": "notify_owner", "step_type": "notify", "config": {"target": "owner"}}
    delta = make_handler(node, ctx)({"employee_id": "peo-new-1"})

    assert notifier.sent == [
        {"target": "owner", "message": {"node": "notify_owner", "template": None,
                                        "employee_id": "peo-new-1"}}
    ]
    assert delta["notifications_sent"] == ["owner"]


def test_start_agent_records_delegation():
    agents = RecordingAgentClient()
    ctx = _ctx(agents=agents)
    node = {"id": "start_onboarding", "step_type": "start_agent",
            "config": {"agent": "onboarding"}}
    delta = make_handler(node, ctx)({"employee_id": "peo-new-1"})

    assert agents.delegations[0]["agent"] == "onboarding"
    assert delta["delegated_agent"] == "onboarding"
    assert delta["delegation"]["delegated"] is True


def test_condition_routes_both_branches():
    definition = {
        "name": "Branch",
        "entry_point": "check",
        "nodes": [
            {"id": "check", "step_type": "condition", "config": {}},
            {"id": "yes", "step_type": "end", "config": {}},
            {"id": "no", "step_type": "end", "config": {}},
        ],
        "edges": [
            {"from": "check", "to": "yes", "condition": "approved"},
            {"from": "check", "to": "no"},
        ],
    }
    graph = build_graph(definition)
    router = graph.router("check")
    assert router({"approved": True}) == "yes"
    assert router({"approved": False}) == "no"


def test_condition_handler_applies_declared_defaults():
    node = {"id": "check", "step_type": "condition", "config": {"defaults": {"approved": False}}}
    handler = make_handler(node, _ctx())
    assert handler({}) == {"approved": False}
    assert handler({"approved": True}) == {}  # does not clobber upstream value


def test_human_input_and_end_are_noops():
    for step_type in ("human_input", "end"):
        node = {"id": "x", "step_type": step_type, "config": {}}
        assert make_handler(node, _ctx())({"a": 1}) == {}


# --- end to end ------------------------------------------------------------


def test_add_employee_runs_with_handlers_and_records_side_effects():
    ctx = _ctx()
    cp = InMemoryCheckpointer()
    definition = load_add_employee()
    runner = ExecutionRunner(definition, checkpointer=cp, context=ctx)

    assert runner.run(auto_resume=True) == ExecutionState.COMPLETED

    # Invariant preserved: exactly one checkpoint per node.
    assert cp.count(runner.thread_id) == len(definition["nodes"])
    # Observable side-effects on the injected fakes.
    assert len(ctx.entities.created) == 1  # one employee created
    assert ctx.entities.created[0]["entity"] == "people"
    assert len(ctx.notifier.sent) == 2  # notify_owner + welcome_team
    assert {n["target"] for n in ctx.notifier.sent} == {"owner", "all"}
    assert ctx.agents.delegations[0]["agent"] == "onboarding"
    assert ctx.tools.calls[0]["tool"] == "linkedin_analyzer"
    # Post-handler state captured: employee id surfaced and reflected in latest checkpoint.
    assert runner.data.get("employee_id")
    assert cp.get(runner.thread_id)["node"] == "complete"


def test_default_context_is_used_when_none_injected():
    """Zero-wiring: runner with no context still completes and writes through default fakes."""
    runner = ExecutionRunner(load_add_employee())
    assert runner.run(auto_resume=True) == ExecutionState.COMPLETED
    assert runner.data.get("employee_id")

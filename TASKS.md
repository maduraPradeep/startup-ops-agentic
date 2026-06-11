# Phase 1a Vertical Slice — Task List

> AI-Native Operations Platform. This is the spec's **highest-risk, must-start-first**
> deliverable: prove the `skill text → compiled LangGraph → execution` loop end to end,
> with the LLM and all external infra (Directus*, Postgres, Redis) **mocked**.
>
> *Architecture decision: **no Directus.** Postgres is the canonical platform-config store
> in Phase 1b; a thin internal admin UI comes later. Phase 1a reads everything through a
> `Registry` interface whose only implementation here is an in-memory mock.

## The loop this slice proves

```
skill text
  → token parse / resolve            (fail-fast on unknown tokens)
  → compilation cache check          (SHA-256 of skill text + sorted resolved token contexts)
  → LLM compile                      (MOCKED — injectable client returns fixture IR)
  → Structural Validator             (token match · step-type whitelist · entity refs · no SQL/shell · agent tool-scope)
  → Data Flow Validator              (PII gate · broadcast gate · destructive→human_input ancestor)
  → React Flow graph generation
  → Python GraphBuilder.validate()/build_graph()   (IR round-trip)
  → ExecutionRunner                  (ExecutionState transitions · human_input pause · per-node checkpoint)
```

---

## Group A — Shared contract (`@ops/shared`) — no deps

- [x] **A1** `constants/step-types.ts` — `VALID_STEP_TYPES`, `StepType`, `STEP_TYPE_SET`, `DESTRUCTIVE_ENTITY_OPS`.
- [x] **A2** `constants/token-kinds.ts` — token scan regex + valid prefixes.
- [x] **A3** `schemas/tokens.ts` — `TokenKind`, `ParsedToken`, `ResolvedTokenContext`.
- [x] **A4** `schemas/langgraph-ir.ts` — `LangGraphNode/Edge/Definition` Zod (step_type kept as string so bad values reach the validator, not the parser).
- [x] **A5** `schemas/execution.ts` — `ExecutionState` union.
- [x] **A6** `schemas/react-flow.ts` — React Flow node/edge/graph shapes.
- [x] **A7** `schemas/registry.ts` — `EntityDefinition`, `PlatformField`, `ToolRegistryEntry`, `AgentDefinition`, `RoleDefinition`.
- [x] **A8** `schemas/compilation.ts` — `CompilationStage`, `CompilationWarning`, `CompilationSuccess`, `CompilationError`, `CompilationResult`.
- [x] **A9** Wire `schemas/index.ts` + `constants/index.ts` barrels; add `__tests__/phase1a-contract.test.ts`.

## Group B — Compiler package scaffold (`@ops/compiler`) — deps: A

- [x] **B1** `packages/compiler/{package.json,tsconfig.json,vitest.config.ts}` depending on `@ops/shared`.

## Group C — Compiler inputs (mocks) — deps: B

- [x] **C1** `registry/registry-interface.ts` + `registry/fixtures.ts` (Postgres stand-in) + `registry/mock-registry.ts`.
- [x] **C2** `llm/llm-interface.ts` + `llm/mock-llm.ts` + `llm/fixtures.ts` + canonical `fixtures/add-employee.langgraph.json`.

## Group D — Pipeline stages 1–4 — deps: C

- [x] **D1** `parser/token-parser.ts` (fail-fast unknown) + `errors.ts`.
- [x] **D2** `parser/token-resolver.ts`.
- [x] **D3** `prompt/build-prompt.ts` (deterministic).
- [x] **D4** `cache/compilation-cache.ts` (SHA-256, in-memory).

## Group E — Validators stages 5–6 — deps: D

- [x] **E1** `validators/tool-scope-checker.ts` (wildcard scopes).
- [x] **E2** `validators/structural-validator.ts`.
- [x] **E3** `validators/data-flow-validator.ts` (PII / broadcast / destructive).

## Group F — Output + orchestration stages 7–9 — deps: E

- [x] **F1** `flow/react-flow-generator.ts`.
- [x] **F2** `warnings/warning-detector.ts`.
- [x] **F3** `compile-skill.ts` + `index.ts`.
- [x] **F4** Tests: `parser`, `cache`, `tool-scope`, `structural-validator`, `data-flow-validator`, `compile-skill.e2e`.

## Group G — Python GraphBuilder (`services/langgraph`) — parallel after C2

- [x] **G1** `requirements.txt += pytest`; `pytest.ini`; `graph_builder/__init__.py`.
- [x] **G2** `graph_builder/execution_state.py`.
- [x] **G3** `graph_builder/graph_backend.py` + `inmemory_backend.py` + `langgraph_backend.py` (guarded).
- [x] **G4** `graph_builder/checkpointer.py` (in-memory mock PostgresSaver).
- [x] **G5** `graph_builder/builder.py` — `validate()` + `build_graph()`.
- [x] **G6** `graph_builder/runner.py` — state transitions, human_input pause, per-node checkpoint.
- [x] **G7** `graph_builder/fixtures.py` + copy of canonical JSON.
- [x] **G8** `tests/test_validate.py`, `test_build_graph.py`, `test_runner.py`.

## Group H — Round-trip + acceptance — deps: F, G

- [x] **H1** TS test: compiled "Add Employee" IR deep-equals the canonical JSON the Python side consumes.
- [x] **H2** Python test: that same JSON validates, builds, and runs to `completed`.
- [x] **H3** `DEVELOPMENT.md` note: how to run both suites.

---

## Acceptance criteria

1. The Appendix-C **"Add Employee"** skill compiles through all 9 stages → success, 5 token kinds
   parsed, node sequence `entity_tool, collect, human_input, enrich, entity_tool, notify, notify,
   start_agent, end`, `compilation_hash` = 64-hex, `from_cache:false` then `true` (LLM not re-called).
2. Each bad skill is rejected at the **correct stage**:
   - unknown token → `parse`
   - SQL/shell string · bad step_type · token/entity mismatch → `structural_validate`
   - agent missing tool scope → `structural_validate` (`tool_scope`)
   - PII→non-`pii_safe` tool · `@role:all` w/o broadcast perm · destructive tool w/o `human_input`
     ancestor → `data_flow_validate`
3. Python `validate()` flags missing entry_point, dangling edges, bad step_type, condition node ≠ 2
   outgoing edges, no terminal node (accumulating). `build_graph()` builds via in-memory backend;
   `ExecutionRunner` runs Add Employee to `completed`, one checkpoint per node, correct pause states.
4. The same JSON validates/builds/runs on the Python side (round-trip).

## Verification

```bash
# TypeScript (repo root)
pnpm install
pnpm --filter @ops/shared test
pnpm --filter @ops/compiler test
pnpm --filter @ops/shared typecheck && pnpm --filter @ops/compiler typecheck

# Python
cd services/langgraph && python -m pytest -v
```

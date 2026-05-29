# Product Requirements Document
## AI-Native Operations Platform

**Version:** 1.0  
**Date:** 2026-05-30  
**Status:** Active  

---

## 1. Product Overview

The AI-Native Operations Platform is a multi-tenant SaaS system that lets non-technical operators define, compile, and run business workflows — called **skills** — without writing code. A skill is authored in natural language (or a structured template), compiled by an LLM into a validated LangGraph execution graph, and run by a Python runtime that enforces data governance, approvals, and audit at every step.

The platform is not a no-code drag-and-drop tool bolted onto an AI chatbot. It is designed from the graph up: the LLM produces a formally validated intermediate representation (IR), every node in the graph is typed and policy-checked before execution, human checkpoints are first-class citizens, and all state is checkpointed to Postgres so workflows survive restarts and can be rolled back safely.

---

## 2. Problem Statement

Mid-market and enterprise operations teams run critical HR, finance, and compliance workflows across a fragmented stack of Slack threads, spreadsheets, email approvals, and point-in-time scripts. The result is:

- **Opaque process state** — no one knows where a leave request or onboarding is without asking.
- **Ungoverned automation** — ad-hoc scripts run with admin credentials, no audit trail, no rollback.
- **High authoring friction** — workflow tools require engineers; business owners can describe workflows in plain text but cannot ship them.
- **Integration silos** — Slack, HR systems, and approval tools are wired by one-off integrations that break and cannot be audited.

The platform solves this by making the LLM the compiler and making the execution runtime the source of truth — not a wrapper around existing tools.

---

## 3. Target Users

### 3.1 Personas

| Persona | Role | Primary Goal |
|---------|------|--------------|
| **Tenant Admin** | Operations Manager / HR Lead | Author and maintain skills; extend the data schema; manage approvals. |
| **Operator** | HR Coordinator / Finance Analyst | Trigger skills on behalf of employees; monitor workflow state; handle approvals. |
| **End User** | Employee | Submit requests (leave, expense) and provide input at human-input steps. |
| **Super Admin** | Platform Owner / DevOps | Manage tenants; inspect raw config; run GDPR operations; view audit logs. |

### 3.2 Primary Persona

The **Tenant Admin** is the primary persona for Phases 1–2. They must be able to:
- Describe a workflow in plain language and get a compiled, validated graph.
- Extend the data schema without touching SQL.
- See exactly what a skill will do before making it live.
- Roll back a skill version without disrupting in-flight executions.

---

## 4. Core Concepts

| Concept | Definition |
|---------|-----------|
| **Skill** | A named, versioned workflow definition authored in text and compiled to a LangGraph IR. |
| **Compilation** | The LLM-powered pipeline that transforms skill text into a validated, executable LangGraph definition. Produces a `compilation_hash` for caching. |
| **Execution** | A runtime instance of a compiled skill. Each execution has an `ExecutionState` machine and is checkpointed to Postgres after every node. |
| **Entity** | A typed data record (Employee, Department, LeaveRequest, etc.) with a fixed core schema plus tenant-extensible `extended_data` (JSONB). |
| **Token** | A typed placeholder in skill text (e.g., `@entity:Employee`, `@tool:send_email`, `@role:hr_manager`). Tokens are resolved against the registry before compilation. |
| **Registry** | The platform-level catalogue of entities, tools, agents, and roles. The canonical source for compilation. |
| **Step Type** | The typed operation a node performs in the graph: `collect`, `enrich`, `entity_tool`, `notify`, `start_agent`, `condition`, `human_input`, `end`. |
| **Tenant** | An isolated organisational unit. All entity data and skill authoring is scoped to a tenant; the platform config layer is shared. |

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Channels                                                       │
│  WebChat (Next.js)  ◄──►  Slack Bot  ◄──►  (Email / Mobile)   │
└────────────────────────────┬────────────────────────────────────┘
                             │ JWT-authenticated HTTP / WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│  API Gateway (Fastify)                                          │
│  Auth (GoTrue JWT + Redis jti denylist)                        │
│  RBAC authorize() preHandler                                   │
│  Routes: entities / schema / skills / workflows / audit / gdpr │
└───────┬───────────────────────────┬────────────────────────────┘
        │                           │
┌───────▼───────┐         ┌─────────▼──────────────┐
│  @ops/compiler│         │  Skill Executor Service │
│  (TypeScript) │         │  (calls Python runtime) │
│  9-stage      │         └─────────┬──────────────┘
│  compile      │                   │
│  pipeline     │         ┌─────────▼──────────────┐
└───────────────┘         │  LangGraph Runtime      │
                          │  (Python)               │
                          │  GraphBuilder +         │
                          │  ExecutionRunner +      │
                          │  PostgresSaver          │
                          └─────────┬──────────────┘
                                    │
┌────────────────────────────────────▼───────────────────────────┐
│  Supabase (managed Postgres)                                    │
│  Platform config · Entity data · Compilations · Executions    │
│  Audit logs · Notification deliveries · LangGraph checkpoints  │
└─────────────────────────────────────────────────────────────────┘
        │                           │
┌───────▼───────┐         ┌─────────▼──────────────┐
│  Redis        │         │  Supabase Studio        │
│  jti denylist │         │  Internal admin UI      │
│  rate limits  │         │  (super_admin only)     │
│  pub/sub      │         └────────────────────────┘
│  streams      │
└───────────────┘
```

**Key architectural constraints:**

- All entity and skill mutations flow through Fastify — no client-direct PostgREST writes. RLS is defense-in-depth, not the authorization model.
- The LLM compiles; the validator gates. A Claude output that fails structural or data-flow validation is never executed.
- Python owns the execution runtime. TypeScript owns the API surface and compilation pipeline.
- Redis owns `jti` revocation and rate limiting even when using Supabase Auth (GoTrue has no per-token denylist).

---

## 6. Feature Scope by Phase

### Phase 1a — Compilation Spike ✅ Complete

Prove the `skill text → compiled LangGraph → execution` loop end to end with all external dependencies mocked.

**Delivered:**
- `@ops/shared`: all canonical schemas (tokens, IR, execution state, registry shapes, compilation result).
- `@ops/compiler`: 9-stage pipeline (parse → resolve → prompt → cache → LLM → structural validate → data-flow validate → React Flow generate → IR output).
- Python `GraphBuilder` / `ExecutionRunner` with in-memory backend and checkpointer.
- Round-trip test: the canonical "Add Employee" skill compiles in TypeScript and validates/builds/runs in Python.

---

### Phase 1b — Core Platform 📋 Planned

Turn the in-memory slice into a running, persistent, multi-tenant API.

**Scope:**

| # | Deliverable |
|---|-------------|
| 1 | Supabase project provisioned; local dev via `supabase start`. |
| 2 | SQL migrations: `entity_definitions`, `platform_fields`, `tool_registry`, `agent_definitions`, `default_skills`, `roles`, `tenants`, `employees`, `departments`, `leave_policies`, `leave_requests`, `skill_compilations`, `skill_executions`. |
| 3 | Row-Level Security policies: tenant isolation on entity and skill tables. |
| 4 | `PostgresRegistry` implementing the `Registry` interface against Supabase. |
| 5 | Redis L2 cache (gzip, single-flight, 5-min TTL) in front of `PostgresRegistry`. |
| 6 | `GET /entities/:collection/describe` — Tier 1 + Tier 2 field merge. |
| 7 | Entity CRUD: `GET/POST/PATCH /entities/:collection[/:id]`. |
| 8 | Schema Builder API: `POST /admin/schema/:entity/fields` (409 on conflict), `PUT` update. |
| 9 | Supabase Auth (GoTrue) JWT verification in Fastify; Redis `jti` denylist. |
| 10 | `ClaudeLLM` implementing `LLMClient` against Claude Sonnet. |
| 11 | `POST /admin/skills/compile` wired to `compileSkill()`. |
| 12 | Schema Builder UI (tenant field extensions, conflict resolution). |
| 13 | Skill Editor UI (token autocomplete, compile button, visual validation panel, `FlowEditor` fallback). |
| 14 | Supabase Studio wired as internal admin surface. |

**Acceptance exit:** A tenant admin can extend a schema, author a skill, compile it with real Claude, see the validation graph, and persist the result — with RLS enforcing tenant isolation.

---

### Phase 1c — Skill Execution 📋 Planned

Make compiled skills actually run against a real LangGraph service.

**Scope:**

| # | Deliverable |
|---|-------------|
| 1 | Install `langgraph`; enable `LangGraphBackend`; wire `PostgresSaver` against Supabase. |
| 2 | Step handlers for all step types: `collect`, `enrich`, `entity_tool`, `notify`, `start_agent`, `condition`, `human_input`, `end`. |
| 3 | Skill lifecycle: `draft → compiled → validated → live → archived`. |
| 4 | `POST /admin/skills/{publish,validate,rollback,fork/:id}` lifecycle routes. |
| 5 | `ExecutionState` machine over the wire; `awaiting_human_input` vs `awaiting_approval`. |
| 6 | Compilation cache at rest in `skill_compilations` table (7-day window, keyed by `compilation_hash`). |
| 7 | Default skills: Leave Request and Employee Onboarding authored as `default_skills` rows. |
| 8 | WebSocket + SSE fallback for real-time execution state streaming. |
| 9 | Single-role approval flow: `POST /workflows/:id/approve`. |
| 10 | Rollback: `live_compilation_id` / `previous_compilation_id` swap; in-flight executions unaffected (pinned compilation). |
| 11 | `SkillEditor` lifecycle controls; `WorkflowStatusCard` and `ApprovalCard` UI components. |

**Execution flow:**
```
1. Load skill.live_compilation_id → langgraph_def
2. GraphBuilder.validate(definition)
3. build_graph(definition) → StateGraph
4. Execute node-by-node; update ExecutionState on each transition
5. Pause at human_input → awaiting_human_input | awaiting_approval
6. Resume from Postgres checkpoint
7. Publish state → Redis pub/sub → WebSocket → frontend
8. On error: retry 3× (1s/2s/4s) → retrying → error
9. On completion: completed, notify author
```

**Acceptance exit:** A live skill executes end to end, pauses for input and approval, checkpoints to Postgres, streams state to the UI, and can be rolled back safely.

---

### Phase 1d — Channels + Operations 📋 Planned

Make the platform operable and reachable beyond WebChat.

**Scope:**

| # | Deliverable |
|---|-------------|
| 1 | Slack integration (80% parity): leave request initiation and approval in DMs; rich forms degrade to step-by-step messages; Skill Editor / Schema Builder link back to WebChat. |
| 2 | Durable notification delivery via Redis Streams + consumer group; retry 1s/5s/30s → dead-letter; `notification_deliveries` table; adaptive throttle when backlog > 1000. |
| 3 | Rate limiting: per-user compilation burst (3/min), tenant quota (10/hr), tiered entity bulk writes, WS ping exemption. |
| 4 | `IndexAdvisorService`: nightly `pg_stat_statements` scan, functional index creation on hot `extended_data` fields, 10-index budget per entity per tenant. |
| 5 | GDPR `POST /admin/gdpr/erase/:id` (super_admin): cascade + anonymize + audit redaction. |
| 6 | GDPR `GET /admin/gdpr/export/:id`: full data ZIP. |
| 7 | Audit log viewer in WebChat over monthly-partitioned `audit_logs`. |
| 8 | Phase 1 retrospective and Phase 2 go/no-go decision document. |

**Acceptance exit:** Operable Phase 1 — Slack + WebChat, durable notifications, rate limits, GDPR, and audit viewer — with a clean retrospective.

---

### Phase 2 — Expansion 🔮 Future

**New entities:** Project, ProjectTask, Document, multi-stage ApprovalChain.

**New default skills:** Expense Report, Project Kickoff, Document Approval, Broadcast Announcement.

**New channels:** Email (SMTP/SendGrid), Mobile PWA with push notifications.

**Platform capabilities:**
- Skill library: discover and fork skills across tenants (with publisher consent).
- Fork version notifications: semver bump alerts, security patch propagation.
- Execution history + replay: re-run a past execution from a checkpoint.
- Analytics dashboard: approval SLAs, time-to-resolution, skill usage heatmaps.
- Specialist agents: purpose-built AI agents for HR, Finance, and Legal domains.
- Vector search over policy documents (pgvector, existing Supabase instance).
- Multi-stage ApprovalChain: sequential and parallel approval trees with escalation paths.
- Schema Builder v2: import from CSV / OpenAPI / JSON Schema.

**Compliance:** SOC 2 Type II readiness.

---

### Phase 3 — Scale 🔮 Future

**New entities:** Vendor, Contract, CompensationBand, PerformanceReview.

**New default skills:** Contractor Onboarding, Offboarding, Performance Review Cycle, Contract Renewal.

**Platform capabilities:**
- Skill marketplace: tenant-to-tenant skill publishing with revenue sharing.
- Skill versioning UI: diff view between compilation versions; side-by-side graph comparison.
- `IndexAdvisorService` v2: in-UI recommendations with one-click apply.
- Row-level multi-region data residency (EU, APAC, US shards).
- Advanced rate limiting: tenant-level burst shaping, fairness queues.

**Compliance:** ISO 27001 + ISO 42001 (AI management systems).

---

### Phase 4 — Enterprise 🔮 Future

**Platform capabilities:**
- AI Co-Pilot: proactive skill suggestions based on entity state changes (e.g., contract nearing expiry triggers a renewal skill suggestion).
- Voice interface: skill triggering and human-input responses via voice (WebRTC + STT/TTS pipeline).
- On-premises deployment: Helm chart, air-gapped Supabase, self-hosted Redis and LLM.
- Custom agent builder: tenant-defined specialist agents with scoped tool access.
- Industry skill packs: pre-built, audited skill collections for Healthcare, Financial Services, and Government.
- Global payroll integration + regional compliance rules engine.

---

## 7. Data Model Summary

### 7.1 Platform Config Tables (Shared)

| Table | Purpose |
|-------|---------|
| `entity_definitions` | Registered entity types with their base schema. |
| `platform_fields` | System-defined fields per entity (Tier 1). |
| `tool_registry` | Available tools with input/output schemas and permission scopes. |
| `agent_definitions` | Named agents with their tool scopes. |
| `default_skills` | Platform-provided skills tenants can fork. |
| `roles` | System roles with their permission sets. |
| `tenants` | Tenant records with plan and config. |

### 7.2 Tenant-Scoped Tables

| Table | Purpose |
|-------|---------|
| `employees` | Core columns + `extended_data JSONB` + GIN index. |
| `departments` | Department hierarchy. |
| `leave_policies` | Leave entitlement rules. |
| `leave_requests` | Leave request records. |
| `tenant_field_definitions` | Tenant-added fields (Tier 2). |
| `skills` | Skill versions with lifecycle state. |
| `skill_compilations` | Cached compilation results keyed by `compilation_hash`. |
| `skill_executions` | Execution instances with `ExecutionState` and `compilation_id`. |
| `audit_logs` | Append-only audit trail, monthly-partitioned, 7-year retention. |
| `notification_deliveries` | Delivery records with retry state. |

### 7.3 Entity Schema Pattern

All entities follow the JSONB hybrid pattern:
```sql
-- Typed core columns (Tier 1)
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id UUID NOT NULL REFERENCES tenants(id),
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

-- Tenant-extensible fields (Tier 2)
extended_data JSONB NOT NULL DEFAULT '{}',

-- GIN index on extended_data for tenant-defined field queries
```
RLS policies enforce `tenant_id = current_setting('app.tenant_id')` for all direct or Studio access. The Fastify service role bypasses RLS via the service-role key.

---

## 8. API Surface

### 8.1 Auth

```
POST /auth/login         # Issue JWT via GoTrue
POST /auth/logout        # Add jti to Redis denylist
POST /auth/refresh       # Rotate JWT
```

### 8.2 Entities

```
GET    /api/v1/entities/:collection/describe         # Tier1+Tier2 field merge
GET    /api/v1/entities/:collection                  # List with pagination + filters
POST   /api/v1/entities/:collection                  # Create
GET    /api/v1/entities/:collection/:id              # Read
PATCH  /api/v1/entities/:collection/:id              # Update
DELETE /api/v1/entities/:collection/:id              # Soft delete (audit-first)
```

### 8.3 Schema Builder

```
GET    /api/v1/admin/schema/:entity/fields           # List tenant fields
POST   /api/v1/admin/schema/:entity/fields           # Add field (409 on name conflict)
PUT    /api/v1/admin/schema/:entity/fields/:name     # Update field definition
DELETE /api/v1/admin/schema/:entity/fields/:name     # Remove tenant field
```

### 8.4 Skills

```
GET    /api/v1/admin/skills                          # List skills
POST   /api/v1/admin/skills                          # Create skill (draft)
GET    /api/v1/admin/skills/:id                      # Get skill with compilations
PATCH  /api/v1/admin/skills/:id                      # Update skill text
POST   /api/v1/admin/skills/compile                  # Compile skill text → IR (cached)
POST   /api/v1/admin/skills/tokens/resolve           # Token autocomplete
POST   /api/v1/admin/skills/:id/validate             # Validate compiled skill → validated
POST   /api/v1/admin/skills/:id/publish              # Publish → live
POST   /api/v1/admin/skills/:id/rollback             # Swap live_compilation_id → previous
POST   /api/v1/admin/skills/fork/:id                 # Fork default skill into tenant
```

### 8.5 Workflows (Execution)

```
POST   /api/v1/workflows                             # Trigger skill execution
GET    /api/v1/workflows/:id                         # Get execution state
POST   /api/v1/workflows/:id/input                   # Provide human_input step data
POST   /api/v1/workflows/:id/approve                 # Approve awaiting_approval step
POST   /api/v1/workflows/:id/cancel                  # Cancel in-progress execution
GET    /api/v1/workflows/:id/history                 # Step-by-step execution trace
```

### 8.6 Admin + Operations

```
GET    /api/v1/admin/audit                           # Audit log with filters + pagination
GET    /api/v1/admin/audit/export                    # CSV/JSON export
POST   /api/v1/admin/gdpr/erase/:entityId            # GDPR erasure (super_admin)
GET    /api/v1/admin/gdpr/export/:entityId           # GDPR data export ZIP (super_admin)
```

### 8.7 Real-Time

```
WS  /ws                  # WebSocket connection (JWT in query param or header)
SSE /api/v1/executions/:id/stream   # SSE fallback for execution state
```

---

## 9. Security & Compliance Requirements

### 9.1 Authentication & Authorization

- All API calls require a valid Supabase Auth (GoTrue) JWT.
- JWTs are short-lived (15 min access, 7 day refresh); refresh rotation is enforced.
- `jti` revocation is checked on every request via Redis (O(1) lookup); revoked tokens are denied even before JWT expiry.
- RBAC roles: `super_admin`, `tenant_admin`, `operator`, `end_user`. Every route has an explicit `authorize()` gate.
- WebSocket connections require the same JWT; a revoked `jti` drops the connection immediately.

### 9.2 Data Isolation

- All tenant-scoped queries include an explicit `tenant_id` filter at the app layer.
- RLS policies enforce tenant isolation as defense-in-depth for any direct DB or Studio access.
- The Fastify service role (bypasses RLS) is never exposed to the frontend or skill runtime.

### 9.3 Skill Execution Safety

- A skill text is never executed without passing all 9 compilation stages.
- The Structural Validator blocks: unknown tokens, SQL/shell strings, bad step types, mismatched entity refs, agent tool-scope violations.
- The Data Flow Validator blocks: PII flowing to non-`pii_safe` tools, broadcast without permission, destructive operations without a `human_input` ancestor.
- No skill can execute a raw shell command, arbitrary SQL, or access tools outside its declared scope.

### 9.4 Audit & GDPR

- Every entity mutation and execution state change produces an immutable `audit_logs` row (append-only, monthly-partitioned, 7-year retention).
- GDPR erasure cascades, anonymizes execution records, and redacts PII from audit rows — it does not delete audit rows (retention law compliance).
- Audit log exports are available to `super_admin` with rate limiting.

### 9.5 Transport & Storage

- All API traffic over HTTPS/WSS; mTLS between API and Python runtime in production.
- Secrets (API keys, DB credentials) in environment variables only; never committed to git or stored in the DB.
- `extended_data` JSONB fields containing PII are encrypted at rest via Supabase's Vault for columns explicitly tagged `pii: true` in the tenant field definition.

---

## 10. Non-Functional Requirements

### 10.1 Performance

| Metric | Target |
|--------|--------|
| `GET /describe` p99 latency | < 50 ms (L2 Redis cache hit) |
| `POST /compile` latency (LLM) | < 8 s p95; < 200 ms on cache hit |
| Skill execution startup (graph build) | < 2 s |
| WebSocket state update propagation | < 500 ms end-to-end |
| Entity list query (1,000 rows) | < 100 ms with proper indexing |

### 10.2 Reliability

| Metric | Target |
|--------|--------|
| API uptime | 99.9% monthly |
| Execution checkpoint recovery | Resume within 30 s of restart |
| Notification delivery | At-least-once; dead-letter after 3 retries |
| Compilation success rate (Claude) | ≥ 90%; below this, promote FlowEditor to primary authoring path |

### 10.3 Scalability

- The platform must support 50 concurrent tenants with up to 500 active executions per tenant in Phase 1.
- `PostgresRegistry` queries are designed for connection pooling (PgBouncer-compatible; avoid advisory locks in hot paths).
- Redis pub/sub fan-out is per-tenant; no cross-tenant broadcast.

### 10.4 Developer Experience

- Local dev stack boots with a single `pnpm dev` or `make dev` command.
- All migration changes are applied via `supabase db push`; no manual SQL in CI.
- `@ops/shared` Zod schemas are the single source of truth for TS-to-Python IR contract; the canonical JSON fixture prevents drift.
- The test suite runs in under 60 seconds on a developer machine.

---

## 11. Assumptions & Constraints

| # | Assumption / Constraint |
|---|------------------------|
| 1 | The platform is multi-tenant but not multi-region in Phases 1–2. Row-level residency is a Phase 3 concern. |
| 2 | Claude (Anthropic) is the only LLM in Phase 1. The `LLMClient` interface allows swapping in Phase 2+. |
| 3 | Supabase is the managed Postgres host. Self-hostable if needed (open-source). No lock-in beyond a connection string. |
| 4 | GoTrue (Supabase Auth) issues JWTs. The app layer does not depend on GoTrue-specific claims beyond `sub` and `jti`. |
| 5 | The Python runtime and TypeScript API share the same Postgres connection string; the runtime never calls the API directly. |
| 6 | Slack is the only external channel in Phase 1d. Email and Mobile are Phase 2. |
| 7 | All skill authoring is in English in Phase 1. i18n is a Phase 3 concern. |
| 8 | Compilation output (LangGraph IR) is deterministic given the same skill text + resolved token contexts. The SHA-256 cache key relies on this. |
| 9 | The `FlowEditor` (visual graph editor) is built as a fallback in 1b and promoted to primary authoring only if Claude compilation success rate falls below 90%. |

---

## 12. Success Metrics

### Phase 1 (Foundation)

| Metric | Target |
|--------|--------|
| Compilation success rate (real Claude) | ≥ 90% on well-formed skills |
| Round-trip test coverage (TS + Python) | 100% of canonical skills |
| Tenant isolation test coverage | RLS + app-layer, 100% of entity tables |
| Human-input pause + resume reliability | 100% (no lost checkpoints) |
| Rollback correctness | 100% (in-flight executions unaffected) |

### Phase 2 (Growth)

| Metric | Target |
|--------|--------|
| Tenant onboarding time (first skill live) | < 30 minutes |
| Skill fork adoption rate | > 50% of new tenants fork a default skill |
| Average execution time (Leave Request) | < 2 business days (process metric) |
| Monthly active workflow submissions | > 1,000 per tenant |

### Phase 3+ (Scale)

| Metric | Target |
|--------|--------|
| Marketplace skill listings | > 100 published skills |
| Cross-tenant skill forks | > 500 |
| Approval SLA compliance rate | > 95% within stated SLAs |

---

## 13. Out of Scope (Phase 1)

The following are explicitly deferred and must not be built in Phase 1:

- Email or mobile push notification channels.
- Custom agent builder (tenant-defined agents with custom tools).
- Multi-region data residency.
- Skill marketplace (tenant-to-tenant publishing).
- Voice interface.
- On-premises / air-gapped deployment.
- Advanced analytics dashboard (approval SLAs, funnel metrics).
- Import-from-CSV or OpenAPI for the Schema Builder.
- i18n / localization.
- Any payment or billing integration.

---

## 14. Open Decisions

| # | Decision | Status | Notes |
|---|----------|--------|-------|
| 1 | **Compilation success rate gate** — if real Claude < 90%, promote FlowEditor from fallback to primary authoring path. | Monitor in 1b | FlowEditor is already built as §4.6 downside insurance. |
| 2 | **Multi-region** — deployment-level isolation through Phase 2; row-level in Phase 3. | Deferred | |
| 3 | **Skill marketplace governance** — revenue split, abuse prevention, and version security patches. | Phase 3 design | |
| 4 | **On-prem LLM** — whether to support a self-hosted Claude / OSS model in Phase 4 on-prem deployment. | Phase 4 design | |
| 5 | **Purpose-built React admin** — Supabase Studio replaces Directus as the internal admin surface; a custom React admin is deferred to Phase 2 only if Studio proves insufficient. | Revisit at 1d exit | |

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| IR | Intermediate Representation — the LangGraph JSON emitted by the compiler and consumed by the Python runtime. |
| LangGraph | The Python graph execution framework (from LangChain) that powers the skill runtime. |
| RLS | Row-Level Security — Postgres feature used as tenant isolation defense-in-depth. |
| `jti` | JWT ID — used to revoke individual tokens without waiting for expiry. |
| GoTrue | Supabase's auth service that issues and validates JWTs. |
| FlowEditor | The React Flow–based visual graph editor that allows direct IR editing (Phase 1b fallback). |
| Compilation hash | SHA-256 of (skill text + sorted resolved token contexts); the cache key for `skill_compilations`. |
| Dead-letter | A notification that has exhausted its retry budget and is parked for manual inspection. |
| JSONB hybrid | Entity storage pattern: typed core columns + `extended_data JSONB` for tenant-defined fields. |
| Tier 1 fields | Platform-defined fields on an entity (in `platform_fields`). Always present, not tenant-modifiable. |
| Tier 2 fields | Tenant-defined extension fields (in `tenant_field_definitions`). Live in `extended_data`. |

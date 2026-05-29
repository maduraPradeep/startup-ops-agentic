# Phase 1b — Core Platform (Planning)

**Goal:** Turn the Phase 1a in-memory slice into a running, persistent, multi-tenant API: real
Postgres-backed schema registry and entity storage, JWT auth, the Schema Builder + Skill Editor
UI, and an HTTP surface for compilation.

**Persistence decision: Supabase** (no Directus, no Firebase). Supabase **is Postgres** — so the
canonical store stays relational (JSONB hybrid, pgvector, partitioning, SQL migrations all work
unchanged). We adopt Supabase as **managed Postgres + auth + Studio**, *not* as the app
framework: the Fastify API gateway and Python LangGraph runtime remain the architecture. See
`docs/ROADMAP.md` → "Persistence decision" for the full rationale.

What Supabase gives us:
- **Managed Postgres** (the `PostgresRegistry` connection target) with pgvector available.
- **Row-Level Security** as *defense-in-depth* for `tenant_id` isolation, under — never replacing
  — the app-layer `authorize()` checks. All entity mutations still flow through Fastify so
  compile-before-execute, RBAC, and audit are enforced.
- **Supabase Studio** as the thin internal admin UI (this resolves the deferred "admin UI"
  decision — Studio replaces what Directus would have given us, without sitting in the hot path).
- **Supabase Auth (GoTrue)** issues JWTs; **Redis still owns `jti` revocation + rate limiting**
  (GoTrue has no per-token denylist).
- **Self-hostable / open-source** — keeps the decision reversible, same principle as dropping
  Directus. Everything underneath is portable Postgres.

**Spec reference:** §3 (Schema Management), §6 (Entity System), §11.1–11.2 (Auth/RBAC), Phase 1b.

---

## Builds directly on Phase 1a

| Phase 1a asset | How Phase 1b uses it |
|----------------|----------------------|
| `Registry` interface (`@ops/compiler`) | Add a `PostgresRegistry` implementation; keep `MockRegistry` for tests. |
| `LLMClient` interface | Add a `ClaudeLLM` implementation (Claude Sonnet); keep `MockLLM` for tests. |
| `compileSkill()` 9-stage pipeline | Expose it over `POST /admin/skills/compile`; no logic changes. |
| `@ops/shared` schemas | Reuse as request/response contracts and DB row validators. |
| React Flow generator output | Render it in the Skill Editor's visual-validation panel. |

---

## Deliverables

Status legend: ✅ done · 🟡 partial · ⬜ not started. The **backend compile slice**
(deliverables 4–9, backend portions) landed in `apps/api`; see
`docs/PHASE-1B-COMPILE-SLICE-SUMMARY.md`.

1. ✅ **Supabase project** (managed Postgres) provisioned; local dev via the Supabase CLI
   (`supabase start`) replacing a bare `docker-compose` Postgres. *(foundation commit)*
2. ✅ **Supabase-backed platform config** (replaces the mock registry as the canonical source).
   *(`PostgresRegistry` + migrations 001/seed)*
3. 🟡 **Entity storage** (JSONB hybrid) for Employee, Department, LeavePolicy, LeaveRequest, with
   **RLS policies** on `tenant_id` as defense-in-depth. *(`EntityService` + `EntityStore`
   (`PostgresEntityStore`/`InMemoryEntityStore`) now drive `/api/v1/entities/*` off the Postgres
   path, registry-driven typed/extended split, app-layer tenant scoping; RLS from 005 is the net.
   Covers the two registry-backed collections — `employees` (people) + `leave_requests`;
   `departments`/`leave_policies` deferred until they have registry definitions. Legacy
   Directus-backed `EntityModel` removed. See `PHASE-1B-ENTITY-SLICE-SUMMARY.md`.)*
4. ✅ **`PostgresRegistry`** + Redis L2 cache (gzip, single-flight, 5-min TTL) behind the existing
   `Registry` interface, pointed at the Supabase connection string. *(`PostgresRegistry`,
   `SchemaRegistryService`, `RedisCacheStore`)*
5. ✅ **`/describe` endpoint** merging platform (Tier 1) + tenant (Tier 2) fields.
   *(`GET /api/v1/admin/schema/:entity` → `SchemaRegistryService.describe`)*
6. 🟡 **Auth** — JWT verify + RBAC preHandler exist on the legacy `@fastify/jwt` path; the
   GoTrue/Redis-`jti`-denylist migration is **deferred** (chosen out of this slice's scope).
7. 🟡 **Schema Builder API + UI** — API done (`SchemaBuilderService`, 409-conflict + PUT,
   `POST/PUT /api/v1/admin/schema/:entity/fields`); **UI deferred**.
8. ⬜ **Skill Editor UI** (token autocomplete, compile button, visual validation panel).
   *(autocomplete backend done via `/admin/skills/tokens/resolve`)*
9. ✅ **`POST /admin/skills/compile`** wired to `@ops/compiler` with `ClaudeLLM`.
   *(`SkillCompilerService` + `ClaudeLLM` + shared `CompilationCache` → `from_cache`)*
10. ⬜ **Supabase Studio** wired up as the internal admin surface for raw config/data inspection.

---

## Data model (SQL migrations)

Use **Supabase migrations** (`supabase/migrations/`, applied via `supabase db push` / CLI) so
local, CI, and hosted environments stay in lockstep:

- `001_platform_config.sql` — canonical config tables (the no-Directus replacement):
  `entity_definitions`, `platform_fields`, `tool_registry`, `agent_definitions`,
  `default_skills`, `roles`, `tenants`. These mirror the `@ops/shared` registry shapes.
- `002_entities.sql` — `employees`, `departments`, `leave_policies`, `leave_requests`
  (typed core columns + `extended_data JSONB` + GIN index, per spec §3.6).
- `003_tenant_fields.sql` — `tenant_field_definitions` (spec §3.3) with the unique constraint.
- `004_skills.sql` — `skills`, `skill_compilations` (incl. `compilation_hash`), `skill_executions`.
- `005_rls_policies.sql` — enable RLS + per-tenant policies on entity and skill tables; the
  Fastify service role bypasses RLS, while any direct/Studio access is tenant-scoped.

> Seed the Phase 1a fixtures (`ENTITY_FIXTURES`, `TOOL_FIXTURES`, `AGENT_FIXTURES`,
> `ROLE_FIXTURES`) into the config tables as the initial dataset (a Supabase seed script).

---

## Key files to create

| Area | Files |
|------|-------|
| Supabase setup | `supabase/config.toml`, `supabase/migrations/*`, `supabase/seed.sql` |
| DB client | `apps/api/src/db/supabase-client.ts` (service-role pg pool, RLS-bypass) |
| Registry impl | `apps/api/src/services/postgres-registry.ts` (implements `Registry`), `schema-registry.service.ts` (Redis L2 + single-flight + merge) |
| Entities | `apps/api/src/services/entity.service.ts`, `routes/entities/*` |
| Schema Builder | `routes/admin/schema/index.ts` (POST 409-conflict + PUT update, spec §3.3) |
| Skills | `routes/skills/*` (`POST /admin/skills/compile` → `compileSkill`) |
| Auth | `plugins/auth.plugin.ts` (verify Supabase JWT + jti denylist), `plugins/redis.plugin.ts`, `authorize()` decorator |
| LLM | `apps/api/src/services/claude-llm.ts` (implements `LLMClient`) |
| Web | `apps/web/src/components/admin/SchemaBuilder/*`, `SkillEditor/*` (+ `FlowEditor/` per §4.6 downside insurance) |

---

## API surface (subset of spec §10.2)

```
GET  /api/v1/entities/:collection/describe          # Tier1+Tier2 merge
GET/POST/PATCH /api/v1/entities/:collection[/:id]
POST /api/v1/admin/schema/:entity/fields            # 409 on conflict
PUT  /api/v1/admin/schema/:entity/fields/:name      # confirmed update
POST /api/v1/admin/skills/compile                   # returns cached or fresh compilation
POST /api/v1/admin/skills/tokens/resolve            # autocomplete support
```

---

## Tests / acceptance

- `PostgresRegistry` returns the same shapes `MockRegistry` does → run the **existing
  `@ops/compiler` tests against both** (parametrize the registry) to prove parity.
- `/describe` merges platform + tenant fields, sorted, with `is_system` flags (spec §3.5).
- Schema Builder returns 409 on an existing field; PUT updates it (spec §3.3).
- `POST /admin/skills/compile` returns a compilation; second identical call sets `from_cache:true`.
- Auth: a Supabase-issued JWT verifies; a revoked `jti` is rejected on both HTTP and WS connect (spec §11.1).
- RLS: a query under tenant A's role cannot read tenant B's rows; the Fastify service role can.
- Integration tests run against a local Supabase (`supabase start`) in CI.

---

## Risks

- **Registry parity** is the linchpin — lock it with shared tests run against mock + Postgres.
- **Cache invalidation** (tenant field change → Redis publish → clear key) must be exercised.
- **Compilation determinism** — `ClaudeLLM` output varies; rely on the cache + validators, and
  keep the editable FlowEditor as the fallback if the success rate dips below 90% (spec §4.6).
- **Don't let Supabase erode the gateway** — no client-direct PostgREST writes for entities or
  skills; everything goes through Fastify so authz/audit/compile-before-execute hold. RLS is a
  safety net, not the authorization model.
- **Auth split** — JWTs come from GoTrue but revocation lives in Redis; keep the two clearly
  separated so a Supabase outage doesn't silently disable revocation checks.

---

## Exit criteria → Phase 1c

A tenant admin can: extend a schema, author a skill in the editor, compile it (real Claude),
see the visual validation, and persist the compilation — all on Supabase Postgres, with RLS
enforcing tenant isolation and Studio available for internal inspection.

# Phase 1b — Core Platform (Planning)

**Goal:** Turn the Phase 1a in-memory slice into a running, persistent, multi-tenant API: real
Postgres-backed schema registry and entity storage, JWT auth, the Schema Builder + Skill Editor
UI, and an HTTP surface for compilation. **No Directus** — Postgres is the canonical store.

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

1. **Postgres-backed platform config** (replaces the mock registry as the canonical source).
2. **Entity storage** (JSONB hybrid) for Employee, Department, LeavePolicy, LeaveRequest.
3. **`PostgresRegistry`** + Redis L2 cache (gzip, single-flight, 5-min TTL) behind the existing `Registry` interface.
4. **`/describe` endpoint** merging platform (Tier 1) + tenant (Tier 2) fields.
5. **JWT auth** with `jti` revocation (Redis denylist) + RBAC `authorize()` preHandler.
6. **Schema Builder API + UI** (tenant field extensions, 409-conflict resolution).
7. **Skill Editor UI** (token autocomplete, compile button, visual validation panel).
8. **`POST /admin/skills/compile`** wired to `@ops/compiler` with `ClaudeLLM`.

---

## Data model (SQL migrations)

Create `apps/api/src/db/migrations/`:

- `001_platform_config.sql` — canonical config tables (the no-Directus replacement):
  `entity_definitions`, `platform_fields`, `tool_registry`, `agent_definitions`,
  `default_skills`, `roles`, `tenants`. These mirror the `@ops/shared` registry shapes.
- `002_entities.sql` — `employees`, `departments`, `leave_policies`, `leave_requests`
  (typed core columns + `extended_data JSONB` + GIN index, per spec §3.6).
- `003_tenant_fields.sql` — `tenant_field_definitions` (spec §3.3) with the unique constraint.
- `004_skills.sql` — `skills`, `skill_compilations` (incl. `compilation_hash`), `skill_executions`.

> Seed the Phase 1a fixtures (`ENTITY_FIXTURES`, `TOOL_FIXTURES`, `AGENT_FIXTURES`,
> `ROLE_FIXTURES`) into the config tables as the initial dataset — they become the seed script.

---

## Key files to create

| Area | Files |
|------|-------|
| Registry impl | `apps/api/src/services/postgres-registry.ts` (implements `Registry`), `schema-registry.service.ts` (Redis L2 + single-flight + merge) |
| Entities | `apps/api/src/services/entity.service.ts`, `routes/entities/*` |
| Schema Builder | `routes/admin/schema/index.ts` (POST 409-conflict + PUT update, spec §3.3) |
| Skills | `routes/skills/*` (`POST /admin/skills/compile` → `compileSkill`) |
| Auth | `plugins/auth.plugin.ts` (JWT + jti), `plugins/redis.plugin.ts`, `authorize()` decorator |
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
- JWT: a revoked `jti` is rejected on both HTTP and WS connect (spec §11.1).
- Integration tests use a disposable Postgres (testcontainers or `docker-compose.dev.yml`).

---

## Risks

- **Registry parity** is the linchpin — lock it with shared tests run against mock + Postgres.
- **Cache invalidation** (tenant field change → Redis publish → clear key) must be exercised.
- **Compilation determinism** — `ClaudeLLM` output varies; rely on the cache + validators, and
  keep the editable FlowEditor as the fallback if the success rate dips below 90% (spec §4.6).

---

## Exit criteria → Phase 1c

A tenant admin can: extend a schema, author a skill in the editor, compile it (real Claude),
see the visual validation, and persist the compilation — all on Postgres, no Directus.

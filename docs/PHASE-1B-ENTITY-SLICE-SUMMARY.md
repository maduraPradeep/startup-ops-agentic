# Phase 1b — Entity Storage Slice — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** Deliverable #3 of `PHASE-1B-CORE-PLATFORM.md` — move the Entity System off the
legacy Directus-backed `EntityModel` onto the Postgres tables from `002_entities.sql`, using
the JSONB hybrid (typed core columns + `extended_data`). Registry-driven, CI-testable with
in-memory impls — no Docker, no DB. **No UI** (Schema Builder / Skill Editor UI still deferred).

---

## 1. What was delivered

```
GET   /api/v1/entities/:collection/describe   # Tier1+Tier2 merge (reuses SchemaRegistryService)
GET   /api/v1/entities/:collection            # tenant-scoped list + pagination meta + equality filter
GET   /api/v1/entities/:collection/:id        # tenant-scoped fetch (404 if absent)
POST  /api/v1/entities/:collection            # validate against merged fields, split typed/extended
PATCH /api/v1/entities/:collection/:id        # partial update; shallow-merge extended_data JSONB
```

All routes run through the existing `authenticate` preHandler and `tenantPlugin`
(`request.tenantId`). Storable, registry-backed collections: **`employees`** (entity `people`)
and **`leave_requests`**. Non-storable collections (`departments`, `leave_policies`, anything
else) return 404 until they have registry definitions. The `:id/:action` route still delegates
to the legacy `WorkflowModel` — real execution lands in Phase 1c.

---

## 2. Files added / changed (`apps/api/src`)

| Area | File | Responsibility |
|------|------|----------------|
| Store | `services/entity-store.ts` *(new)* | `EntityStore` interface + `PostgresEntityStore` (JSONB hybrid, parameterized SQL, fixed table/column allowlist) + `InMemoryEntityStore` |
| Service | `services/entity.service.ts` *(new)* | `EntityService` — describe/list/get/create/update; merged-`describe`-driven validation + typed/extended split; `EntityValidationError`, `RecordNotFoundError` |
| Wiring | `plugins/platform.plugin.ts` | constructs the store (Postgres vs in-memory fallback) + `EntityService`; decorates `fastify.entities` |
| Transport | `controllers/entity.controller.ts` | rewritten onto `fastify.entities`; error→status mapping; keeps Redis `entity:*` publish on write |
| Removed | `models/entity.model.ts` *(deleted)* | dead legacy Directus path |
| Tests | `__tests__/entity-service.test.ts` *(new, 13 tests)* | create/list/get/update, typed vs extended split, required + unknown + uuid validation, tenant isolation |

---

## 3. Design notes

- **Single source of truth.** The merged `/describe` field set (Tier 1 platform + Tier 2 tenant)
  decides what may be written: Tier 1 system fields → typed columns, Tier 2 → `extended_data`,
  everything else rejected (400). No second schema definition; the Schema Builder and the Entity
  System stay in lockstep.
- **Injection safety.** Table and column identifiers come only from a fixed
  `STORABLE`/`CollectionDescriptor` map (collection→table) and the registry's field names — never
  from request input. Values are always parameterized.
- **Tenancy.** App-layer `WHERE tenant_id = $1` on every read/write is primary; RLS from
  `005_rls_policies.sql` is the defense-in-depth net for any direct/Studio access.
- **Graceful degrade.** Mirrors the rest of the platform plugin: Postgres store when a DB URL is
  set, in-memory store otherwise (the path the unit tests exercise).

---

## 4. Verify

```
pnpm --filter @ops/api typecheck && pnpm --filter @ops/api test   # 47 passed | 6 skipped
pnpm -r typecheck
```

## 5. Deferred / next

- `departments` + `leave_policies` storage (need registry entity definitions first).
- Per-request `app.tenant_id` GUC + integration tests against a live `supabase start` (proves RLS).
- Richer query surface (operators beyond equality, sorting) when a real consumer needs it.

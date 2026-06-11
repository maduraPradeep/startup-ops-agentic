# Phase 1b — Backend Compile Slice — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** The backend HTTP surface of Phase 1b — turn the Phase 1a in-memory compiler
slice and the Phase 1b persistence *foundation* into a working API for schema describe,
schema extension, and skill compilation. **No UI; no GoTrue auth migration** (deferred by
scoping decision). Everything is CI-testable with mocks — no Docker, no DB, no API key.

---

## 1. What was delivered

```
GET  /api/v1/admin/schema/:entity              # Tier1 (platform) + Tier2 (tenant) merge, L2-cached
POST /api/v1/admin/schema/:entity/fields       # add a Tier2 field — 409 on conflict
PUT  /api/v1/admin/schema/:entity/fields/:name # update a Tier2 field — 404 / 409
POST /api/v1/admin/skills/compile              # @ops/compiler pipeline; from_cache on re-compile
POST /api/v1/admin/skills/tokens/resolve       # editor autocomplete (parse + resolve)
```

All five wire through the existing `authenticate` preHandler and run on the
`PostgresRegistry` (or `MockRegistry` when no DB is configured).

---

## 2. Files added (`apps/api/src`)

| Area | File | Responsibility |
|------|------|----------------|
| LLM | `services/claude-llm.ts` | `ClaudeLLM implements LLMClient` — fetch-based Anthropic Messages call (no SDK dep), injectable transport, prompt-cached system block, robust JSON extraction |
| Cache | `services/cache-store.ts` | `CacheStore` interface + `InMemoryCacheStore` + `RedisCacheStore` (gzip) |
| Tenant fields | `services/tenant-field-store.ts` | `TenantFieldStore` interface + Postgres + in-memory impls (Tier 2 / spec §3.3) |
| Describe | `services/schema-registry.service.ts` | Tier1+Tier2 `describe()` merge, single-flight, L2 cache + `invalidate()` (spec §3.5) |
| Schema Builder | `services/schema-builder.service.ts` | `addField` (409 on platform/tenant collision) + `updateField` (404/409) (spec §3.3) |
| Compile | `services/skill-compiler.service.ts` | wraps `compileSkill` with a shared `CompilationCache` (→ `from_cache`), optional persistence, token resolve |
| Persistence | `services/compilation-store.ts` | `PostgresCompilationStore` → `skill_compilations` (migration 004) |
| Wiring | `plugins/platform.plugin.ts` | constructs services with graceful DB/Redis/LLM fallbacks; decorates Fastify |
| Transport | `controllers/{schema,skill}.controller.ts`, `routes/{schema,skills}/index.ts` | thin HTTP layer |

---

## 3. Key decisions

| Decision | Rationale |
|----------|-----------|
| **ClaudeLLM over `fetch`, not the SDK**, with an injectable `transport`. | Same precedent as the fetch-based Directus wrapper; lets the network be mocked so the LLM is unit-tested with no key/HTTP. Prompt caching on the (identical) system block keeps repeat compiles cheap. |
| **Everything behind an interface** (`CacheStore`, `TenantFieldStore`, `CompilationStore`). | Services are unit-tested with in-memory impls and swapped for Redis/Postgres in `platform.plugin.ts` — same pattern as the Phase 1a `Registry`/`LLMClient` abstractions. |
| **`platform.plugin.ts` degrades gracefully** (DB→Mock, Redis→in-memory, no key→503). | The app boots in dev/CI without full infra, mirroring how the registry-parity suite skips the Postgres leg. |
| **Single shared `CompilationCache`** in `SkillCompilerService`. | Makes the `from_cache:true` acceptance criterion hold across requests without re-calling the LLM. |
| **Describe mounted under `/admin/schema/:entity`**, not replacing the legacy entity `/describe`. | Avoids destabilizing the legacy (Directus-era) entity path while delivering the tenant-aware merge. |

---

## 4. Test results (`apps/api`, Vitest)

| Suite | Result |
|-------|--------|
| `claude-llm.test.ts` | 8 passed (JSON extraction variants, request shape, multi-block, errors) |
| `schema-registry.test.ts` | 6 passed (merge/sort/is_system, cache hit, single-flight, invalidate, 404) |
| `schema-builder.test.ts` | 8 passed (create, 409 platform/tenant, PUT update/404/409, tenant isolation) |
| `skill-compiler.test.ts` | 6 passed (compile, `from_cache` w/o LLM re-call, persist-once, parse failure, token resolve) |
| `registry-parity.test.ts` | 12 (6 skipped — Postgres leg gated on a reachable DB) |

**Acceptance covered (spec §3/§4):** `/describe` merges Tier1+Tier2 sorted with `is_system`
flags; Schema Builder 409s on conflict and PUT updates; `compile` returns a compilation and a
second identical call sets `from_cache:true` without re-calling the LLM; `ClaudeLLM` extracts the
IR from a Claude response and sends a cached system block.

---

## 5. Deferred (still open in Phase 1b)

- **Supabase Auth (GoTrue) migration** + Redis `jti` denylist (currently legacy `@fastify/jwt`).
- **Schema Builder UI** and **Skill Editor UI** (+ FlowEditor) — the React surfaces.
- **Entity storage service/routes** on the new Postgres path (migrations exist; still legacy path).
- **Supabase Studio** as the internal admin surface.
- Integration tests against a live `supabase start` (the parity suite already supports it when a DB URL is set).

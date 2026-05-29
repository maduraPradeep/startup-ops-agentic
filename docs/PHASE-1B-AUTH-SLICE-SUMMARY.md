# Phase 1b — Auth Slice (GoTrue + Redis jti denylist) — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** Deliverable #6 of `PHASE-1B-CORE-PLATFORM.md` (+ the "Auth split" risk) — migrate JWT
verification to **Supabase GoTrue**-issued tokens and add **Redis-owned `jti` revocation**, with
the revoked token rejected on **both HTTP and WS connect** (spec §11.1). Keep the existing
`authorize()` RBAC as the primary authorization model. Registry-style in-memory/real split,
CI-testable with no live GoTrue/Redis. **No UI.**

---

## 1. What was delivered

```
POST /api/v1/auth/logout            # authenticated; denylists the current token's revocation key
```

- **GoTrue JWT verification.** When `SUPABASE_JWT_SECRET` is set, the gateway verifies GoTrue
  HS256 access tokens locally (signature + `exp` + `aud`), mapping claims onto our existing
  `TokenPayload`: `sub`→`userId`, `email`→`email`; `role`/`tenant_id`/`tenant_name`/`name` pulled
  from `app_metadata` with sensible fallbacks.
- **Legacy fallback.** When `SUPABASE_JWT_SECRET` is unset, the gateway keeps verifying the tokens
  our own `auth.controller` signs with `JWT_SECRET` (`@fastify/jwt`) — so dev/CI and the legacy
  Directus login path keep working unchanged.
- **Redis `jti` denylist.** `POST /auth/logout` adds the token's revocation key to the denylist
  with TTL = remaining token lifetime (self-cleans at expiry). BOTH the HTTP `authenticate` hook
  and the WS connect guard consult the denylist and 401/disconnect a revoked token.
- **Shared verify path.** A single `fastify.verifyBearer(token)` does GoTrue-or-legacy verify +
  denylist check, reused by HTTP and WS so the two can't drift.

---

## 2. Files added / changed (`apps/api/src`)

| Area | File | Responsibility |
|------|------|----------------|
| Denylist | `services/token-denylist.ts` *(new)* | `TokenDenylist` interface + `RedisTokenDenylist` (`auth:jti:denylist:{key}`, EXPIRE = remaining lifetime) + `InMemoryTokenDenylist` (test/dev fallback) |
| GoTrue verify | `services/supabase-jwt.ts` *(new)* | `createSupabaseVerifier` (local HS256 verify via `fast-jwt`), `mapGoTrueClaims`, `extractBearer`, `assertNotRevoked` / `TokenRevokedError`, `VerifiedIdentity` |
| Legacy verify | `services/legacy-jwt.ts` *(new)* | `mapLegacyPayload` + `resolveLegacyRevocationKey` + `legacyRemainingTtl` — maps our own `TokenPayload` onto the canonical identity |
| Plugin | `plugins/auth.plugin.ts` | wires denylist (Redis vs in-memory), optional Supabase verifier, `verifyBearer`; `authenticate` now sets `request.user`/`tenantId`/`revocationKey`; `authorize` guards `reply.sent` |
| WS | `plugins/websocket.plugin.ts` | connect guard verifies the token + rejects a revoked/invalid one; trusts the verified `tenant_id` for room join |
| Logout | `controllers/auth.controller.ts`, `routes/auth/index.ts` | `logout` handler + `POST /auth/logout` (authenticated) |
| Dep | `apps/api/package.json` | `fast-jwt@6.2.4` promoted to a direct dependency (already in the tree via `@fastify/jwt`; same signer/verifier the plugin uses) |
| Tests | `__tests__/token-denylist.test.ts` *(4)*, `__tests__/supabase-jwt.test.ts` *(15)*, `__tests__/legacy-jwt.test.ts` *(4)* | denylist deny/isDenied/TTL self-clean; GoTrue verify accept/expired/bad-sig/bad-aud + claim mapping + revocation-key selection; legacy mapping + revocation rejection |

---

## 3. Design notes

- **jti vs session_id (the key choice).** GoTrue access tokens carry `session_id` and typically do
  **not** carry `jti`. The revocation key is `jti` when present (forward-compatible), otherwise the
  GoTrue `session_id`, otherwise `sub`. Revoking a `session_id` denies every access token minted for
  that session until it expires — exactly the logout semantics we want. Legacy tokens have neither,
  so they use an explicit `jti` if ever added, else a stable `legacy:{userId}` key.
- **GoTrue vs legacy fallback (graceful degradation).** `SUPABASE_JWT_SECRET` set → verify GoTrue
  tokens; unset → fall back to `@fastify/jwt`/`JWT_SECRET`. In **both** paths, after a successful
  verify, the denylist is checked and a denied key is rejected. The denylist itself degrades:
  `RedisTokenDenylist` when `fastify.redis` exists, `InMemoryTokenDenylist` otherwise — so the app
  boots in CI without live infra (mirrors `cache-store.ts` / `tenant-field-store.ts`).
- **Auth split kept clean (per the risk).** JWT issuance (GoTrue) and revocation (Redis) are
  separate concerns in separate modules; a Supabase outage doesn't silently disable revocation
  checks because revocation lives entirely in Redis.
- **Local-only verification.** GoTrue tokens are verified against the shared project secret with
  `fast-jwt` — no network call to GoTrue, so verification is a pure, fully unit-testable function.
- **One code path for HTTP + WS.** `verifyBearer` is the single verify+denylist entry point; the WS
  connect guard reuses it and now also trusts the verified `tenant_id` over client-supplied values.

---

## 4. Verify

```
pnpm --filter @ops/api typecheck      # clean
pnpm --filter @ops/api test           # 70 passed | 6 skipped (was 47 passed; +23 auth tests)
pnpm -r typecheck                     # all 4 workspace projects clean
```

## 5. Deferred / next

- **GoTrue provisioning + custom-claims hook.** Minting `role`/`tenant_id`/`tenant_name`/`name` into
  `app_metadata` (GoTrue auth hook / admin update) and replacing the legacy `/auth/login` with a
  GoTrue sign-in flow is config/ops work, not in this backend slice.
- **WS live revocation mid-session.** Revocation is enforced at connect; forcibly dropping an
  already-open socket when its key is later denied (Redis pub/sub fan-out) is a follow-up.
- **Refresh-token rotation / `/auth/refresh` against GoTrue.** Still proxies Directus on the legacy
  path; GoTrue refresh wiring lands with the GoTrue sign-in flow above.
- **Integration test against a live `supabase start`** (real GoTrue-signed token end-to-end), to sit
  alongside the registry-parity DB leg.

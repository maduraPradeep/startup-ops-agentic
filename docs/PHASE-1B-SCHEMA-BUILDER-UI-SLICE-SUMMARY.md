# Phase 1b — Schema Builder UI Slice — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** Deliverable #7 (UI portion) of `PHASE-1B-CORE-PLATFORM.md` — the operator-facing
Schema Builder on top of the already-shipped Schema Builder API. A tenant admin can view an
entity's merged Tier 1 + Tier 2 fields and add/edit tenant (Tier 2) extensions, with API
conflicts surfaced inline. No backend changes. **Skill Editor UI (#8) remains deferred.**

---

## 1. What was delivered

A full-page **admin overlay** (per `UI-DESIGN.md` principle 4 — admin surfaces are overlays that
don't disrupt the chat shell), reachable from a new sidebar **Admin → Schema Builder** entry:

- Entity picker for the two registry-backed entities (`people` → "Employees", `leave_requests` →
  "Leave Requests"). There is no entities-list endpoint yet, so the set is a documented constant.
- Merged field table (`GET /admin/schema/:entity`): every field with type, required, PII, and a
  clear **Tier 1 (system, read-only)** vs **Tier 2 (tenant, editable)** badge. System rows can't
  be edited.
- Add-field drawer (`POST …/fields`) and edit-field drawer (`PUT …/fields/:name`) with
  react-hook-form + zod client validation, and **inline server-error surfacing**: 409 collisions
  target the name input with operator-friendly copy + the conflicting field; 404/400 render at the
  form footer. No raw JSON, no `alert()`.
- Loading (skeleton), empty ("explain what to do next"), and error/retry states.

---

## 2. Files added / changed (`apps/web/src`)

| Area | File | Responsibility |
|------|------|----------------|
| Data layer | `queries/useSchema.ts` *(new)* | `useSchema` / `useAddField` / `useUpdateField` over `apiClient`; mutations propagate `.status`/`.data` (no swallow) |
| Helpers | `lib/schema-builder.ts` *(new)* | `SCHEMA_ENTITIES`, `FIELD_TYPES`/labels, `sortFields`, `conflictMessage` (pure) |
| Tests | `lib/schema-builder.test.ts` *(new, 4 tests)* | `sortFields` + `conflictMessage` (pure-logic vitest) |
| Nav state | `stores/admin-surface.store.ts` *(new)* | tiny Zustand store tracking the open overlay (`'schema-builder' \| null`), not persisted |
| Controller | `controllers/SchemaBuilderController.tsx` *(new)* | overlay shell + entity picker + drawer state + maps 409/404/400 → inline `DrawerServerError` |
| Views | `views/admin/schema/{FieldList,FieldRow,AddFieldDrawer}.tsx` *(new)* | presentational table, row (Tier badges), and add/edit drawer |
| HTTP | `lib/api-client.ts` | added `put` verb |
| Wiring | `views/layout/AppLayout.tsx`, `controllers/AppController.tsx` | sidebar "Schema Builder" entry + render the overlay above the chat layout |

---

## 3. Design notes

- **No router.** The app switches Login/Chat on auth state; there is no react-router. The overlay
  is driven by `admin-surface.store` and rendered as a sibling of `AppLayout` (`fixed inset-0
  z-20`), so it covers the shell without unmounting chat. Closing returns the operator to chat.
- **Errors translate at the controller.** `useSchema` mutations don't swallow; `toServerError`
  maps `{status,data}` → a `DrawerServerError` that the drawer pins to the right input (409 → name
  with `conflictMessage(reason)` + `existing`; 404/400 → form footer).
- **Entity name vs resource.** `/admin/schema/:entity` keys on the registry **entity name**
  (`people`), not the resource (`employees`); the picker uses entity names.
- **`is_system` is the authority for editability** — Tier 1 rows are read-only in the table; only
  Tier 2 fields expose Edit and can be PUT.

---

## 4. Verify

```
pnpm --filter @ops/web typecheck     # clean
pnpm --filter @ops/web test          # 4 passed
pnpm --filter @ops/web build         # production build OK
pnpm -r typecheck                    # all 4 projects clean
```

No component-test infrastructure exists in `apps/web` (no @testing-library, no prior `*.test.*`);
none was added. Coverage here is the pure-logic vitest test plus typecheck + production build.

## 5. Deferred / next

- **Skill Editor UI (#8)** — token autocomplete, compile button, visual validation panel.
- An entities-list endpoint to replace the hardcoded `SCHEMA_ENTITIES` constant.
- `sort_order` editing (the API accepts it; the form omits it and lets the server default).
- Component/interaction tests once a testing-library setup is introduced.

# Phase 1b — Skill Editor UI Slice — Implementation Summary

**Status:** ✅ Complete · **Branch:** `claude/new-implementation-scratch-5HBLR`
**Scope:** Deliverable #8 of `PHASE-1B-CORE-PLATFORM.md` — the operator-facing Skill Editor on top
of the already-shipped compile/resolve API. A tenant admin can author a skill in plain language
with live token resolution, compile it, and validate the generated workflow as a read-only
diagram. No backend changes. With this, deliverables #7 + #8 cover the core operator loop of the
Phase 1b exit criteria (extend a schema → author/compile a skill → see visual validation).

---

## 1. What was delivered

A full-page **admin overlay** (per `UI-DESIGN.md` principle 4 — admin surfaces are overlays that
don't disrupt the chat shell), reachable from the sidebar **Admin → Skill Editor** entry, with the
three-panel layout from `UI-DESIGN.md` §4.6 (authoring · compilation · flow graph):

- **Authoring panel** — a monospace `<textarea>` for the skill source plus a live **Tokens**
  status panel driven by debounced (300 ms) `POST /admin/skills/tokens/resolve` calls as the
  operator types. Resolved tokens render as kind-coloured chips; an unresolved token surfaces the
  API's `errorType`/`message`/`token` inline (amber, operator-friendly). This is the pragmatic
  "token autocomplete / status" the brief asks for — no full code editor, no new editor dep.
- **Compilation panel** — a **Compile** button (`POST /admin/skills/compile`) with an in-progress
  state, then:
  - success → a green summary with the `from_cache` badge + `compilation_hash`, a warnings list
    (operator-friendly copy, no raw JSON), and the stage checklist all ✓;
  - failure (HTTP 200 `CompilationError`) → a red summary rendering `stage`, `error_type`,
    `message`, `token_at_fault`, and `suggestion`, with the stage checklist marking everything
    before the failing stage done, the failing stage ✕, and the rest pending.
- **Flow graph panel** — a **hand-rolled, read-only** render of `react_flow_graph`: nodes laid out
  top-to-bottom as cards colour-coded by `step_type` (§4.6 palette), with vertical connectors and,
  under each card, its outgoing edges (target labels + branch labels for `condition` nodes). **No
  `reactflow` / heavy graph dependency.** The editable `FlowEditor` (§4.6 downside insurance) is
  out of scope.
- **Compiler-unavailable (503) state** — if either endpoint 503s (ANTHROPIC_API_KEY unset, common
  in dev) the overlay shows a clear, non-crashing "Skill compiler is unavailable" panel instead of
  a generic error, and stops firing requests.
- Sensible empty/loading states throughout (idle compile banner, "type to see tokens", "compile to
  see the graph").

---

## 2. Files added / changed (`apps/web/src`)

| Area | File | Responsibility |
|------|------|----------------|
| Data layer | `queries/useSkills.ts` *(new)* | `useCompileSkill` / `useResolveTokens` over `apiClient` (POST mutations); errors propagate `.status`/`.data` (no swallow). Re-exports the `TokenResolveResult` shape (mirrors the API service) |
| Helpers | `lib/skill-editor.ts` *(new)* | `COMPILATION_STAGES`, `deriveStageStatuses`, `STEP_TYPE_STYLES`/`stepTypeStyle`, `TOKEN_KIND_STYLES`/`tokenKindStyle`, `orderNodesForRender`, `outgoingEdgesByNode` (pure) |
| Tests | `lib/skill-editor.test.ts` *(new, 8 tests)* | `deriveStageStatuses`, `stepTypeStyle`, `orderNodesForRender`, `outgoingEdgesByNode` (pure-logic vitest) |
| Nav state | `stores/admin-surface.store.ts` | extended `AdminSurface` to `'schema-builder' \| 'skill-editor' \| null` |
| Controller | `controllers/SkillEditorController.tsx` *(new)* | overlay shell + skill-text state + debounced resolve + compile + 503 detection + inline compile error |
| Views | `views/admin/skill/{SkillTextEditor,CompilationPanel,FlowGraph}.tsx` *(new)* | authoring + token-status panel, stage checklist + result/warnings, read-only graph render |
| Wiring | `views/layout/AppLayout.tsx`, `controllers/AppController.tsx` | sidebar "Skill Editor" entry (`onOpenSkillEditor`) + render the overlay above the chat layout |

---

## 3. Design notes

- **No router.** Same pattern as the Schema Builder slice: the overlay is driven by
  `admin-surface.store` and rendered as a sibling of `AppLayout` (`fixed inset-0 z-20`), so it
  covers the shell without unmounting chat. Closing returns the operator to chat.
- **Failed compile ≠ thrown error.** A failed compilation is HTTP **200** (a `CompilationError`
  union member), so it arrives as a successful mutation result — the controller branches on
  `result.success`, not on a throw. Only transport failures (400 empty body, 503, network) throw;
  503 flips the unavailable state, others render inline.
- **Synchronous, not SSE.** `UI-DESIGN.md` sketches an SSE stage stream, but the shipped
  `skill.controller.ts` returns the full `CompilationResult` in one response. Rather than fake a
  stream, the stage checklist is **derived** from the final result (`deriveStageStatuses`,
  unit-tested): success → all done; a `CompilationError` names the failing `stage`, so prior stages
  are done, that stage is error, the rest pending. Honest about how far a failed compile got.
- **Graph without `reactflow`.** The brief forbids the heavy graph dep. Nodes are sorted into a
  single top-to-bottom reading order by their emitted `position.y` (the compiler already lays the
  graph out downward), then `x`, then `id` (`orderNodesForRender`, pure + tested); edges are shown
  as connectors plus a per-node outgoing list with branch labels (`outgoingEdgesByNode`). Enough to
  eyeball control flow; unknown `step_type`s fall back to a neutral palette rather than crashing.
- **Token panel, not a dropdown overlay.** Inline `@`-cursor dropdown positioning was deliberately
  skipped (out of scope per the brief). Instead the debounced resolve result populates a persistent
  status panel listing every parsed token kind-coloured, with unresolved tokens flagged — the same
  signal, less surface area, no editor dependency.
- **503 stops the loop.** Once either endpoint 503s, `unavailable` is set and both the resolve
  effect and Compile are gated off, so a misconfigured dev env doesn't spam failing requests.

---

## 4. Verify

```
pnpm --filter @ops/web typecheck     # clean
pnpm --filter @ops/web test          # 12 passed (8 new skill-editor + 4 schema-builder)
pnpm --filter @ops/web build         # production build OK
pnpm -r typecheck                    # all 4 projects clean
```

No component-test infrastructure exists in `apps/web` (no @testing-library); none was added.
Coverage here is the pure-logic vitest tests (stage derivation, node ordering, edge grouping,
step-type palette) plus typecheck + production build.

## 5. Deferred / next

- **Inline `@`-cursor autocomplete dropdown** (keyboard-navigable, insert-on-Enter) and textarea
  token syntax-highlighting (§4.6) — the status panel covers resolution today.
- **Editable `FlowEditor`** (§4.6 "downside insurance") — drag-to-reorder + node config panels,
  gated on compilation success rate < 90%.
- **Skill lifecycle** — Save Draft / Validate / Publish / Rollback action bar and the
  `/admin/skills/:id` persistence surface (the compile endpoint is stateless here).
- **SSE stage streaming** if/when the compile endpoint streams (currently one synchronous response).
- Component/interaction tests once a testing-library setup is introduced.

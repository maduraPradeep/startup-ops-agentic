# Roadmap

AI-Native Operations Platform — phase-by-phase delivery plan. Phase 1a is **done**; everything
else is planned. This roadmap reflects the **Supabase** persistence decision (see below):
Postgres is the canonical platform-config store, hosted on Supabase, with Supabase Studio as the
internal admin UI in place of a Directus back-office.

---

## Persistence decision

**Chosen: Supabase** (managed Postgres). Rejected: Directus, Firebase.

| Option | Verdict | Why |
|--------|---------|-----|
| **Supabase** | ✅ Chosen | *Is* Postgres — JSONB hybrid, pgvector, partitioning, SQL migrations, and LangGraph's `PostgresSaver` all work unchanged. Adds RLS (tenant defense-in-depth), Studio (the admin UI we'd deferred), and GoTrue auth. Open-source / self-hostable, so reversible. |
| Firebase | ❌ Rejected | Firestore is document/NoSQL — conflicts with the relational + JSONB + pgvector + `PostgresSaver` design. "Firebase + Postgres" = two databases and an impedance mismatch. Not self-hostable (lock-in). |
| Directus | ❌ Rejected (earlier) | Put a CMS in the hot path of `/describe`, forcing circuit-breaker / stale-cache / degraded-mode complexity. |

**How we use Supabase:** as **managed Postgres + auth + Studio**, *not* as the app framework.
The Fastify API gateway and Python LangGraph runtime stay the architecture. Guardrails:
- All entity/skill mutations flow through Fastify (compile-before-execute, RBAC, audit). **No
  client-direct PostgREST writes.** RLS is defense-in-depth under app-layer authz, not a
  replacement for it.
- GoTrue issues JWTs; **Redis still owns `jti` revocation + rate limiting + streams.**
- Because Phase 1a hides persistence behind the `Registry` interface, this is purely a Phase 1b
  implementation detail — `PostgresRegistry` points at a Supabase connection string.

| Phase | Theme | Status | Doc |
|-------|-------|--------|-----|
| 1a | Compilation spike (compile → execute loop, mocked) | ✅ Complete | `PHASE-1A-IMPLEMENTATION-SUMMARY.md` |
| 1b | Core platform (Postgres registry, entities, auth, UI, `/compile`) | 📋 Planned | `PHASE-1B-CORE-PLATFORM.md` |
| 1c | Skill execution (real LangGraph, lifecycle, real-time, approvals) | 📋 Planned | `PHASE-1C-SKILL-EXECUTION.md` |
| 1d | Channels + operations (Slack, notifications, GDPR, audit) | 📋 Planned | `PHASE-1D-CHANNELS-OPERATIONS.md` |
| 2 | Expansion | Future | below |
| 3 | Scale | Future | below |
| 4 | Enterprise | Future | below |

---

## The spine that carries through every phase

Phase 1a deliberately built **interfaces, not just implementations**, so later phases swap
mocks for real services without touching the pipeline:

| Interface (Phase 1a) | Mock now | Real later |
|----------------------|----------|------------|
| `Registry` | `MockRegistry` (fixtures) | `PostgresRegistry` (1b) |
| `LLMClient` | `MockLLM` | `ClaudeLLM` (1b) |
| `GraphBackend` | `InMemoryBackend` | `LangGraphBackend` (1c) |
| Checkpointer | `InMemoryCheckpointer` | `PostgresSaver` on Supabase (1c) |
| Notification sink | (none — `notify` no-op) | Redis Streams pipeline (1d) |

The `@ops/shared` schemas are the contract across TS, the API, and the Python runtime; the
canonical IR fixture keeps the two languages from drifting.

---

## Phase 1 sequencing & dependencies

```
1a  ──>  1b  ──>  1c  ──>  1d
(done)  Supabase  real     Slack +
        + auth    runtime  ops

1b unblocks everything: persistence, auth, and the HTTP surface.
1c needs 1b's skill_compilations / skill_executions tables.
1d needs 1c's execution states and notify handler.
```

Critical path runs straight through; within each phase, UI work parallelizes with API work.

---

## Phase 2 — Expansion (future)

New entities (Project, ProjectTask, Document, multi-stage ApprovalChain); new default skills
(Expense, Project Kickoff, Document Approval, Broadcast); Teams + Email + Mobile PWA channels;
skill library + fork version notifications (semver, security patches); execution history +
replay; analytics dashboard (approval SLAs, time-to-resolution); specialist agents; vector
search for policy docs. SOC 2 Type II target.

## Phase 3 — Scale (future)

Vendor/Contract, Compensation, PerformanceReview entities; Offboarding + Performance Review
default skills; skill marketplace (tenant-to-tenant); skill versioning UI; **row-level
multi-region data residency**; advanced `IndexAdvisorService` recommendations in Schema Builder;
ISO 27001 + ISO 42001.

## Phase 4 — Enterprise (future)

AI Co-Pilot (proactive suggestions); voice interface; on-prem deployment; custom agent builder;
industry skill packs; global payroll + regional compliance.

---

## Open decisions to revisit

- ~~**Admin UI for platform config**~~ — **Resolved:** Supabase Studio serves as the internal
  admin surface; a purpose-built React admin is deferred to Phase 2 only if Studio proves
  insufficient.
- **Compilation success rate gate** (spec §4.6): if real Claude compilation < 90% in 1b, promote
  the editable React Flow `FlowEditor` from "advanced edit" to the primary authoring path.
- **Multi-region**: deployment-level isolation is sufficient through Phase 2; row-level lands in
  Phase 3.

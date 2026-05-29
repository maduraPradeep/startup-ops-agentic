# Phase 1d — Channels + Operations (Planning)

**Goal:** Make the platform operable and reachable beyond WebChat: Slack integration, durable
notification delivery, rate limiting, JSONB auto-indexing, GDPR endpoints, and the audit log
viewer. Close out Phase 1 with a retrospective and a Phase 2 go/no-go.

**Spec reference:** §8 (Channels), §11.7–11.9 (rate limiting, notifications, GDPR), §3.6–3.7
(auto-index, audit partitioning), Phase 1d.

---

## Builds directly on Phases 1a–1c

| Asset | How Phase 1d uses it |
|-------|----------------------|
| `ExecutionRunner` + WebSocket state stream (1c) | Slack renders the same execution states (80% parity). |
| `notify` step handler (1c) | Emits into the durable notification pipeline. |
| `audit` events (1b/1c) | Surfaced in the WebChat audit-log viewer; partitioned storage. |
| Entity storage + `extended_data` GIN (1b) | `IndexAdvisorService` adds functional indexes on hot fields. |

---

## Deliverables

1. **Slack integration** — 80% feature parity; complex forms degrade to step-by-step DMs;
   Skill Editor / Schema Builder / Audit link out to WebChat (spec §8.1 gap matrix).
2. **Notification delivery** — at-least-once via Redis Streams, consumer group, retry
   (1s/5s/30s) → dead-letter; `notification_deliveries` table; adaptive throttle (halve rate
   when backlog > 1000) (spec §11.7–11.8).
3. **Rate limiting** — per-user compilation burst (3/min), tenant quota (10/hr), WS user-msg vs
   ping distinction, tiered entity bulk writes, notification sends (spec §11.7).
4. **`IndexAdvisorService`** — nightly `pg_stat_statements` scan, functional index creation,
   10-index budget per entity per tenant (spec §3.6).
5. **GDPR endpoints** — `POST /admin/gdpr/erase/:id` (super_admin, audit-first, cascade +
   anonymize + audit redaction) and `GET /admin/gdpr/export/:id` (spec §11.9).
6. **Audit log viewer** — WebChat surface over the monthly-partitioned `audit_logs` (spec §3.7).
7. **Retrospective** — Phase 1a–1d review; Phase 2 go/no-go.

---

## Key files to create

| Area | Files |
|------|-------|
| Slack | `apps/api/src/channels/slack/*` (events, blocks, DM flow), channel-normalizer |
| Notifications | `services/notification-worker/*` or `apps/api/src/services/notification.service.ts`, `db/migrations/005_notification_deliveries.sql` |
| Rate limiting | `plugins/rate-limit.plugin.ts` (Redis token buckets, per-scope) |
| Auto-index | `apps/api/src/services/index-advisor.service.ts` + scheduled job |
| GDPR | `routes/admin/gdpr/{erase,export}.ts` |
| Audit | `db/migrations/006_audit_partitioning.sql` + maintenance job; `routes/audit/*`; `apps/web/.../AuditLogViewer` |

---

## Tests / acceptance

- Slack: a leave request can be initiated and approved from Slack; rich forms degrade gracefully.
- Notifications: a failing channel retries then dead-letters; backlog > 1000 halves the rate and
  emits `notifications:degraded`.
- Rate limiting: the 4th compile in a minute (per user) is rejected; status pings are exempt.
- `IndexAdvisorService`: a hot `extended_data` field gets a functional index; budget is enforced.
- GDPR: erase cascades, anonymizes `skill_executions`, redacts audit PII while retaining rows;
  export returns the full ZIP.

---

## Risks

- **Channel parity drift** — keep a single channel-normalizer so WebChat stays the source of truth.
- **Notification storms** — the adaptive throttle must be load-tested, not just unit-tested.
- **GDPR vs retention** — audit rows are retained 7 years; erasure redacts, never deletes them.

---

## Exit criteria → Phase 2

Operable Phase 1: Slack + WebChat, durable notifications, rate limits, GDPR, and an audit viewer
— with a clean retrospective and a documented Phase 2 decision.

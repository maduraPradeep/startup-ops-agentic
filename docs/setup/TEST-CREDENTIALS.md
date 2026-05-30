# Test Credentials

Seeded by `supabase/seed.sql` into the local Supabase instance (dev tenant: **Acme Corp**).  
Run `supabase db reset` to re-apply. All passwords: `Password1!`

## Auth Users

| Email | Password | Role | Employee record |
|---|---|---|---|
| `admin@acme.test` | `Password1!` | `platform_admin` | — |
| `radia@acme.test` | `Password1!` | `hr_admin` | Radia Perlman |
| `ada@acme.test` | `Password1!` | `manager` | Ada Lovelace |
| `grace@acme.test` | `Password1!` | `department_head` | Grace Hopper |
| `alan@acme.test` | `Password1!` | `employee` | Alan Turing |

## Role Permissions

| Role | Key permissions |
|---|---|
| `platform_admin` | Bypasses all `authorize()` checks — full access |
| `hr_admin` | `employees:create/read/update/terminate`, `leave_requests:read/approve/reject`, `audit_logs:read/export` |
| `manager` | `employees:read/update`, `leave_requests:read/approve`, `projects:create/update` |
| `department_head` | Same as `manager` + `documents:read` |
| `employee` | `employees:read_self`, `leave_requests:create/cancel_self`, `leave_policies:read` |

## Tenant

| Field | Value |
|---|---|
| ID | `00000000-0000-0000-0000-000000000001` |
| Name | `Acme Corp` |
| Slug | `acme` |

## Sign-in (GoTrue)

```bash
curl -X POST http://localhost:54321/auth/v1/token?grant_type=password \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"radia@acme.test","password":"Password1!"}'
```

The returned `access_token` is a GoTrue JWT. Pass it as `Authorization: Bearer <token>` to the Fastify gateway (`http://localhost:3001`).

The `anon` key is printed by `supabase status`.

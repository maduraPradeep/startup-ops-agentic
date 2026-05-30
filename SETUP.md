# Setup Guide

## Architecture

| Service | Tech | Port |
|---------|------|------|
| Postgres + Auth + Studio | Supabase CLI (local) | 54321 (API), 54322 (DB), 54323 (Studio) |
| Redis | Docker | 6379 |
| API Gateway | Fastify (Node.js) | 3001 |
| Web Frontend | Vite + React | 5173 |
| LangGraph agents | FastAPI (Python) | 8000 |

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop |
| Node.js | 22 | https://nodejs.org |
| pnpm | 9 | `npm i -g pnpm` |
| Python | 3.12 | https://www.python.org |
| Supabase CLI | Latest | `brew install supabase/tap/supabase` |

Verify:

```bash
docker --version
node --version      # should be ≥ 22
pnpm --version      # should be ≥ 9
python3 --version   # should be 3.12.x
supabase --version
```

---

## Step 1 — Clone and install Node dependencies

```bash
git clone <repo-url>
cd startup-ops-agentic
pnpm install
```

---

## Step 2 — Environment variables

```bash
cp .env.example .env
```

Leave the file open — you'll fill in the Supabase keys in Step 4.

---

## Step 3 — Start Supabase (local)

```bash
supabase start
```

This boots a local Postgres instance, GoTrue auth, and Supabase Studio. On first run it pulls
Docker images (~1–2 minutes).

Once ready, output looks like:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJ...
service_role key: eyJ...
JWT secret: super-secret-jwt-token-...
```

---

## Step 4 — Fill in Supabase env values

Copy the values printed by `supabase start` into `.env`:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SUPABASE_JWT_SECRET=<JWT secret>
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Keep these as-is for local dev
JWT_SECRET=<JWT secret>   # same value as SUPABASE_JWT_SECRET
PORT=3001
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
REDIS_URL=redis://localhost:6379
LANGGRAPH_URL=http://localhost:8000
LANGGRAPH_API_KEY=dev-key

VITE_API_URL=http://localhost:3001/api/v1
VITE_WS_URL=http://localhost:3001
```

To retrieve the values later at any time: `supabase status`

---

## Step 5 — Apply migrations and seed data

```bash
supabase db reset
```

This applies all migrations in `supabase/migrations/` and runs `supabase/seed.sql`, which loads
the dev tenant (Acme Corp) and test users. See `docs/setup/TEST-CREDENTIALS.md` for all seeded
credentials.

---

## Step 6 — Start Redis

```bash
make dev-up
```

This starts the Redis container (the only remaining Docker service). Verify:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml ps
```

---

## Step 7 — Start Node apps (API + Web)

```bash
pnpm dev
```

Turbo runs both apps in parallel:

- API: http://localhost:3001
- Web: http://localhost:5173

---

## Step 8 — Start the LangGraph service (Python)

In a separate terminal:

```bash
cd services/langgraph
python3 -m venv .venv          # first run only
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt   # first run only
uvicorn main:app --reload --port 8000
```

- LangGraph API: http://localhost:8000
- OpenAPI docs: http://localhost:8000/docs

---

## Quick reference (full startup)

```bash
# Terminal 1
supabase start && supabase db reset && make dev-up

# Terminal 2
pnpm dev

# Terminal 3
cd services/langgraph && source .venv/bin/activate && uvicorn main:app --reload --port 8000
```

---

## Service URLs

| Service | URL |
|---------|-----|
| Web app | http://localhost:5173 |
| API | http://localhost:3001 |
| Supabase Studio | http://localhost:54323 |
| Supabase Auth (GoTrue) | http://localhost:54321/auth/v1 |
| LangGraph docs | http://localhost:8000/docs |
| PostgreSQL | localhost:54322 (db: `postgres`, user: `postgres`, pass: `postgres`) |
| Redis | localhost:6379 |

---

## Useful commands

| Command | Description |
|---------|-------------|
| `supabase start` | Start local Supabase (Postgres + Auth + Studio) |
| `supabase stop` | Stop local Supabase |
| `supabase db reset` | Wipe and re-apply migrations + seed |
| `supabase status` | Print connection URLs and keys |
| `make dev-up` | Start Redis |
| `make dev-down` | Stop Redis |
| `make dev-logs` | Stream Redis logs |
| `pnpm dev` | Start API + Web in watch mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |

---

## Running tests without Docker

The compiler and GraphBuilder tests are fully self-contained — no Supabase, Redis, or LangGraph
needed:

```bash
# TypeScript
pnpm --filter @ops/shared test
pnpm --filter @ops/compiler test

# Python
cd services/langgraph
source .venv/bin/activate
python -m pytest -v
```

---

## Troubleshooting

**`supabase start` fails with port conflict**
Another Postgres or service is using port 54321/54322. Stop the conflicting service or change
ports in `supabase/config.toml`.

**API fails to connect to Postgres**
Check that `SUPABASE_DB_URL` in `.env` matches the URL from `supabase status`. The port is
`54322`, not the default `5432`.

**Redis connection refused**
Run `make dev-up` and verify the container is running with `docker ps`.

**GoTrue JWT mismatch**
`JWT_SECRET` in `.env` must exactly match `SUPABASE_JWT_SECRET` (both come from `supabase status`).

# Development Guide

## Architecture Overview

The platform consists of five services that must all be running for full functionality:

| Service | Tech | Port | Start method |
|---------|------|------|--------------|
| PostgreSQL + pgvector | Docker | 5432 | `make dev-up` |
| Directus CMS | Docker | 8055 | `make dev-up` |
| Redis | Docker | 6379 | `make dev-up` |
| API Gateway | Fastify (Node) | 3001 | `pnpm dev` (turbo) |
| Web Frontend | Vite + React | 5173 | `pnpm dev` (turbo) |
| LangGraph agents | FastAPI (Python) | 8000 | `uvicorn` (manual) |

---

## Prerequisites

- **Docker Desktop** running
- **Node.js** ≥ 22 and **pnpm** ≥ 9 (`npm i -g pnpm`)
- **Python** 3.12 (for the LangGraph service)

---

## Step 1 — Environment variables

Copy the root `.env` and fill in secrets (dev defaults already work locally):

```bash
cp .env .env.local   # optional, .env is already gitignored
```

Key values for local dev (already set in `.env`):

```
DIRECTUS_URL=http://localhost:8055
DIRECTUS_ADMIN_TOKEN=your-static-admin-token
JWT_SECRET=your-jwt-secret-min-32-chars-long-here
REDIS_URL=redis://localhost:6379
LANGGRAPH_URL=http://localhost:8000
VITE_API_URL=http://localhost:3001/api/v1
VITE_WS_URL=http://localhost:3001
```

---

## Step 2 — Start infrastructure (Docker)

```bash
make dev-up
```

This starts **PostgreSQL**, **Directus**, and **Redis** as detached containers.

Verify everything is healthy:

```bash
make dev-logs          # stream all container logs
docker compose -f infrastructure/docker/docker-compose.dev.yml ps
```

Directus admin UI is available at [http://localhost:8055](http://localhost:8055)  
- Email: `admin@ops-platform.com`  
- Password: `admin123`

---

## Step 3 — Seed Directus collections (first run only)

```bash
make dev-seed
```

This applies the schema snapshot and sets up Directus collections via the setup script.

---

## Step 4 — Install Node dependencies

```bash
pnpm install
```

---

## Step 5 — Start Node services (API + Web)

```bash
pnpm dev
```

Turbo runs both `apps/api` and `apps/web` in parallel:

- API: [http://localhost:3001](http://localhost:3001)
- Web: [http://localhost:5173](http://localhost:5173)

---

## Step 6 — Start the LangGraph service (Python)

In a separate terminal:

```bash
cd services/langgraph
python -m venv .venv          # first run only
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt   # first run only
uvicorn main:app --reload --port 8000
```

LangGraph API: [http://localhost:8000](http://localhost:8000)  
Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Full startup (quick reference)

```bash
# Terminal 1 — infrastructure
make dev-up

# Terminal 2 — Node apps
pnpm install && pnpm dev

# Terminal 3 — Python agents
cd services/langgraph && source .venv/bin/activate && uvicorn main:app --reload --port 8000
```

---

## Useful commands

| Command | Description |
|---------|-------------|
| `make dev-up` | Start Docker services |
| `make dev-down` | Stop Docker services |
| `make dev-reset` | Wipe volumes and restart Docker services |
| `make dev-seed` | Re-apply Directus schema and collections |
| `make dev-logs` | Stream Docker logs |
| `pnpm dev` | Start API + Web in watch mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |

---

## Service URLs

| Service | URL |
|---------|-----|
| Web app | http://localhost:5173 |
| API | http://localhost:3001 |
| Directus admin | http://localhost:8055 |
| LangGraph docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (db: `ops_platform`, user: `ops_user`) |
| Redis | localhost:6379 |

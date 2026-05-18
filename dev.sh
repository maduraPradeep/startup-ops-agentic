#!/usr/bin/env bash
# Start the full dev environment: Docker infra + Node apps + Python LangGraph
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LANGGRAPH_DIR="$ROOT/services/langgraph"
VENV="$LANGGRAPH_DIR/.venv"
LOG_DIR="$ROOT/.dev-logs"
SEED_MARKER="$ROOT/.dev-seeded"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { printf "${GREEN}[dev]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[dev]${NC} %s\n" "$*"; }
error() { printf "${RED}[dev]${NC} %s\n" "$*" >&2; }

# ── Cleanup on exit ───────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  printf "\n${GREEN}[dev]${NC} Shutting down...\n"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Prerequisites ─────────────────────────────────────────────────────────────
check_cmd() {
  command -v "$1" &>/dev/null || { error "Required command not found: $1"; exit 1; }
}
check_cmd docker
check_cmd pnpm
check_cmd python3
check_cmd curl

# ── Prepare log dir ───────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── Step 1: Docker infra ──────────────────────────────────────────────────────
info "Starting Docker services (postgres, directus, redis)..."
docker compose -f "$ROOT/infrastructure/docker/docker-compose.dev.yml" up -d

# Poll the Directus HTTP endpoint from the host — avoids exec/wget quirks
info "Waiting for Directus to be healthy (this takes ~30s on first start)..."
DIRECTUS_WAIT=0
until curl -sf http://localhost:8055/server/health 2>/dev/null | grep -q '"status":"ok"'; do
  sleep 3
  DIRECTUS_WAIT=$((DIRECTUS_WAIT + 3))
  if (( DIRECTUS_WAIT > 120 )); then
    error "Directus did not become healthy after 120s. Check logs: make dev-logs"
    exit 1
  fi
done
info "Directus is healthy."

# ── Step 2: Seed (first run only) ─────────────────────────────────────────────
if [[ ! -f "$SEED_MARKER" ]]; then
  info "First run detected — seeding Directus collections..."
  POSTGRES_CONTAINER=docker-postgres-1 \
  DIRECTUS_URL=http://localhost:8055 \
  DIRECTUS_ADMIN_TOKEN=dev-admin-token \
    "$ROOT/infrastructure/directus/setup-collections.sh"
  touch "$SEED_MARKER"
  info "Seeding complete."
else
  info "Skipping seed (delete .dev-seeded to re-run)."
fi

# ── Step 3: Node dependencies ─────────────────────────────────────────────────
info "Installing Node dependencies..."
pnpm install --frozen-lockfile 2>&1 | tail -3

# ── Step 4: Node apps (API + Web) ─────────────────────────────────────────────
info "Starting API (port 3001) and Web (port 5173)..."
pnpm --filter "@ops/api" dev > "$LOG_DIR/api.log" 2>&1 &
PIDS+=($!)
pnpm --filter "@ops/web" dev > "$LOG_DIR/web.log" 2>&1 &
PIDS+=($!)

# ── Step 5: Python venv + LangGraph ──────────────────────────────────────────
if [[ ! -d "$VENV" ]]; then
  info "Creating Python venv..."
  python3 -m venv "$VENV"
fi

info "Installing Python dependencies..."
"$VENV/bin/pip" install -q -r "$LANGGRAPH_DIR/requirements.txt"

info "Starting LangGraph service (port 8000)..."
cd "$LANGGRAPH_DIR"
"$VENV/bin/uvicorn" main:app --reload --port 8000 \
  > "$LOG_DIR/langgraph.log" 2>&1 &
PIDS+=($!)
cd "$ROOT"

# ── Step 6: Wait for Node API to be ready ─────────────────────────────────────
info "Waiting for API to be ready..."
API_WAIT=0
until grep -q "listening\|Server listening\|started" "$LOG_DIR/api.log" 2>/dev/null; do
  sleep 2
  API_WAIT=$((API_WAIT + 2))
  if (( API_WAIT > 60 )); then
    warn "API is taking longer than expected. Check .dev-logs/api.log"
    break
  fi
done

# ── Done ──────────────────────────────────────────────────────────────────────
printf "\n"
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${GREEN}  Dev environment ready${NC}\n"
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "  Web app       → http://localhost:5173\n"
printf "  API           → http://localhost:3001\n"
printf "  Directus      → http://localhost:8055\n"
printf "  LangGraph     → http://localhost:8000/docs\n"
printf "  Logs          → .dev-logs/\n"
printf "\n"
printf "${YELLOW}  Press Ctrl+C to stop all services${NC}\n"
printf "\n"

# Keep alive so trap fires on Ctrl+C
wait

#!/usr/bin/env bash
# Boots every service VEDA needs for local development with prefixed log streams.
# Reads .env automatically. Ctrl-C kills the whole tree.
#
# Stack started:
#   docker (if not running): redis + redpanda from docker-compose.yml
#   FastAPI: identity (8083), blueprint (8084), catalog (8085), order (8086),
#            team (8087), template (8088), integration-hub (8089),
#            daemon (8082), orchestrator (8081)
#   TS: edge (8080), dashboard (3001)
#
# Each service prints with a colored prefix so you can grep/follow specific lines.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

if [ ! -f .env ]; then
  echo "ERROR: $REPO/.env missing. Copy from .env.example first."
  exit 1
fi

# Export all .env vars to children
set -a
# shellcheck disable=SC1091
source .env
set +a

PYTHONPATH_BASE="$REPO/packages/python-shared:$REPO/packages/llm-router"
CAPS_PATH="$REPO/capabilities/broadcast:$REPO/capabilities/catalog:$REPO/capabilities/integration:$REPO/capabilities/media:$REPO/capabilities/payment:$REPO/capabilities/recommendations:$REPO/capabilities/scheduling:$REPO/capabilities/support"

# ── Colors ──────────────────────────────────────────────────────────────
C_RESET=$'\033[0m'
C_DIM=$'\033[2m'
declare -A COLORS=(
  [edge]=$'\033[36m'        # cyan
  [orch]=$'\033[35m'        # magenta
  [dash]=$'\033[33m'        # yellow
  [ident]=$'\033[34m'       # blue
  [bp]=$'\033[32m'          # green
  [cat]=$'\033[31m'         # red
  [ord]=$'\033[36m'
  [team]=$'\033[34m'
  [tmpl]=$'\033[33m'
  [int]=$'\033[35m'
  [daemon]=$'\033[32m'
)

PIDS=()

# Run a command with a colored prefix on each output line. Stderr merged in.
run_prefixed() {
  local name="$1"; shift
  local color="${COLORS[$name]:-}"
  ("$@" 2>&1) | sed "s|^|${color}[${name}]${C_RESET} |" &
  PIDS+=($!)
}

cleanup() {
  echo
  echo "${C_DIM}stopping all services...${C_RESET}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# ── 1. Local infra (Redis + Redpanda) ──────────────────────────────────
echo "${C_DIM}starting local infra (redis, redpanda)...${C_RESET}"
docker compose up -d redis redpanda 2>&1 | sed "s|^|${C_DIM}[infra]${C_RESET} |" || {
  echo "WARN: docker compose failed; assuming infra is already running elsewhere"
}
sleep 2

# ── 2. Python services ─────────────────────────────────────────────────
py_service() {
  local name="$1" pkg="$2" port="$3"
  local app_dir="$REPO/apps/$pkg"
  run_prefixed "$name" \
    env PYTHONPATH="$PYTHONPATH_BASE:$CAPS_PATH:$app_dir" \
    python3 -m uvicorn "${pkg//-/_}.main:app" --host 127.0.0.1 --port "$port" --no-access-log
}

py_service ident  identity-service   8083
py_service bp     blueprint-service  8084
py_service cat    catalog-service    8085
py_service ord    order-service      8086
py_service team   team-service       8087
py_service tmpl   template-service   8088
py_service int    integration-hub    8089
# 8081/8082 are reserved by Redpanda (schema registry + pandaproxy) on the host.
py_service daemon daemon             8182
py_service orch   orchestrator       8181

# ── 3. TypeScript services ─────────────────────────────────────────────
run_prefixed edge bash -c "cd $REPO && pnpm --filter @veda/edge dev"
run_prefixed dash bash -c "cd $REPO && pnpm --filter @veda/dashboard dev"

echo
echo "${C_DIM}all services launching. dashboard: http://localhost:3001${C_RESET}"
echo "${C_DIM}fire a test message: pnpm tsx scripts/simulate-aisensy.ts \"hi\"${C_RESET}"
echo "${C_DIM}ctrl-c to stop all.${C_RESET}"
echo

wait

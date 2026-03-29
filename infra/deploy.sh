#!/usr/bin/env bash
# Pantheon backend deployment script for Vultr demo readiness.
#
# One command should leave sandbox + swarm worker running and healthy.
#
# Usage:
#   ./infra/deploy.sh
#   ./infra/deploy.sh --repo-dir /opt/pantheon --branch master --set-webhook
#
# Notes:
# - Run this on the Vultr server.
# - Requires Docker + Docker Compose plugin + git + curl.
# - Expects a populated .env in the repo root.
set -euo pipefail

REPO_DIR="/opt/pantheon"
BRANCH="master"
HEALTH_URL="http://localhost:9000/sandbox/health"
HEALTH_TIMEOUT_SECONDS=120
SET_WEBHOOK="false"
SKIP_PULL="false"

log() {
  printf "[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<'EOF'
Pantheon Vultr backend deploy helper

Options:
  --repo-dir <path>      Repo directory on server (default: /opt/pantheon)
  --branch <name>        Git branch to deploy (default: master)
  --set-webhook          Set Telegram webhook to ${WEBAPP_BASE_URL}/telegram
  --skip-pull            Skip git fetch/checkout/pull
  -h, --help             Show this help

Example:
  ./infra/deploy.sh --set-webhook
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir)
      REPO_DIR="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --set-webhook)
      SET_WEBHOOK="true"
      shift
      ;;
    --skip-pull)
      SKIP_PULL="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker is required"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is required"
command -v git >/dev/null 2>&1 || die "git is required"
command -v curl >/dev/null 2>&1 || die "curl is required"

[[ -d "$REPO_DIR" ]] || die "Repo dir not found: $REPO_DIR"
cd "$REPO_DIR"

[[ -f "infra/docker-compose.yml" ]] || die "infra/docker-compose.yml not found"
[[ -f ".env" ]] || die ".env not found in $REPO_DIR. Copy .env.example and fill values first"

if [[ "$SKIP_PULL" != "true" ]]; then
  log "Updating repository ($BRANCH)..."
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  log "Skipping git pull (--skip-pull)."
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# AI Studio (API keys) OR Vertex AI (ADC + project — see .env.example)
_vertex="${GOOGLE_GENAI_USE_VERTEXAI:-}"
_vertex_lc=$(printf '%s' "${_vertex}" | tr '[:upper:]' '[:lower:]')
_vertex_on=0
case "${_vertex_lc}" in 1|true|yes|on) _vertex_on=1 ;; esac
if [[ "$_vertex_on" -eq 1 ]]; then
  if [[ -z "${GOOGLE_CLOUD_PROJECT:-}" && -z "${GCP_PROJECT_ID:-}" ]]; then
    die "Vertex AI enabled (GOOGLE_GENAI_USE_VERTEXAI) but GOOGLE_CLOUD_PROJECT or GCP_PROJECT_ID is unset"
  fi
elif [[ -z "${GOOGLE_API_KEY:-}" && -z "${GEMINI_API:-}" ]]; then
  die "Missing AI credentials: set GOOGLE_API_KEY or GEMINI_API (AI Studio), or enable Vertex with GOOGLE_GENAI_USE_VERTEXAI and GOOGLE_CLOUD_PROJECT"
fi

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  log "TELEGRAM_BOT_TOKEN is unset. Telegram webhook setup and bot flows will be unavailable."
fi

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  log "ELEVENLABS_API_KEY is unset. Voice flows will be unavailable."
fi

if [[ -z "${SANDBOX_API_URL:-}" ]]; then
  log "SANDBOX_API_URL is unset in .env. Recommended value for containers is http://sandbox:9000"
fi

COMPOSE=(docker compose -f infra/docker-compose.yml)

log "Pre-pulling sandbox harness image..."
docker pull node:18-alpine >/dev/null

log "Building backend images..."
"${COMPOSE[@]}" build

log "Starting services..."
"${COMPOSE[@]}" up -d --remove-orphans

log "Waiting for Hephaestus health endpoint..."
start_time="$(date +%s)"
while true; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi

  now="$(date +%s)"
  elapsed=$((now - start_time))
  if (( elapsed >= HEALTH_TIMEOUT_SECONDS )); then
    "${COMPOSE[@]}" ps || true
    "${COMPOSE[@]}" logs --tail 80 sandbox || true
    die "Sandbox did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s"
  fi
  sleep 2
done

log "Sandbox is healthy."

if [[ "$SET_WEBHOOK" == "true" ]]; then
  if [[ -z "${WEBAPP_BASE_URL:-}" ]]; then
    die "--set-webhook requires WEBAPP_BASE_URL in .env"
  fi

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
    die "--set-webhook requires TELEGRAM_BOT_TOKEN in .env"
  fi

  webhook_url="${WEBAPP_BASE_URL%/}/telegram"
  log "Setting Telegram webhook to: $webhook_url"

  response="$(curl -fsS -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    -d "url=${webhook_url}")"
  log "Telegram webhook response: $response"
fi

log "Waiting for ADK agents service..."
adk_start="$(date +%s)"
while true; do
  if curl -fsS http://localhost:8001/list-apps >/dev/null 2>&1; then
    log "ADK agents service is healthy."
    break
  fi
  now="$(date +%s)"
  if (( now - adk_start >= 60 )); then
    log "WARNING: ADK agents service did not start within 60s — continuing."
    break
  fi
  sleep 2
done

log "Deployment complete. Service status:"
"${COMPOSE[@]}" ps

log "Demo backend ready."
log "Health check: ${HEALTH_URL}"
log "Events ingest:  http://<vps-ip>:9000/events"
log "Events stream:  ws://<vps-ip>:9000/ws"

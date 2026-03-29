#!/usr/bin/env bash
# Pantheon — Google Cloud Run deployment
#
# Deploys two Cloud Run services from the same Docker image:
#   1. pantheon-agents  — main ADK app (zeus root agent + Dev UI)
#   2. impact-agent     — remote A2A specialist (separate public URL)
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - GCP project with billing enabled
#   - .env with AI Studio keys (GOOGLE_API_KEY / GEMINI_API) OR Vertex AI
#     (GOOGLE_GENAI_USE_VERTEXAI + GCP_PROJECT_ID + ADC / workload identity)
#
# Usage:
#   export GCP_PROJECT_ID=your-project-id
#   ./infra/cloud-deploy.sh
#
#   Or set GCP_PROJECT_ID in .env and this script will source it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${CLOUD_RUN_REGION:-us-central1}"
REPO_NAME="pantheon"
IMAGE_NAME="agents"
PANTHEON_SERVICE="pantheon-agents"
IMPACT_SERVICE="impact-agent"

log() { printf "[%s] %s\n" "$(date '+%H:%M:%S')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# ── Load .env if GCP_PROJECT_ID not already set ─────────────────────────────
if [[ -z "${GCP_PROJECT_ID:-}" ]]; then
  [[ -f "$REPO_ROOT/.env" ]] || die "GCP_PROJECT_ID is not set and .env is missing"
  # shellcheck disable=SC1091
  set -a; source "$REPO_ROOT/.env"; set +a
fi
[[ -n "${GCP_PROJECT_ID:-}" ]] || die "GCP_PROJECT_ID is required. Set it in .env or export it."

VERTEX_FLAG="${GOOGLE_GENAI_USE_VERTEXAI:-}"
VERTEX_LC=$(printf '%s' "${VERTEX_FLAG}" | tr '[:upper:]' '[:lower:]')
USE_VERTEX=0
case "${VERTEX_LC}" in 1|true|yes|on) USE_VERTEX=1 ;; esac

if [[ "$USE_VERTEX" -eq 1 ]]; then
  LOC="${GOOGLE_CLOUD_LOCATION:-us-central1}"
  PANTHEON_ENV="GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=${GCP_PROJECT_ID},GOOGLE_CLOUD_LOCATION=${LOC},PANTHEON_ADK_ALLOW_ORIGINS=*"
  IMPACT_ENV="GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLOUD_PROJECT=${GCP_PROJECT_ID},GOOGLE_CLOUD_LOCATION=${LOC},PANTHEON_ADK_AGENTS_DIR=/app/adk_apps/impact_agent,PANTHEON_ADK_ALLOW_ORIGINS=*"
else
  API_KEY="${GOOGLE_API_KEY:-${GEMINI_API:-}}"
  [[ -n "$API_KEY" ]] || die "GOOGLE_API_KEY (or GEMINI_API) is required in .env unless using Vertex (GOOGLE_GENAI_USE_VERTEXAI)"
  PANTHEON_ENV="GOOGLE_API_KEY=${API_KEY},PANTHEON_ADK_ALLOW_ORIGINS=*"
  IMPACT_ENV="GOOGLE_API_KEY=${API_KEY},PANTHEON_ADK_AGENTS_DIR=/app/adk_apps/impact_agent,PANTHEON_ADK_ALLOW_ORIGINS=*"
fi

REGISTRY="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${REPO_NAME}"
IMAGE="${REGISTRY}/${IMAGE_NAME}"

log "Project : $GCP_PROJECT_ID"
log "Region  : $REGION"
log "Image   : $IMAGE"

# ── Enable required APIs ─────────────────────────────────────────────────────
log "Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project "$GCP_PROJECT_ID" \
  --quiet

# ── Create Artifact Registry repo (idempotent) ───────────────────────────────
log "Ensuring Artifact Registry repository exists..."
gcloud artifacts repositories describe "$REPO_NAME" \
  --project "$GCP_PROJECT_ID" \
  --location "$REGION" \
  --quiet 2>/dev/null || \
gcloud artifacts repositories create "$REPO_NAME" \
  --project "$GCP_PROJECT_ID" \
  --location "$REGION" \
  --repository-format docker \
  --quiet

# ── Authenticate Docker to Artifact Registry ─────────────────────────────────
log "Authenticating Docker..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── Build and push image ─────────────────────────────────────────────────────
log "Building Docker image..."
docker build \
  --platform linux/amd64 \
  -t "${IMAGE}:latest" \
  -f "$REPO_ROOT/infra/Dockerfile.agents" \
  "$REPO_ROOT"

log "Pushing image to Artifact Registry..."
docker push "${IMAGE}:latest"

# ── Common Cloud Run flags ────────────────────────────────────────────────────
COMMON_FLAGS=(
  --project "$GCP_PROJECT_ID"
  --region "$REGION"
  --image "${IMAGE}:latest"
  --platform managed
  --allow-unauthenticated
  --port 8001
  --memory 1Gi
  --cpu 1
  --min-instances 1
  --max-instances 3
  --quiet
)

# ── Deploy pantheon-agents ────────────────────────────────────────────────────
log "Deploying ${PANTHEON_SERVICE}..."
gcloud run deploy "$PANTHEON_SERVICE" \
  "${COMMON_FLAGS[@]}" \
  --set-env-vars "${PANTHEON_ENV}"

PANTHEON_URL="$(gcloud run services describe "$PANTHEON_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$REGION" \
  --format 'value(status.url)')"

# ── Deploy impact-agent (separate service = real A2A) ────────────────────────
log "Deploying ${IMPACT_SERVICE}..."
gcloud run deploy "$IMPACT_SERVICE" \
  "${COMMON_FLAGS[@]}" \
  --set-env-vars "${IMPACT_ENV}"

IMPACT_URL="$(gcloud run services describe "$IMPACT_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$REGION" \
  --format 'value(status.url)')"

# ── Update pantheon-agents with the live impact-agent URL ────────────────────
log "Wiring A2A: setting PANTHEON_IMPACT_AGENT_CARD_URL on ${PANTHEON_SERVICE}..."
gcloud run services update "$PANTHEON_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$REGION" \
  --update-env-vars "PANTHEON_IMPACT_AGENT_CARD_URL=${IMPACT_URL}/.well-known/agent.json" \
  --quiet

# ── Print results ─────────────────────────────────────────────────────────────
echo ""
echo "======================================================================"
echo "  Pantheon Cloud Run deployment complete"
echo "======================================================================"
echo ""
echo "  ADK Dev UI (open this for judges):"
echo "    ${PANTHEON_URL}/dev-ui/"
echo ""
echo "  Pantheon agent API:"
echo "    ${PANTHEON_URL}"
echo ""
echo "  Remote A2A impact specialist:"
echo "    ${IMPACT_URL}"
echo ""
echo "  Add these to your .env:"
echo "    PANTHEON_AGENTS_URL=${PANTHEON_URL}"
echo "    PANTHEON_IMPACT_AGENT_URL=${IMPACT_URL}"
echo ""
echo "  Trigger a demo run:"
echo "    curl -X POST ${PANTHEON_URL}/run \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"app_name\":\"pantheon_agent\",\"message\":\"analyze sample\"}'"
echo "======================================================================"

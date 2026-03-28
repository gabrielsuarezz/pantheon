#!/usr/bin/env bash
# Pantheon deployment script — Vultr VPS
# Usage: ./infra/deploy.sh
# Run from the repo root on the server, or SSH in and execute.
set -euo pipefail

REPO_DIR="/opt/pantheon"
COMPOSE="docker compose -f infra/docker-compose.yml"

echo "=== Pantheon deploy ==="

# Pull latest
cd "$REPO_DIR"
git pull origin master

# Validate .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example and fill in values."
  exit 1
fi

# Pull node:18-alpine for the sandbox harness (avoids first-run delay)
docker pull node:18-alpine

# Build and restart services
$COMPOSE build --no-cache
$COMPOSE up -d --remove-orphans

# Wait for sandbox health check
echo "Waiting for Hephaestus..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:9000/sandbox/health > /dev/null 2>&1; then
    echo "Hephaestus is up."
    break
  fi
  sleep 2
done

echo "=== Deploy complete ==="
$COMPOSE ps

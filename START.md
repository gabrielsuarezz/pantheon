# Starting Pantheon

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | [python.org](https://www.python.org/downloads/) |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker | 27+ | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) (for frontend dev) |
| sshpass | latest | `brew install sshpass` (macOS) |

---

## 1. Clone and install

```bash
git clone https://github.com/pablomoli/pantheon.git
cd pantheon
uv sync
```

---

## 2. Environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in **all** values:

```env
# Required — the system will not start without these
GEMINI_API=<your-gemini-api-key>
GOOGLE_API_KEY=<same-key-as-above>        # ADK uses this name
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
ELEVENLABS_API_KEY=<elevenlabs-api-key>
ELEVENLABS_AGENT_ID=<elevenlabs-agent-id>

# Amazon Nova (used by some agent tools)
AMAZON_NOVA_API=<amazon-nova-key>

# Sandbox internal URL (keep this default for Docker)
SANDBOX_API_URL=http://sandbox:9000

# Vultr server credentials (for remote deployment)
VULTR_SERVER_IP=<server-ip>
VULTR_SERVER_USER=root
VULTR_SERVER_PASS=<server-password>
```

> **Important:** `GOOGLE_API_KEY` and `GEMINI_API` must both be set to the same Gemini key. The Google ADK library reads `GOOGLE_API_KEY`, while the agent tools read `GEMINI_API`.

---

## 3. Choose how to run

### Option A — Full stack on Vultr (production / demo)

This deploys the sandbox, frontend dashboard, and nginx reverse proxy as Docker containers on your Vultr server.

```bash
# SSH into your server
sshpass -p '<password>' ssh root@<server-ip>

# On the server:
cd /opt/pantheon
git pull origin master

# Copy your .env to the server (or scp from local)
# Then build and start everything:
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
```

After startup, three containers will be running:

| Service | Port | URL |
|---------|------|-----|
| nginx | :80 | `http://<server-ip>/` (landing page) |
| sandbox | :9000 | `http://<server-ip>/sandbox/health` |
| frontend | :3000 | `http://<server-ip>/dashboard` |

Verify everything is healthy:
```bash
# On the server
docker compose -f infra/docker-compose.yml ps

# From anywhere
curl http://<server-ip>/sandbox/health
# Expected: {"status":"ok","docker_available":true,"version":"0.1.0"}
```

### Option B — Local development (sandbox only)

Run the sandbox service directly on your machine (requires Docker running locally):

```bash
uv run python run.py
```

This starts:
- FastAPI on `http://localhost:9000`
- Artemis file watcher on `/tmp/samples`
- Swarm worker loop (ready to run Zeus pipeline)

### Option C — Local development (frontend only)

If you just want to work on the dashboard:

```bash
cd frontend
npm install
npm run dev
```

Dashboard will be at `http://localhost:3000/dashboard`.

By default the frontend connects to the Vultr server's sandbox. To point at a local sandbox instead, edit `frontend/.env.local`:

```env
NEXT_PUBLIC_SANDBOX_URL=http://localhost:9000
```

### Option D — Everything local (sandbox + frontend)

Run both in separate terminals:

```bash
# Terminal 1 — sandbox
uv run python run.py

# Terminal 2 — frontend
cd frontend && npm run dev
```

Make sure `frontend/.env.local` points to `http://localhost:9000`.

---

## 4. Verify the system

### Health check
```bash
curl http://localhost:9000/sandbox/health
```

### WebSocket test
```bash
# Install websocat if needed: brew install websocat
websocat ws://localhost:9000/ws
```
You should see an open connection. Events will appear here as agents run.

### Trigger the pipeline

Drop a file into the samples directory to trigger Artemis → Zeus pipeline:

```bash
# If running locally:
cp some-test-file.txt /tmp/samples/

# If running on the server:
docker cp some-test-file.txt infra-sandbox-1:/tmp/samples/
```

Watch the dashboard — agent nodes should light up and events will stream in the Divine Chronicle.

---

## 5. Service architecture

```
Browser → :80 nginx
               ├── /              → frontend:3000  (landing page)
               ├── /dashboard     → frontend:3000  (live dashboard)
               ├── /ws            → sandbox:9000   (WebSocket events)
               ├── /events        → sandbox:9000   (agent event ingest)
               └── /sandbox/*     → sandbox:9000   (analysis API)
```

---

## 6. Stopping

```bash
# On the server
docker compose -f infra/docker-compose.yml down

# Locally
# Ctrl+C in each terminal
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing environment variables` | Make sure both `GOOGLE_API_KEY` and `GEMINI_API` are set in `.env` |
| Sandbox container keeps restarting | Check logs: `docker compose -f infra/docker-compose.yml logs sandbox --tail 30` |
| Port 80 already in use | Stop caddy/apache: `systemctl stop caddy` |
| Dashboard shows "Offline" | Verify `NEXT_PUBLIC_SANDBOX_URL` points to the correct sandbox host |
| WebSocket won't connect | Make sure CORS is enabled (it is by default) and the sandbox is running |
| `Agent already has a parent` error | Agent hierarchy issue — each ADK agent can only have one parent |
| Docker not available in sandbox | Make sure `/var/run/docker.sock` is mounted in docker-compose |

# Pantheon

AI-driven malware analysis and incident response. Submit a malware sample via Telegram or voice call — a swarm of specialized AI agents analyzes it across a Docker sandbox and a live Windows VPS, extracts every indicator of compromise, reconstructs the full attack chain, and returns a voice briefing with containment and remediation steps. A live web dashboard visualizes every agent handoff, tool call, and discovery in real time.

Built for HackUSF 2026.

---

## How it works

A user submits a sample (file upload, text, or voice message) through Telegram — or places a voice call directly to Zeus via the Telegram Mini App. Hermes routes the request into a Google ADK multi-agent pipeline. Each agent is named after a Greek god and owns a specific phase of the analysis. Every agent action is streamed via WebSocket to a live dashboard that shows the swarm working.

| Agent        | God        | Responsibility                                                              |
| ------------ | ---------- | --------------------------------------------------------------------------- |
| Orchestrator | Zeus       | Routes requests, compiles final response, handles voice calls               |
| Gateway      | Hermes     | Telegram bot + ElevenLabs voice I/O + Mini App voice call interface         |
| Triage       | Athena     | Classifies threat severity, opens incident ticket                           |
| Analysis     | Hades      | Docker sandbox + Windows VPS detonation, Procmon/Wireshark/FakeNet tools    |
| Intelligence | Apollo     | Extracts IOCs, enriches with Gemini threat intel, synthesizes prior runs    |
| Response     | Ares       | Generates containment, remediation, and prevention plan with YARA/Sigma     |
| Sandbox      | Hephaestus | FastAPI service, Docker container lifecycle, EventBus, WebSocket stream     |
| Sentinel     | Artemis    | Background daemon — auto-triggers pipeline on new samples                   |

All voice interaction is handled by the Muse module via ElevenLabs. Agent memory and behavioral similarity detection are handled by the KnowledgeStore layer in Hephaestus.

---

## Safety

**The malware sample (`6108674530.JS.malicious`) must never be executed directly on any machine.**

Dynamic analysis runs exclusively inside a hardened Docker container:

```
--network none
--memory 256m
--cpus 0.25
--read-only
--tmpfs /tmp/work:size=64m
--security-opt no-new-privileges
--cap-drop ALL
```

A Node.js instrumentation harness mocks all dangerous APIs (WScript, ActiveXObject, Shell) and logs intercepted calls without allowing real execution. See `sandbox/dynamic/manager.py`.

---

## Stack

- Python 3.12+, [uv](https://docs.astral.sh/uv/) package manager
- [Google ADK](https://google.github.io/adk-docs/) — multi-agent orchestration
- Gemini 2.5 Flash — LLM inference, deobfuscation analysis, memory synthesis
- [python-telegram-bot](https://python-telegram-bot.org/) — Telegram interface
- [ElevenLabs](https://elevenlabs.io/) — TTS, STT, and Conversational AI (voice calls)
- FastAPI + uvicorn — Hephaestus sandbox service + WebSocket event stream
- Docker SDK for Python — container lifecycle
- SQLite (stdlib, WAL mode) — job persistence + KnowledgeStore agent memory
- Pydantic v2 — all data models, strict typing throughout
- Next.js + Tailwind CSS — live dashboard (React Flow for agent graph)
- paramiko — SSH/SFTP to Windows VPS for Procmon/Wireshark/FakeNet-NG tools

---

## Setup

```bash
# install uv if you don't have it
curl -LsSf https://astral.sh/uv/install.sh | sh

# install dependencies
uv sync

# copy and fill in environment variables
cp .env.example .env

# run
uv run python run.py
```

---

## Environment variables

See `.env.example` for all required variables. Key ones:

| Variable                  | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `GOOGLE_API_KEY`          | Gemini API key                                                          |
| `GEMINI_API`              | Alias used by agent tools (same value as GOOGLE_API_KEY)                |
| `TELEGRAM_BOT_TOKEN`      | Telegram bot token                                                      |
| `ELEVENLABS_API_KEY`      | ElevenLabs API key                                                      |
| `ELEVENLABS_AGENT_ID`     | ElevenLabs Conversational AI agent ID (for voice calls)                 |
| `SANDBOX_API_URL`         | Internal URL of the Hephaestus service (default: `http://sandbox:9000`) |
| `WINDOWS_VPS_IP`          | IP of the Windows VPS for live detonation                               |
| `WINDOWS_VPS_USER`        | Windows VPS username                                                    |
| `WINDOWS_VPS_PASSWORD`    | Windows VPS password                                                    |

---

## Architecture docs

- Original design: `docs/superpowers/specs/2026-03-28-pantheon-design.md`
- Dashboard + event system design: `docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md`
- Malware analysis report: `docs/malware-analysis-6108674530.md`
- Team update (current state): `docs/team-update-2026-03-28.md`
- API contract: `sandbox/models.py`
- Team coding prompts: `AGENTS.md`

---

## Deployment

The full stack runs via Docker Compose on a Vultr VPS. See `infra/` and `infra/deploy.sh`.

```bash
docker compose -f infra/docker-compose.yml up -d
```

---

## Team

### ![UCF](https://img.shields.io/badge/UCF-Knights-000000?style=flat-square&labelColor=FFC904) Pablo Molina

### ![UCF](https://img.shields.io/badge/UCF-Knights-000000?style=flat-square&labelColor=FFC904) Saicharan Ramineni

### ![FIU](https://img.shields.io/badge/FIU-Panthers-081E3F?style=flat-square&labelColor=B6862C) Gabriel Suarez

### ![USF](https://img.shields.io/badge/USF-Bulls-006747?style=flat-square&labelColor=CFC493) Andres Dominguez

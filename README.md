# Pantheon

AI-driven malware analysis and incident response. Submit a malware sample via Telegram — a pipeline of specialized AI agents analyzes it in a real Docker sandbox, extracts indicators of compromise, and returns a voice report with containment and remediation steps.

Built for HackUSF 2026.

---

## How it works

A user submits a sample (file upload, text description, or voice message) through Telegram. The Hermes gateway transcribes and routes the request into a Google ADK multi-agent pipeline. Each agent is named after a Greek god and owns a specific phase of the analysis:

| Agent        | God        | Responsibility                                            |
| ------------ | ---------- | --------------------------------------------------------- |
| Orchestrator | Zeus       | Routes requests, compiles final response                  |
| Gateway      | Hermes     | Telegram bot + ElevenLabs voice I/O                       |
| Triage       | Athena     | Classifies threat severity, opens incident ticket         |
| Analysis     | Hades      | Submits sample to sandbox, interprets results             |
| Intelligence | Apollo     | Extracts IOCs, enriches with Gemini threat intel          |
| Response     | Ares       | Generates containment, remediation, and prevention plan   |
| Sandbox      | Hephaestus | FastAPI service managing real Docker analysis containers  |
| Sentinel     | Artemis    | Background daemon — auto-triggers pipeline on new samples |

All voice interaction is handled by the Muse module via ElevenLabs.

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
- Gemini 2.0 Flash — LLM inference and deobfuscation analysis
- [python-telegram-bot](https://python-telegram-bot.org/) — Telegram interface
- [ElevenLabs](https://elevenlabs.io/) — TTS and STT
- FastAPI + uvicorn — Hephaestus sandbox service
- Docker SDK for Python — container lifecycle
- Pydantic v2 — all data models, strict typing throughout

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

| Variable             | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `GOOGLE_API_KEY`     | Gemini API key                                                          |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token                                                      |
| `ELEVENLABS_API_KEY` | ElevenLabs API key                                                      |
| `SANDBOX_API_URL`    | Internal URL of the Hephaestus service (default: `http://sandbox:9000`) |

---

## Architecture docs

- Full design: `docs/superpowers/specs/2026-03-28-pantheon-design.md`
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

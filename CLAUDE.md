# Pantheon

AI-driven malware analysis and incident response system — HackUSF 2026.

Targets: NextEra Energy Malware Analysis Challenge + Google Cloud ADK Challenge + Best AI Hack (general track).

## CRITICAL SAFETY RULE

**NEVER execute `6108674530.JS.malicious` or any file from `MalwareChallenge.zip` on your local machine or the Vultr server.**

This is live malware. Analysis is only permitted via:
- Static analysis tools (string extraction, AST parsing, deobfuscation) in Python — never interpreted as code
- A fully isolated Docker container with `--network none`, `--memory 256m`, `--cpus 0.25`, `--read-only` filesystem, `--security-opt no-new-privileges`, `--cap-drop ALL`, and a JS instrumentation harness that mocks all dangerous APIs
- The dedicated Windows VPS (see Section: Windows VPS) which is snapshot-restored after every detonation and has all outbound network blocked at the cloud provider level

The only sanctioned dynamic execution paths are:
- `sandbox/dynamic/manager.py` — Docker-based JS harness (Pablo only)
- `agents/tools/vps_tools.py` — Windows VPS detonation via SSH (Pablo only)

**Violation of this rule could execute live malware on your machine and cause real damage.**

## Architecture

See `docs/superpowers/specs/2026-03-28-pantheon-design.md` for the original design.
See `docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md` for the dashboard + event system design.

The API contract (the Pydantic models for the sandbox REST service) lives in `sandbox/models.py`. This is the single source of truth for inter-service communication. Do not modify it without coordinating with Pablo.

## Greek God Naming Convention

| God | Role | Owner |
|---|---|---|
| Zeus | Root ADK orchestrator + voice call persona | Pablo |
| Hermes | Telegram bot + ElevenLabs voice I/O + Mini App | Gabriel |
| Athena | Triage — threat classification + incident tickets | Pablo |
| Hades | Malware analysis — Docker sandbox + Windows VPS tools | Andres |
| Apollo | IOC extraction + threat intel + report synthesis | Andres |
| Ares | Containment + remediation + prevention + YARA/Sigma | Andres |
| Hephaestus | Sandbox FastAPI service + Docker lifecycle + EventBus + WebSocket | Pablo |
| Artemis | Idle sentinel daemon — watches for new samples | Pablo |
| Muse | ElevenLabs voice module (TTS + STT) | Sai |

## Stack

- Python 3.12+
- `uv` as the package manager — NOT pip, NOT poetry, NOT conda
- Google ADK (`google-adk`) for multi-agent orchestration
- Gemini 2.5 Flash for LLM inference, deobfuscation, memory synthesis
- `python-telegram-bot` for the Telegram interface
- ElevenLabs SDK for voice TTS/STT and Conversational AI (voice calls via Mini App)
- FastAPI + uvicorn for the Hephaestus sandbox service + WebSocket event stream
- Docker SDK for Python for container management
- SQLite (Python stdlib, WAL mode) for job persistence + KnowledgeStore agent memory
- Pydantic v2 for all data models
- Next.js + Tailwind CSS + React Flow for the live dashboard (Sai)
- `paramiko` for SSH/SFTP to the Windows VPS
- mypy strict mode + ruff for code quality

## Package Manager: uv

    uv sync                  # install all dependencies
    uv run python run.py     # run the application
    uv add <package>         # add a dependency
    uv run mypy .            # type check (must pass)
    uv run ruff check .      # lint (must pass)
    uv run pytest            # run tests

Never use `pip install` directly. Always use `uv add` or edit `pyproject.toml`.

## Typing Rules

- Every function must have complete type annotations on all parameters and return types
- `from __future__ import annotations` at the top of every Python file
- No `Any` unless absolutely unavoidable — if used, add an inline comment explaining why
- Use `TypeAlias` for complex repeated types
- All data transfer objects must be Pydantic `BaseModel` subclasses
- `mypy --strict` must pass with zero errors

## Domain Boundaries

Zero merge conflicts by design — each person owns their directories exclusively.

| Owner | Directories / Files |
|---|---|
| Pablo | `sandbox/`, `agents/zeus.py`, `agents/athena.py`, `agents/artemis.py`, `agents/tools/event_tools.py`, `agents/tools/vps_tools.py`, `infra/` |
| Andres | `agents/hades.py`, `agents/apollo.py`, `agents/ares.py`, `agents/tools/` (except event_tools.py and vps_tools.py) |
| Gabriel | `gateway/` |
| Sai | `voice/`, `frontend/`, `infra/deploy.sh` (coordinate with Pablo on infra/) |

The only shared file is `sandbox/models.py`. Treat it as read-only unless you are Pablo and have communicated the change to the team.

## Windows VPS

A sacrificial Windows VPS is used for live detonation of the malware sample to capture the full attack chain (registry key names, dropped payload behavior, C2 network destinations) that the Node.js harness cannot observe.

Safety requirements (all must be met before any detonation):
- VPS network must have all outbound blocked at the cloud provider security group level
- FakeNet-NG must be running before `wscript.exe` is launched — it intercepts all network calls locally
- A snapshot must be taken before detonation and restored after via the Vultr API
- SSH access only — never RDP from your local machine with shared clipboard

Credentials: ask Pablo. VPS tools live in `agents/tools/vps_tools.py` (Pablo owns this file).

Required env vars:
```
WINDOWS_VPS_IP=
WINDOWS_VPS_USER=
WINDOWS_VPS_PASSWORD=
WINDOWS_VPS_SNAPSHOT_ID=   # optional: auto-restore after detonation
VULTR_API_KEY=              # optional: for snapshot restore via API
```

## WebSocket Event System

Every agent action is broadcast to the live dashboard via WebSocket. The EventBus lives in `sandbox/events.py` and is exposed at `GET /ws` on the Hephaestus service.

- Agents emit events by calling `POST /events` on the sandbox service
- The helper `emit_event()` in `agents/tools/event_tools.py` wraps this call
- Every tool call must emit `TOOL_CALLED` before and `TOOL_RESULT` after
- Every agent entry/exit must emit `AGENT_ACTIVATED` / `AGENT_COMPLETED`
- Every `transfer_to_agent` must emit `HANDOFF`

See `docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md` Section 4 for the full event schema.

## Environment

Copy `.env.example` to `.env` and fill in all values. Never commit `.env`.

Ask Pablo for the Vultr server credentials and IP, and the Windows VPS credentials.

## Submission Deadlines

- Hacking ends: Sunday March 29, 11:30 AM — no code changes after this
- DevPost closes: Sunday March 29, 12:30 PM — no exceptions
- Judging: Sunday 1:00 PM – 3:30 PM (expo-style, 4 min per team)
- Submit at: https://hackusf-2026.devpost.com

Include a public GitHub repo link in DevPost — private repos are disqualified.

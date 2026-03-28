# Pantheon

AI-driven malware analysis and incident response system — HackUSF 2026.

Targets: NextEra Energy Malware Analysis Challenge + Google Cloud ADK Challenge + Best AI Hack (general track).

## CRITICAL SAFETY RULE

**NEVER execute `6108674530.JS.malicious` or any file from `MalwareChallenge.zip` on any machine.**

This is live malware. Analysis is only permitted via:
- Static analysis tools (string extraction, AST parsing, deobfuscation) in Python — never interpreted as code
- A fully isolated Docker container with `--network none`, `--memory 256m`, `--cpus 0.25`, `--read-only` filesystem, `--security-opt no-new-privileges`, `--cap-drop ALL`, and a JS instrumentation harness that mocks all dangerous APIs

The only sanctioned dynamic execution path is `sandbox/dynamic/manager.py`. If you are not Pablo, do not touch that file.

**Violation of this rule could execute live malware on your machine and cause real damage.**

## Architecture

See `docs/superpowers/specs/2026-03-28-pantheon-design.md` for the complete design.

The API contract (the Pydantic models for the sandbox REST service) lives in `sandbox/models.py`. This is the single source of truth for inter-service communication. Do not modify it without coordinating with Pablo.

## Greek God Naming Convention

| God | Role | Owner |
|---|---|---|
| Zeus | Root ADK orchestrator | Pablo |
| Hermes | Telegram + ElevenLabs gateway | Gabriel |
| Athena | Triage — threat classification + incident tickets | Pablo |
| Hades | Malware analysis ADK agent | Andres |
| Apollo | IOC extraction + threat intel + report | Andres |
| Ares | Containment + remediation + prevention | Andres |
| Hephaestus | Sandbox FastAPI service + Docker lifecycle | Pablo |
| Artemis | Idle sentinel daemon — watches for new samples | Pablo |
| Muse | ElevenLabs voice module (TTS + STT) | Sai |

## Stack

- Python 3.12+
- `uv` as the package manager — NOT pip, NOT poetry, NOT conda
- Google ADK (`google-adk`) for multi-agent orchestration
- Gemini 2.0 Flash for LLM inference
- `python-telegram-bot` for the Telegram interface
- ElevenLabs SDK for voice TTS/STT
- FastAPI + uvicorn for the Hephaestus sandbox service
- Docker SDK for Python for container management
- Pydantic v2 for all data models
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
| Pablo | `sandbox/`, `agents/zeus.py`, `agents/athena.py`, `agents/artemis.py`, `infra/` |
| Andres | `agents/hades.py`, `agents/apollo.py`, `agents/ares.py`, `agents/tools/` |
| Gabriel | `gateway/` |
| Sai | `voice/`, `infra/deploy.sh` (coordinate with Pablo on infra/) |

The only shared file is `sandbox/models.py`. Treat it as read-only unless you are Pablo and have communicated the change to the team.

## Environment

Copy `.env.example` to `.env` and fill in all values. Never commit `.env`.

Ask Pablo for the Vultr server credentials and IP.

## Submission Deadlines

- Hacking ends: Sunday March 29, 11:30 AM — no code changes after this
- DevPost closes: Sunday March 29, 12:30 PM — no exceptions
- Judging: Sunday 1:00 PM – 3:30 PM (expo-style, 4 min per team)
- Submit at: https://hackusf-2026.devpost.com

Include a public GitHub repo link in DevPost — private repos are disqualified.

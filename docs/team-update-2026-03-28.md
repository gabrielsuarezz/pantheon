# Pantheon Team Update — March 28, 2026

## TL;DR

The entire backend of Pantheon is complete and working against real malware. The only missing piece is the Telegram gateway (Gabriel) and deployment wiring (Sai). We have about 16 hours left.

---

## What's Been Built

### Architecture

```
[Telegram User]
      |
  [Gateway]  <-- Gabriel, this is the missing piece
      |
  [Zeus]  -- root orchestrator
      |
  [Athena]  -- triage + incident ticket
      |
  [Hades]  -- malware analysis (calls Sandbox)
      |          |
      |     [Hephaestus Sandbox]
      |      static: deobfuscation + IOC regex + Gemini behavioral analysis
      |      dynamic: hardened Docker container, Node.js harness, API stub/intercept
      |
  [Apollo]  -- IOC enrichment + threat intel + report formatting
      |
  [Ares]  -- containment + remediation + prevention plans
      |
  [Zeus]  -- compiles final incident report
      |
  [Gateway]  -- sends back to user (voice via ElevenLabs, text via Telegram)
```

Everything between the two `[Gateway]` lines is done.

---

## The Sandbox (Hephaestus)

FastAPI service on port 9000. Accepts a malware sample, runs two analysis passes, returns a structured `ThreatReport`.

**Static pipeline:**
1. Deobfuscates JavaScript `_0x...` string encoding tables
2. Runs regex extraction for IPs, domains, Windows APIs, registry keys, file paths, dangerous patterns
3. Sends readable source to Gemini 2.5 Flash for behavioral inference

**Dynamic pipeline:**
1. Spawns a hardened Docker container: `--network none`, `--memory 256m`, `--cpus 0.25`, `--cap-drop ALL`, read-only filesystem
2. Injects a Node.js harness that stubs all dangerous APIs (WScript, ActiveX, Shell, filesystem writes)
3. Records what the malware *tried* to do — without letting it execute
4. Parses the intercept log into behavioral indicators

**REST API:**
```
POST /sandbox/analyze          -- submit sample, returns job_id
GET  /sandbox/report/{job_id}  -- full ThreatReport
GET  /sandbox/iocs/{job_id}    -- flat IOCReport
GET  /sandbox/health           -- Docker availability
POST /sandbox/memory           -- store agent output (KnowledgeStore)
GET  /sandbox/memory/{job_id}/{agent_name}
POST /sandbox/fingerprint/{job_id}
GET  /sandbox/similar/{job_id} -- Jaccard similarity search
```

**Validated against real malware.** We ran `6108674530.JS.malicious` through the full pipeline. It identified:
- Multi-stage WSH dropper
- Drops PE payloads disguised as `.png` files (`Mands.png`, `Vile.png`) to `C:\Users\Public\`
- Establishes Windows Registry persistence: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\`
- PowerShell execution via `iex([Convert]::FromBase64String(...))` — base64-encoded Unicode payload, evades command-line logging
- Uses `ADODB.Stream` for binary file writes, `WScript.Shell` for execution
- `windows-1251` encoding (Cyrillic character set) in payload
- Dynamically constructs system paths to evade static string detection

This directly answers all three NextEra challenge questions.

---

## The Agent Pipeline

Five Google ADK agents, chained via `transfer_to_agent`.

| Agent | Role | Tools |
|---|---|---|
| Zeus | Root orchestrator, routes and compiles | none |
| Athena | Threat classification, incident ticket | `classify_threat`, `create_incident_ticket` |
| Hades | Submits to sandbox, interprets report | `submit_sample`, `poll_report`, `get_report`, memory tools |
| Apollo | IOC enrichment, threat intel, formatting | `get_iocs`, `enrich_iocs_with_threat_intel`, `format_threat_report`, memory tools |
| Ares | Incident response plans, YARA/Sigma rules | `generate_containment_plan`, `generate_remediation_plan`, `generate_prevention_plan`, memory tools |

Each agent runs Gemini 2.5 Flash. All model references are centralized in `agents/model_config.py`.

---

## KnowledgeStore — Persistent Agent Memory

Agents don't just run once and forget. Every agent output is stored in SQLite and used to improve future runs.

**How it works:**
- Each time an agent runs against a job, its output is appended as a new "run" (`agent_memory` table)
- If 2+ runs exist for the same job, `synthesize_prior_runs()` calls Gemini at temperature 0.0 to distill them into a consensus output — stored as a new run
- Behavioral fingerprints (IOCs, behaviors, malware type) are indexed for similarity search
- Jaccard similarity >= 0.2 surfaces related past jobs

**Why this matters for the demo:** Run the same sample twice with different temperatures. Ares synthesizes a stronger remediation plan than either individual run produced. The system literally gets smarter with each analysis.

---

## Voice Module (Muse)

`voice/client.py` is complete. ElevenLabs TTS/STT with Gemini fallback for transcription. Voice ID is configurable via `ELEVENLABS_VOICE_ID` env var, defaults to Zeus's voice.

---

## What's Missing

### Critical (blocks demo)

**Gateway — Gabriel**

`gateway/` has three empty files: `bot.py`, `session.py`, `runner.py`. Nothing in them.

This is the only thing between a working system and a working demo. The gateway needs to:
1. Receive Telegram messages (text + file uploads)
2. Forward files/text to Zeus via ADK runner
3. Send the final incident report back as text
4. Optionally: transcribe voice messages (voice/client.py is ready), send voice replies (also ready)

The ADK session pattern is straightforward — Zeus is already wired as the root agent. The gateway just needs to be the entry point that feeds it input and reads its output.

### Important (demo quality)

**Deployment — Sai / Pablo**

`infra/docker-compose.yml` and the Dockerfiles exist but the deployment script (`infra/deploy.sh`) is a skeleton. Someone needs to verify the full stack comes up cleanly on the Vultr server.

Environment variables to confirm on the server:
```
GEMINI_API=...
TELEGRAM_BOT_TOKEN=...
ELEVENLABS_API_KEY=...
SANDBOX_API_URL=http://sandbox:9000
```

Container restart note: if env vars change, use `docker compose up --force-recreate`, not just `docker compose restart`.

---

## Running Locally Right Now

```bash
uv sync
cp .env.example .env  # fill in GEMINI_API, TELEGRAM_BOT_TOKEN, ELEVENLABS_API_KEY
uv run python run.py  # starts Hephaestus on port 9000
```

Test the sandbox directly:
```bash
curl -X POST http://localhost:9000/sandbox/analyze \
  -H "Content-Type: application/json" \
  -d '{"file_content_b64": "<base64>", "filename": "sample.js", "analysis_type": "full"}'
```

Run the test suite:
```bash
uv run pytest  # 53 tests, all passing
uv run mypy .  # strict, zero errors
uv run ruff check .  # zero warnings
```

---

## Deadline Reminder

- **Hacking ends:** Sunday March 29, 11:30 AM — code freeze
- **DevPost closes:** Sunday March 29, 12:30 PM
- **Judging:** Sunday 1:00 PM – 3:30 PM (4 min per team, expo style)

The repo must be public on GitHub before DevPost submission.

---

## Priority Order for Tonight

1. **Gabriel:** Implement `gateway/bot.py` — Telegram bot that routes to Zeus and returns the report
2. **Sai:** Verify voice module end-to-end; confirm ElevenLabs credentials work
3. **Pablo/Sai:** Bring up full stack on Vultr, test with a real sample end-to-end
4. **Everyone:** Run `uv run pytest` before pushing anything

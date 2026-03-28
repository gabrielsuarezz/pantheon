# Pantheon — Coding Agent Prompts

One prompt per team member. Paste the relevant section into your Claude Code session at the start of your work. Each prompt is self-contained.

---

## Pablo — Infra, Docker Sandbox (Hephaestus), Zeus, Athena, Artemis

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: infra, Docker sandbox service (Hephaestus), Zeus orchestrator, Athena triage agent, Artemis sentinel daemon.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules and project overview
    2. docs/superpowers/specs/2026-03-28-pantheon-design.md — full architecture
    3. sandbox/models.py — the API contract you must implement
    4. pyproject.toml — uv package manager and mypy/ruff config

    Your deliverables:

    **sandbox/ — Hephaestus (FastAPI service on port 9000)**
    - `sandbox/main.py` — FastAPI app with three endpoints:
      - POST /sandbox/analyze — accepts AnalyzeRequest, returns AnalyzeResponse
      - GET /sandbox/report/{job_id} — returns ThreatReport
      - GET /sandbox/iocs/{job_id} — returns IOCReport
      - GET /sandbox/health — health check
    - `sandbox/analyzer.py` — orchestrates static + dynamic pipelines
    - `sandbox/static/deobfuscator.py` — decodes _0x-prefix variable names and string arrays (javascript-obfuscator pattern)
    - `sandbox/static/extractor.py` — regex IOC extraction: IPs, domains, Windows APIs, registry keys, file paths, URLs
    - `sandbox/static/gemini_analyst.py` — sends deobfuscated JS chunks to Gemini 2.0 Flash with the prompt: "This is deobfuscated malware JavaScript. Identify: malware type, behavior, affected systems, IOCs, risk level. Be specific and technical."
    - `sandbox/dynamic/manager.py` — Docker SDK container lifecycle:
      - Pull node:18-alpine if not present
      - Run with: --network none, --memory 256m, --cpus 0.25, --read-only, tmpfs at /tmp/work, --security-opt no-new-privileges, --cap-drop ALL
      - Copy malware file + harness.js into container via exec
      - Run: timeout 30 node /tmp/work/harness.js with output capture
      - Parse stdout JSON log of intercepted calls
      - Destroy container after analysis
    - `sandbox/dynamic/harness.js` — Node.js instrumentation harness:
      - Stubs WScript, ActiveXObject, WSH, Shell objects
      - Intercepts and logs all method calls with arguments as JSON
      - Wraps require('fs') write operations
      - Collapses setTimeout/setInterval delays to 0
      - Wraps the sample in a try/catch, captures errors
      - Output: JSON array of {api, method, args, timestamp}
    - `sandbox/dynamic/parser.py` — parses the harness JSON output into behavioral indicators

    **agents/zeus.py** — Root ADK orchestrator using google-adk Agent class
    - Model: gemini-2.0-flash
    - Routes new analysis requests to Athena
    - Compiles the final response for Hermes

    **agents/athena.py** — Triage ADK agent
    - Tools: classify_threat(description), create_incident_ticket(title, severity, category)
    - Classifies severity (critical/high/medium/low) and category
    - Always transfers to Hades after creating ticket

    **agents/artemis.py** — Idle sentinel daemon (not an ADK agent — a Python asyncio loop)
    - Watches /tmp/samples/ for new files using watchdog or asyncio polling
    - When a new file appears, calls the ADK runner to trigger the Zeus pipeline
    - Reports analysis results to the configured Telegram chat ID via the Telegram bot API
    - Stays idle between events

    **infra/**
    - `infra/docker-compose.yml` — four services: sandbox (port 9000), agents (port 8001), gateway (port 8000), nginx (port 80/443)
    - `infra/Dockerfile.sandbox` — Python 3.12 slim + Docker socket mount
    - `infra/Dockerfile.agents` — Python 3.12 slim
    - `infra/Dockerfile.gateway` — Python 3.12 slim
    - `infra/nginx.conf` — reverse proxy, proxies /telegram to gateway:8000
    - Coordinate with Sai on infra/deploy.sh

    Rules:
    - uv is the package manager — never pip install
    - from __future__ import annotations at the top of every Python file
    - All functions fully typed, mypy --strict must pass
    - Pydantic v2 for all models (sandbox/models.py is the contract — implement it exactly)
    - The malware file is NEVER executed outside the Docker container
    - Docker container for dynamic analysis must use ALL the flags above — no shortcuts

---

## Andres — Hades, Apollo, Ares (Analysis + Reporting + Remediation Agents)

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: Hades (malware analysis agent), Apollo (IOC extraction + threat report), Ares (containment + remediation), and all agent tools.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules and project overview
    2. docs/superpowers/specs/2026-03-28-pantheon-design.md — full architecture
    3. sandbox/models.py — the ThreatReport and IOCReport shapes you consume (do not modify)
    4. pyproject.toml — uv package manager and mypy/ruff config

    The sandbox service (Hephaestus) runs at SANDBOX_API_URL from .env (default: http://sandbox:9000).
    You call it via httpx. Pablo owns sandbox/ — do not touch it.

    Your deliverables:

    **agents/tools/sandbox_tools.py**
    - async def submit_sample(file_path: str, job_id: str, analysis_type: AnalysisType = "both") -> AnalyzeResponse
      Calls POST /sandbox/analyze with base64-encoded file content
    - async def get_report(job_id: str) -> ThreatReport
      Calls GET /sandbox/report/{job_id}, polls until status is "complete"
    - async def get_iocs(job_id: str) -> IOCReport
      Calls GET /sandbox/iocs/{job_id}

    **agents/hades.py** — Malware analysis ADK agent (google-adk Agent)
    - Model: gemini-2.0-flash
    - Tools: submit_sample, get_report
    - Submits the sample, waits for analysis, interprets behavioral results in plain language
    - Response to the user: what type of malware, what it does, what systems are at risk
    - Response must be concise — user is on Telegram/phone
    - Transfers to Apollo after analysis

    **agents/apollo.py** — IOC extraction + threat intel ADK agent
    - Model: gemini-2.0-flash
    - Tools: get_iocs, and a Gemini enrichment tool that takes IOCs and returns additional threat context
    - Produces a structured threat report with all IOCs clearly listed
    - Answers: what IPs/domains are malicious, what files were created, what registry keys were touched
    - Transfers to Ares

    **agents/ares.py** — Containment + remediation ADK agent
    - Model: gemini-2.0-flash
    - Tools: generate_containment_plan(report), generate_remediation_plan(report), generate_prevention_plan(report)
    - Containment: immediate steps to stop the threat (block IPs, kill processes, isolate host)
    - Remediation: steps to clean up and restore the system
    - Prevention: hardening recommendations to prevent this specific attack vector in the future
    - Returns final combined response to Zeus

    **agents/tools/triage_tools.py** — used by Athena (coordinate with Pablo)
    **agents/tools/report_tools.py** — IOC enrichment, threat intel lookups
    **agents/tools/remediation_tools.py** — containment/remediation plan generators

    Rules:
    - uv is the package manager — never pip install
    - from __future__ import annotations at top of every Python file
    - All functions fully typed, mypy --strict must pass
    - Pydantic v2 for all models
    - All httpx calls must be async
    - Agent responses must be plain English, maximum 4-5 sentences — user is on a phone
    - Never log or print sensitive IOC data to stdout in production

---

## Gabriel — Hermes (Telegram Gateway)

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: Hermes — the Telegram bot that is the sole user interface for Pantheon.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules and project overview
    2. docs/superpowers/specs/2026-03-28-pantheon-design.md — full architecture, especially Section 4 (agent pipeline flow) and Section 6 (voice)
    3. pyproject.toml — uv package manager and mypy/ruff config

    The voice module (Sai's work) lives at voice/client.py and exposes exactly two async functions:
      - transcribe(audio_bytes: bytes, mime_type: str) -> str
      - speak(text: str, voice_id: str | None) -> bytes  (returns OGG/Opus bytes)

    The ADK runner is initialized with Zeus as root_agent (from agents/zeus.py).

    Your deliverables:

    **gateway/bot.py** — Telegram bot using python-telegram-bot
    - /start — greet user, explain Pantheon's capabilities
    - /reset — clear the user's ADK session
    - /status — report whether an analysis is currently running for this user
    - Text messages -> get_agent_response(user_id, text) -> reply as text
    - Voice messages -> voice.client.transcribe(audio_bytes) -> get_agent_response() -> voice.client.speak() -> send as Telegram voice message
    - File uploads (.malicious, .js, .zip, .exe) — save to /tmp/samples/{user_id}/{filename}, then send "Analyzing {filename}..." and call get_agent_response(user_id, f"analyze the malware sample at /tmp/samples/{user_id}/{filename}")
    - Send a "Pantheon is analyzing..." typing indicator during long-running operations
    - If analysis takes more than 10 seconds, send an intermediate text update: "Analysis in progress — Hades is examining the sample..."

    **gateway/session.py** — ADK session management
    - Maps Telegram user_id (str) -> ADK session_id (str)
    - create_or_get_session(user_id: str) -> str
    - reset_session(user_id: str) -> None
    - Uses InMemorySessionService from google-adk

    **gateway/runner.py** — ADK runner bridge
    - async def get_agent_response(user_id: str, text: str) -> str
      Creates/retrieves session, sends message to Zeus via ADK Runner, collects full response string

    Rules:
    - uv is the package manager — never pip install
    - from __future__ import annotations at top of every Python file
    - All functions fully typed, mypy --strict must pass
    - Pydantic v2 for config
    - Never expose the sandbox API or raw IOC data directly to the user — all interaction goes through the ADK agents
    - Never commit bot tokens or API keys
    - Use python-telegram-bot's async API (ApplicationBuilder, not the sync API)
    - Saved files in /tmp/samples/ must be readable by the sandbox service (shared Docker volume)

---

## Sai — Muse (ElevenLabs Voice) + Vultr Deployment

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: Muse — the ElevenLabs voice module, and deploying the full stack to the Vultr server.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules and project overview
    2. docs/superpowers/specs/2026-03-28-pantheon-design.md — full architecture, especially Section 6 (voice) and Section 7 (infra)
    3. infra/docker-compose.yml — what you are deploying (Pablo will write this)
    4. pyproject.toml — uv package manager and mypy/ruff config

    Your deliverables:

    **voice/client.py** — ElevenLabs TTS + STT wrapper (this is the ENTIRE interface Gabriel calls)

    Public async interface — do not add more public functions than these two:

      async def transcribe(audio_bytes: bytes, mime_type: str = "audio/ogg") -> str
        - Sends audio to ElevenLabs speech-to-text API
        - Falls back to Gemini audio transcription if ElevenLabs STT returns an error
        - Returns clean transcription string
        - Raises TranscriptionError on total failure

      async def speak(text: str, voice_id: str | None = None) -> bytes
        - Sends text to ElevenLabs TTS API
        - Uses ZEUS_VOICE_ID from personas.py if voice_id is None
        - Returns OGG/Opus bytes ready to send as a Telegram voice message
        - Raises SpeechError on failure

    **voice/personas.py** — Voice configuration
      - ZEUS_VOICE_ID: str — an authoritative, deep ElevenLabs voice
        (Browse https://elevenlabs.io/voice-library, pick something that sounds like a command center)
      - Configurable via ELEVENLABS_VOICE_ID env var with ZEUS_VOICE_ID as default

    **voice/exceptions.py** — TranscriptionError and SpeechError (both subclass RuntimeError)

    **Vultr deployment**
    The server is provisioned and ready. Get IP + credentials from Pablo.

    Steps:
    1. SSH in, install Docker Engine + Docker Compose plugin (official Docker apt repo)
    2. Clone the repo to /opt/pantheon
    3. Copy .env to /opt/pantheon/.env
    4. Run: cd /opt/pantheon && docker compose -f infra/docker-compose.yml up -d
    5. Configure Telegram webhook: call https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://{IP}/telegram
    6. Verify all services are healthy: docker compose ps

    Write infra/deploy.sh that automates steps 2-6 (assumes Docker is already installed).

    Rules:
    - uv is the package manager — never pip install
    - from __future__ import annotations at top of every Python file
    - All functions fully typed, mypy --strict must pass
    - All public functions must be async
    - Never log audio bytes or transcription content
    - ELEVENLABS_API_KEY from env only — never hardcoded
    - OGG/Opus output format for Telegram compatibility

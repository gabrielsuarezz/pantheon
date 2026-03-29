# Pantheon — Design Specification

**Project:** Pantheon
**Date:** 2026-03-28
**Hackathon:** HackUSF 2026
**Challenges:** NextEra Energy Malware Analysis + Google Cloud ADK + Best AI Hack
**Deadline:** Sunday March 29, 11:30 AM (hacking ends), 12:30 PM (DevPost closes)

---

## 1. Overview

Pantheon is an AI-driven malware analysis and incident response system. A security analyst submits a malware sample via Telegram (text, voice, or file upload). A pipeline of specialized AI agents — each named after a Greek god — analyzes the sample in a real Docker sandbox, extracts indicators of compromise, and returns a plain-language threat report with containment and remediation steps. All interaction is voice-first via ElevenLabs. Artemis runs as a background sentinel that automatically triggers analysis when new samples appear.

The system targets two sponsor challenges simultaneously:
- **NextEra Energy:** sandboxed analysis, behavioral identification, IOC extraction, remediation plan
- **Google Cloud ADK:** multi-agent system using Google ADK and the A2A protocol, autonomously observing, analyzing, and acting

---

## 2. Team and Domain Ownership

| Member | Domain | Files |
|---|---|---|
| Pablo | Infra, Docker sandbox (Hephaestus), Zeus, Athena, Artemis | `sandbox/`, `agents/zeus.py`, `agents/athena.py`, `agents/artemis.py`, `infra/` |
| Andres | Analysis agents: Hades, Apollo, Ares, all agent tools | `agents/hades.py`, `agents/apollo.py`, `agents/ares.py`, `agents/tools/` |
| Gabriel | Hermes — Telegram gateway, session management | `gateway/` |
| Sai | Muse — ElevenLabs voice module, Vultr deployment | `voice/`, `infra/deploy.sh` |

Domain boundaries are strict. The only shared file is `sandbox/models.py` (treat as read-only after initial agreement).

---

## 3. Greek God / Agent Mapping

| God | Role | Type | Owner |
|---|---|---|---|
| Zeus | Root ADK orchestrator | google-adk Agent | Pablo |
| Hermes | Telegram + ElevenLabs gateway | Bot / ADK Runner host | Gabriel |
| Athena | Triage — threat classification, incident tickets | google-adk Agent | Pablo |
| Hades | Malware analysis — calls sandbox, interprets results | google-adk Agent | Andres |
| Apollo | IOC extraction, Gemini enrichment, threat report | google-adk Agent | Andres |
| Ares | Containment, remediation, future prevention plan | google-adk Agent | Andres |
| Hephaestus | Sandbox FastAPI service + Docker lifecycle engine | FastAPI service | Pablo |
| Artemis | Idle sentinel — file watcher, auto-triggers pipeline | asyncio daemon | Pablo |
| Muse | ElevenLabs TTS/STT voice module | Library module | Sai |

---

## 4. Repository Structure

```
pantheon/
  agents/
    zeus.py
    athena.py
    hades.py
    apollo.py
    ares.py
    artemis.py
    tools/
      __init__.py
      sandbox_tools.py      # HTTP calls to Hephaestus API
      triage_tools.py
      report_tools.py
      remediation_tools.py
  gateway/
    __init__.py
    bot.py                  # Telegram bot, command + message handlers
    session.py              # user_id -> ADK session_id map
    runner.py               # ADK runner bridge
  voice/
    __init__.py
    client.py               # ElevenLabs TTS + STT (transcribe + speak)
    personas.py             # Voice ID constants
    exceptions.py           # TranscriptionError, SpeechError
  sandbox/
    __init__.py
    main.py                 # FastAPI app (Hephaestus)
    analyzer.py             # Orchestrates static + dynamic pipelines
    models.py               # Pydantic models — THE shared API contract
    static/
      __init__.py
      deobfuscator.py       # _0x pattern decode + string array resolution
      extractor.py          # Regex IOC extraction
      gemini_analyst.py     # Sends deobfuscated JS to Gemini
    dynamic/
      __init__.py
      manager.py            # Docker SDK container lifecycle
      harness.js            # JS instrumentation (mocks WScript/ActiveX/Shell)
      parser.py             # Parses harness JSON intercept log
  infra/
    docker-compose.yml
    Dockerfile.agents
    Dockerfile.gateway
    Dockerfile.sandbox
    nginx.conf
    deploy.sh
  .env.example
  .gitignore
  pyproject.toml
  run.py
  pantheon.db         # runtime — SQLite job store (gitignored, created on first run)
```

---

## 5. API Contract — sandbox/models.py

This file is the single source of truth. All teams import from it. Do not duplicate these models.

```python
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

AnalysisType = Literal["static", "dynamic", "both"]
RiskLevel = Literal["low", "medium", "high", "critical"]
JobStatus = Literal["queued", "running", "complete", "failed"]

class NetworkIOCs(BaseModel):
    ips: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    ports: list[int] = Field(default_factory=list)
    protocols: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)

class FileIOCs(BaseModel):
    sha256: str = ""
    md5: str = ""
    paths: list[str] = Field(default_factory=list)

class AnalyzeRequest(BaseModel):
    job_id: str
    file_content_b64: str       # base64-encoded sample bytes
    filename: str
    analysis_type: AnalysisType = "both"

class AnalyzeResponse(BaseModel):
    job_id: str
    status: JobStatus

class ThreatReport(BaseModel):
    job_id: str
    status: JobStatus
    malware_type: str           # e.g. "WSH dropper", "ransomware loader"
    obfuscation_technique: str  # e.g. "javascript-obfuscator _0x"
    behavior: list[str]
    network_iocs: NetworkIOCs
    file_iocs: FileIOCs
    registry_iocs: list[str] = Field(default_factory=list)
    risk_level: RiskLevel
    affected_systems: list[str]
    gemini_summary: str
    remediation_hints: list[str] = Field(default_factory=list)

class IOCReport(BaseModel):
    ips: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    file_hashes: dict[str, str] = Field(default_factory=dict)
    file_paths: list[str] = Field(default_factory=list)
    ports: list[int] = Field(default_factory=list)
    registry_keys: list[str] = Field(default_factory=list)
    cve_ids: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)
```

### REST Endpoints

| Method | Path | Request | Response |
|---|---|---|---|
| POST | /sandbox/analyze | AnalyzeRequest | AnalyzeResponse |
| GET | /sandbox/report/{job_id} | — | ThreatReport |
| GET | /sandbox/iocs/{job_id} | — | IOCReport |
| GET | /sandbox/health | — | `{"status": "ok", "docker_available": bool}` |

---

## 6. Agent Pipeline Flow

```
User (Telegram)
  |-- text message
  |-- voice message --> Muse.transcribe() --> text
  |-- file upload --> saved to /tmp/samples/{user_id}/

Hermes (Gabriel)
  - receives Telegram update
  - transcribes voice if needed
  - calls get_agent_response(user_id, text)

ADK Runner --> Zeus
  |
  +--> Athena
  |     classify_threat() -- severity + category
  |     create_incident_ticket()
  |     transfer --> Hades
  |
  +--> Hades
  |     submit_sample() --> POST /sandbox/analyze
  |     poll get_report() --> GET /sandbox/report/{job_id}
  |     interpret results in plain language
  |     transfer --> Apollo
  |
  +--> Apollo
  |     get_iocs() --> GET /sandbox/iocs/{job_id}
  |     enrich_threat_intel() --> Gemini
  |     generate structured report
  |     transfer --> Ares
  |
  +--> Ares
        generate_containment_plan()
        generate_remediation_plan()
        generate_prevention_plan()
        return --> Zeus

Zeus compiles final response --> Hermes
Hermes --> Muse.speak() --> OGG bytes --> Telegram voice message


Artemis (background daemon, independent of above)
  - watchdog on /tmp/samples/
  - new file detected --> calls ADK runner directly --> Telegram notification
```

---

## 7. Hephaestus Sandbox Internals

### Static Analysis Pipeline

1. Compute MD5 and SHA256 hash of the file
2. Extract all printable strings (minimum length 6)
3. Pattern-match against:
   - Windows APIs: `WScript`, `ActiveXObject`, `WSH`, `Shell`, `CreateObject`, `WMI`
   - Network: `XMLHttpRequest`, `XMLHTTP`, `WinHttp`, URLs matching `https?://`, IP address regex
   - File system: `Scripting.FileSystemObject`, `ADODB.Stream`, `\.exe`, `\.dll`, `\.bat`, `\.vbs`
   - Registry: `HKEY_`, `RegWrite`, `RegRead`, `RegDelete`
   - Execution: `eval(`, `Function(`, `unescape(`, `fromCharCode`, `setTimeout`, `WScript.Run`
   - Encoding: base64 patterns, hex strings
4. Decode `_0x`-obfuscated JS:
   - Locate the string array (large array assigned near top of file)
   - Resolve the rotation/shift value
   - Build string lookup table
   - Replace all `_0x????()` calls with their resolved string values
   - Output: partially deobfuscated source
5. Send 4000-token chunks of deobfuscated source to Gemini 2.5 Flash:
   - Prompt: "This is deobfuscated malware JavaScript. Identify the malware type, its behavior, what systems or data are at risk, and all IOCs (IPs, domains, file paths, registry keys). Be specific and technical. Format as JSON."
6. Parse Gemini output into ThreatReport fields

### Job Persistence

Analysis results are stored in a SQLite database (`pantheon.db`) using WAL mode. This means:
- Results survive a Hephaestus service restart — judges can see prior analysis
- `INSERT OR REPLACE` makes re-submitting the same sample idempotent (same filename + content hash = same `job_id`)
- `ThreatReport` and `IOCReport` are stored as Pydantic JSON (`model_dump_json`)
- Tests use `:memory:` databases — no disk I/O or cleanup required

Schema:
```sql
CREATE TABLE jobs (
    job_id      TEXT PRIMARY KEY,
    report_json TEXT NOT NULL,
    ioc_json    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
)
```

### Dynamic Analysis Pipeline (Docker)

Container configuration (no exceptions):

```
image: node:18-alpine
flags:
  --network none
  --memory 256m
  --cpus 0.25
  --read-only
  --tmpfs /tmp/work:size=64m
  --security-opt no-new-privileges
  --cap-drop ALL
timeout: 30 seconds
```

Execution sequence:
1. Create container with above flags
2. Write malware file to container at `/tmp/work/sample.js`
3. Write `harness.js` to container at `/tmp/work/harness.js`
4. Execute: `node /tmp/work/harness.js /tmp/work/sample.js`
5. Capture stdout (JSON intercept log)
6. Force-remove container regardless of exit code
7. Parse JSON log into behavioral indicators

`harness.js` responsibilities:
- Stub `WScript`, `ActiveXObject`, `Shell`, `WSH` as logging proxies
- Intercept `require('child_process')`, `require('net')`, `require('http')`
- Mock `require('fs').writeFile`, `writeFileSync`, `appendFile`
- Set all `setTimeout`/`setInterval` delays to 0
- `require()` the sample in a try/catch
- Output: `JSON.stringify(interceptLog)` where each entry is `{api, method, args, timestamp}`

---

## 8. Voice Module (Muse)

Interface (two async functions — this is the complete public API):

```python
async def transcribe(audio_bytes: bytes, mime_type: str = "audio/ogg") -> str: ...
async def speak(text: str, voice_id: str | None = None) -> bytes: ...
```

- `transcribe`: ElevenLabs STT first, falls back to Gemini audio if unavailable
- `speak`: ElevenLabs TTS, returns OGG/Opus bytes (Telegram voice message format)
- Voice persona: single authoritative voice ID (ZEUS_VOICE_ID in personas.py, overridable via env)

---

## 9. Infra / Deployment

```yaml
# docker-compose.yml (abbreviated)
services:
  sandbox:
    build: { context: ., dockerfile: infra/Dockerfile.sandbox }
    ports: ["9000:9000"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # for spawning analysis containers
      - samples:/tmp/samples
    networks: [internal]

  agents:
    build: { context: ., dockerfile: infra/Dockerfile.agents }
    ports: ["8001:8001"]
    depends_on: [sandbox]
    networks: [internal]

  gateway:
    build: { context: ., dockerfile: infra/Dockerfile.gateway }
    ports: ["8000:8000"]
    depends_on: [agents]
    volumes:
      - samples:/tmp/samples  # shared with sandbox for file uploads
    networks: [internal, public]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    depends_on: [gateway]
    networks: [public]

volumes:
  samples:

networks:
  internal:
  public:
```

Vultr deployment:
1. Server is already provisioned
2. Install Docker Engine + Compose plugin
3. Clone repo to /opt/pantheon
4. Set up .env
5. `docker compose up -d`
6. Set Telegram webhook: `https://{server_ip}/telegram`

---

## 10. Typing and Code Quality

- Python 3.12+, `from __future__ import annotations` in every file
- All function parameters and return types annotated
- No `Any` without an explanatory comment
- `mypy --strict` passes with zero errors
- `ruff check .` passes with zero errors
- `uv` is the only package manager (`uv sync`, `uv add`, `uv run`)

---

## 11. Key Constraints

- The malware file (`6108674530.JS.malicious`) is NEVER executed outside the Docker sandbox container
- Docker container for dynamic analysis uses ALL security flags in Section 7 — no exceptions
- The sandbox service is never exposed to the public internet — internal Docker network only
- All inter-service communication uses the models defined in `sandbox/models.py`
- No hardcoded credentials anywhere — all secrets in `.env`

---

## 12. Judging Criteria Alignment

| Criterion | How Pantheon addresses it |
|---|---|
| NextEra: What type of malware? | Hades + Gemini classify type and family (WSH dropper, etc.) |
| NextEra: How does it behave? | Dynamic harness intercept log + static deobfuscation |
| NextEra: What systems are at risk? | Apollo extracts affected_systems from ThreatReport |
| NextEra: Recommended next steps | Ares generates containment, remediation, and prevention plans |
| Google ADK: Multi-agent system | Zeus + 5 specialist gods via google-adk Agent + A2A transfers |
| Google ADK: Autonomously acts | Artemis triggers pipeline without human intervention |
| Best AI Hack: Best use of AI | Gemini for deobfuscation analysis, ElevenLabs for voice, full agentic pipeline |

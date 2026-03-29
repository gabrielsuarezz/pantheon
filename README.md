# Pantheon

The AI incident-response team you wish was awake at 2AM.

Pantheon is an AI-driven malware analysis and incident response platform built for HackUSF 2026. Submit a sample through Telegram or voice, and a coordinated team of specialized agents will triage, detonate, extract IOCs, assess impact, and produce an actionable response plan. While it runs, every handoff and tool execution streams live to a real-time dashboard and Kafka for durable event replay.

Pantheon is designed for demo pressure and production-minded constraints:
- Real multi-agent orchestration with Google ADK
- Event-driven observability (WebSocket + structured telemetry + Kafka event streaming)
- Isolated malware detonation in hardened Docker and Windows VPS tooling
- Voice-first and chat-first operator experience through Hermes + Muse
- Actionable outputs: containment, remediation, prevention, and detection content

Built for speed, clarity, and trust under incident conditions.

---

## Why This Project Stands Out

- Parallel specialist architecture, not a monolithic chatbot. Zeus coordinates Athena, Hades, Apollo, and Ares as distinct experts with clear boundaries.
- Full-spectrum malware analysis. Static deobfuscation, dynamic instrumentation, behavioral interpretation, IOC extraction, and response planning live in one flow.
- Explainable in real time. The dashboard shows agent activations, tool calls, handoffs, process/network telemetry, and stage progression as events happen.
- Voice + messaging native. Operators can engage through Telegram text, file upload, voice notes, or voice call.
- Safety by default. Malware detonation is constrained to sanctioned isolated environments only.

---

## How It Works

A user submits a sample (file upload, text, or voice message) through Telegram — or places a voice call directly to Zeus via the Telegram Mini App. Hermes routes the request into a Google ADK multi-agent pipeline. Each agent is named after a Greek god and owns a specific phase of the analysis. Every agent action is streamed via WebSocket to a live dashboard that shows the swarm working.

| Agent        | God        | Responsibility                                                              |
| ------------ | ---------- | --------------------------------------------------------------------------- |
| Orchestrator | Zeus       | Routes requests, compiles final response, handles voice calls               |
| Gateway      | Hermes     | Telegram bot + ElevenLabs voice I/O + Mini App voice call interface         |
| Triage       | Athena     | Classifies threat severity, opens incident ticket                           |
| Analysis     | Hades      | Docker sandbox + Windows VPS detonation, Procmon/Wireshark/FakeNet tools    |
| Intelligence | Apollo     | Extracts IOCs, enriches with Gemini threat intel, synthesizes prior runs    |
| Response     | Ares       | Generates containment, remediation, and prevention plan with YARA/Sigma     |
| Sandbox      | Hephaestus | FastAPI service, Docker container lifecycle, EventBus, WebSocket stream + Kafka mirror |
| Sentinel     | Artemis    | Background daemon — auto-triggers pipeline on new samples                   |
| Voice        | Muse       | ElevenLabs Conversational AI — STT, TTS, and live voice call tools          |
| Impact       | —          | Remote A2A specialist — critical infrastructure continuity assessment       |

All voice interaction is handled by the Muse module via ElevenLabs. Agent memory and behavioral similarity detection are handled by the KnowledgeStore layer in Hephaestus.

---

## Demo Flow (Judge-Friendly)

1. Upload suspicious sample in Telegram or start a /call voice session.
2. Hermes routes request to Zeus.
3. Athena triages severity and opens incident context.
4. Hades executes analysis via Hephaestus sandbox and VPS monitoring tools.
5. Apollo enriches IOCs and synthesizes threat intelligence.
6. Ares generates containment, remediation, and prevention plans.
7. Zeus returns a concise operator briefing, while the dashboard shows full traceability.

---

## Architecture

```mermaid
flowchart TB
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 0 — USER INTERFACE
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph UI["🌐 User Interface Layer"]
        direction LR
        TG["📱 Telegram Client"]
        VC["🎙️ Voice Call — Mini App"]
        DASH["📊 Next.js Dashboard"]
        TG -- "file upload / text / voice" --> HERMES
        VC -- "ElevenLabs WebSocket" --> MUSE
        DASH -- "ws://sandbox:9000/ws" --> WS_STREAM
    end

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 1 — GATEWAY + VOICE
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph GW["⚡ Hermes — Telegram Gateway + Voice I/O"]
        direction TB
        HERMES["🏛️ Hermes Bot\n— python-telegram-bot —\ntext · voice · file routing"]
        MUSE["🎵 Muse Voice Module\n— ElevenLabs Conversational AI —\nSTT → LLM → TTS"]
        SESSION["🔐 Session Manager\nuser_id → ADK session_id"]
        HERMES --> SESSION
        MUSE --> SESSION
    end

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 2 — ORCHESTRATION
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph ORCH["⚜️ Zeus — Root Orchestrator"]
        direction TB
        ZEUS["🏛️ Zeus Agent\n— Google ADK LlmAgent —\nGemini 2.5 Flash\nroutes · compiles · delegates"]
        RUNNER["🔄 ADK Runner\nInMemorySessionService\nstate_delta propagation"]
        SWARM["🐝 SwarmManager\njob queue · status FSM\nqueued → running → done"]
        ZEUS --> RUNNER
        RUNNER --> SWARM
    end

    SESSION -- "ADK session handoff" --> ZEUS

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 3 — ANALYSIS PIPELINE (A2A TRANSFERS)
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph PIPELINE["🔱 Agent Analysis Pipeline — A2A Protocol"]
        direction LR

        subgraph TRIAGE["Phase 1 — Triage"]
            ATHENA["🦉 Athena\nseverity classification\nincident ticket creation\nrouting decision"]
        end

        subgraph DYNAMIC["Phase 2 — Deep Analysis"]
            HADES["💀 Hades\nDocker sandbox detonation\nWindows VPS Procmon capture\nFakeNet-NG · Wireshark\nbehavioral fingerprinting"]
        end

        subgraph INTEL["Phase 3 — Intelligence"]
            APOLLO["☀️ Apollo\nIOC extraction & enrichment\nGemini threat intel correlation\nprior-run synthesis\nformatted ThreatReport"]
        end

        subgraph RESPONSE["Phase 4 — Response"]
            ARES_C["🗡️ Ares::Containment\nnetwork isolation\nprocess termination\nfirewall rules"]
            ARES_R["🛡️ Ares::Remediation\nfile cleanup\nregistry repair\ncredential rotation"]
            ARES_P["🏰 Ares::Prevention\nYARA rules\nSigma detection\nGPO hardening\nEDR tuning"]
            ARES_A["📋 Ares::Assembler\nfull incident report\nmarkdown compilation"]
        end

        ATHENA -- "A2A transfer\nINC ticket + severity" --> HADES
        HADES -- "A2A transfer\nThreatReport + IOCs" --> APOLLO
        APOLLO -- "A2A transfer\nenriched report + intel" --> ARES_C & ARES_R & ARES_P
        ARES_C & ARES_R & ARES_P -- "parallel merge" --> ARES_A
    end

    ZEUS -- "sub_agent dispatch" --> ATHENA
    ARES_A -- "final report" --> ZEUS

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 4 — SANDBOX & DETONATION INFRASTRUCTURE
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph SANDBOX["🔥 Hephaestus — Sandbox Service"]
        direction TB
        FASTAPI["⚙️ FastAPI Server\nPOST /sandbox/analyze\nGET /sandbox/report/:id\nGET /sandbox/iocs/:id"]
        ANALYZER["🔬 Analyzer Engine\nstatic analysis pipeline\ndynamic harness execution\njob lifecycle management"]
        KNOWLEDGE["🧠 KnowledgeStore\nSQLite WAL mode\nagent memory persistence\nbehavioral fingerprints\ncross-run similarity search"]
        EVENTBUS["📡 EventBus\nasyncio pub/sub\nWebSocket broadcast\nPantheonEvent serialization"]
        WS_STREAM["🔌 /ws Endpoint\nreal-time event stream\nauto-reconnect clients"]
        EVENTS_IN["📥 POST /events\nagent → EventBus ingest\nfire-and-forget delivery"]
        STREAM_MIRROR["🪞 Stream Replicator\nKafka producer\nfire-and-forget mirror"]
        KAFKA_TOPIC["🧵 Kafka Topic\npantheon.events\ndurable replay log"]

        FASTAPI --> ANALYZER
        ANALYZER --> KNOWLEDGE
        EVENTS_IN --> EVENTBUS
        EVENTBUS --> WS_STREAM
        EVENTBUS -. "mirror" .-> STREAM_MIRROR
        STREAM_MIRROR --> KAFKA_TOPIC
    end

    subgraph DOCKER_ENV["🐋 Docker Isolation — Detonation Chamber"]
        direction TB
        CONTAINER["📦 Analysis Container\n--network none\n--memory 256m\n--read-only\n--no-new-privileges\n--cap-drop ALL"]
        HARNESS["🔧 Node.js Harness\nWScript.Shell mock\nActiveXObject intercept\nXMLHTTP capture\neval/exec logging"]
        STATIC_A["📝 Static Analysis\nstring extraction\nAST deobfuscation\nentropy scanning"]
        DYNAMIC_A["💣 Dynamic Analysis\nprocess tree capture\nregistry modification log\nfile system diff\nnetwork call intercept"]

        CONTAINER --> HARNESS
        HARNESS --> STATIC_A & DYNAMIC_A
    end

    subgraph VPS["🖥️ Windows VPS — Live Detonation"]
        direction TB
        PROCMON["📊 Procmon\nprocess creation\nfile I/O\nregistry mutations\nthread injection"]
        FAKENET["🌐 FakeNet-NG\nDNS interception\nHTTP/HTTPS capture\nC2 beacon detection\nprotocol simulation"]
        WIRESHARK["🦈 Wireshark\nfull packet capture\nTLS fingerprinting\nJA3/JA3S hashing\nbeacon interval analysis"]
        SNAP["📸 VM Snapshot\npre-detonation state\nauto-restore on complete\nisolated VLAN"]

        PROCMON --> SNAP
        FAKENET --> SNAP
        WIRESHARK --> SNAP
    end

    HADES -- "submit_sample()" --> FASTAPI
    HADES -- "SSH/SFTP\nparamiko" --> PROCMON & FAKENET & WIRESHARK
    ANALYZER -- "Docker SDK\ncontainer.run()" --> CONTAINER

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 5 — EVENT SYSTEM (TELEMETRY BACKBONE)
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph EVENTS["📡 Real-Time Event System — PantheonEvent Protocol"]
        direction LR
        EVT_TYPES["Event Types:\n• AGENT_ACTIVATED\n• AGENT_COMPLETED\n• TOOL_CALLED\n• TOOL_RESULT\n• HANDOFF\n• IOC_DISCOVERED\n• STAGE_UNLOCKED\n• PROCESS_EVENT\n• NETWORK_EVENT\n• AGENT_COMMAND"]
        EVT_EMIT["emit_event()\nfire-and-forget\nhttpx POST /events\nnon-blocking async"]
        EVT_FLOW["Agent → POST /events\n→ EventBus.publish()\n→ asyncio.Queue per client\n→ WebSocket broadcast\n→ Dashboard EventStore"]
        EVT_KAFKA["Kafka fork:\nEventBus → Stream Replicator\n→ Kafka topic pantheon.events\n→ replay / downstream SIEM"]

        EVT_TYPES --- EVT_EMIT
        EVT_EMIT --- EVT_FLOW
        EVT_FLOW --> EVT_KAFKA
    end

    ATHENA & HADES & APOLLO & ARES_A -. "emit_event()" .-> EVENTS_IN

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 6 — DASHBOARD FRONTEND
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph FRONTEND["📊 Live Dashboard — React + React Flow"]
        direction TB
        WS_CLIENT["🔌 pantheon-ws.ts\nWebSocket client\nauto-reconnect\nevent deserialization"]
        STORE["🗄️ EventStore\nZustand-style state\nagent status tracking\nevent feed buffer\nIOC accumulator"]
        GRAPH["🕸️ OlympusFlow\nReact Flow canvas\n8 agent nodes\npulse on active\nedge animation on handoff"]
        CHRONICLE["📜 DivineChronicle\nevent feed — auto-scroll\ncolor-coded by severity\nexpandable tool calls"]
        CHAIN["⛓️ AttackChain\nhorizontal stage cards\nfade-in on STAGE_UNLOCKED\nreal-time progression"]
        INSPECTOR["🔍 AgentInspector\nper-agent telemetry\ntool call history\nlatency metrics"]
        TRACE["🎬 TraceViewer\nplayback timeline\nParallelAgent visualization\nLoopAgent iteration render"]

        WS_CLIENT --> STORE
        STORE --> GRAPH & CHRONICLE & CHAIN & INSPECTOR & TRACE
    end

    WS_STREAM -- "PantheonEvent JSON stream" --> WS_CLIENT

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% LAYER 7 — INFRASTRUCTURE
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    subgraph INFRA["🏗️ Deployment Infrastructure"]
        direction LR
        VULTR["☁️ Vultr VPS\nUbuntu 22.04\n155.138.218.106"]
        NGINX["🔀 nginx reverse proxy\n:80 → routing\n/ws → sandbox:9000\n/dashboard → frontend:3000\n/sandbox/* → sandbox:9000"]
        COMPOSE["🐳 Docker Compose\n3 services\nsingle bridge network\nvolume persistence"]
        SENTINEL["👁️ Artemis Daemon\nwatchdog file scanner\n/tmp/samples monitor\nauto-pipeline trigger"]

        VULTR --> NGINX
        NGINX --> COMPOSE
        COMPOSE --> SENTINEL
    end

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% CROSS-LAYER CONNECTIONS
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SENTINEL -. "new sample detected" .-> SWARM
    SWARM -. "job dispatch" .-> ZEUS
    ZEUS -- "voice briefing" --> MUSE
    MUSE -- "TTS response" --> TG

    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    %% STYLING
    %% ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    classDef god fill:#1a1a2e,stroke:#c9a227,stroke-width:2px,color:#e8d5a3,font-weight:bold
    classDef tool fill:#16213e,stroke:#537ec5,stroke-width:1px,color:#c5cae9
    classDef infra fill:#0f3460,stroke:#e94560,stroke-width:1px,color:#f5f5f5
    classDef event fill:#2d132c,stroke:#ee4540,stroke-width:2px,color:#f5c7c7
    classDef ui fill:#1b262c,stroke:#bbe1fa,stroke-width:1px,color:#bbe1fa
    classDef danger fill:#3d0000,stroke:#ff0000,stroke-width:3px,color:#ff6b6b

    class ZEUS,HERMES,ATHENA,HADES,APOLLO,ARES_C,ARES_R,ARES_P,ARES_A god
    class HARNESS,STATIC_A,DYNAMIC_A,PROCMON,FAKENET,WIRESHARK tool
    class VULTR,NGINX,COMPOSE,SENTINEL,FASTAPI,ANALYZER,KNOWLEDGE infra
    class EVENTBUS,WS_STREAM,EVENTS_IN,STREAM_MIRROR,KAFKA_TOPIC,EVT_TYPES,EVT_EMIT,EVT_FLOW,EVT_KAFKA event
    class TG,VC,DASH,WS_CLIENT,STORE,GRAPH,CHRONICLE,CHAIN,INSPECTOR,TRACE ui
    class CONTAINER danger
```

---

## Safety

**The malware sample (6108674530.JS.malicious) must never be executed directly on any machine.**

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

A Node.js instrumentation harness mocks dangerous APIs (WScript, ActiveXObject, Shell) and records intent without allowing unrestricted execution.

For full safety policy and sanctioned execution paths, see CLAUDE.md.

---

## Tech Stack

- Python 3.12+, [uv](https://docs.astral.sh/uv/) package manager
- [Google ADK](https://google.github.io/adk-docs/) — multi-agent orchestration
- Gemini 2.5 Flash — LLM inference, deobfuscation analysis, memory synthesis
- [python-telegram-bot](https://python-telegram-bot.org/) — Telegram interface
- [ElevenLabs](https://elevenlabs.io/) — TTS, STT, and Conversational AI (voice calls)
- FastAPI + uvicorn — Hephaestus sandbox service + WebSocket event stream
- aiokafka — Kafka mirror for PantheonEvent durability/replay
- Docker SDK for Python — container lifecycle
- SQLite (stdlib, WAL mode) — job persistence + KnowledgeStore agent memory
- Pydantic v2 — all data models, strict typing throughout
- Next.js + Tailwind CSS — live dashboard (React Flow for agent graph)
- paramiko — SSH/SFTP to Windows VPS for Procmon/Wireshark/FakeNet-NG tools

---

## Quick Start (Local)

```bash
# 1) Install uv (if needed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2) Install dependencies
uv sync

# 3) Configure environment
cp .env.example .env

# 4) Run Pantheon services
uv run python run.py
```

What this starts (depending on env vars present):
- Hermes Telegram bot
- Voice Mini App service (FastAPI)
- Hephaestus sandbox API on port 9000

---

## Frontend Dashboard (Local)

```bash
cd frontend
npm install
npm run dev
```

Then open: http://localhost:3000/dashboard

Dashboard WebSocket/API target is controlled by NEXT_PUBLIC_SANDBOX_URL.

---

## Production Deploy (Docker Compose)

Deploy the full stack (sandbox + frontend + nginx):

```bash
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps

# Start with Kafka stream services
PANTHEON_STREAM_BACKEND=kafka docker compose -f infra/docker-compose.yml --profile kafka up -d
```

Default routes:
- / -> frontend landing
- /dashboard -> live dashboard
- /ws -> WebSocket event stream
- /events -> event ingest endpoint
- /sandbox/* -> sandbox API

---

## Environment Variables

See .env.example for baseline values. Key variables used by the current runtime:

| Variable                  | Description                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| `GOOGLE_API_KEY`          | Gemini API key                                                          |
| `GEMINI_API`              | Alias used by agent tools (same value as GOOGLE_API_KEY)                |
| `TELEGRAM_BOT_TOKEN`      | Telegram bot token                                                      |
| `ELEVENLABS_API_KEY`      | ElevenLabs API key                                                      |
| `ELEVENLABS_AGENT_ID`     | ElevenLabs Conversational AI agent ID (for voice calls)                 |
| `WEBAPP_BASE_URL`         | Public base URL used for Telegram Mini App + webhook routing            |
| `SANDBOX_API_URL`         | Internal URL of the Hephaestus service (default: `http://sandbox:9000`) |
| `NEXT_PUBLIC_SANDBOX_URL` | Frontend dashboard sandbox URL (set in frontend/.env.local)             |
| `PANTHEON_STREAM_BACKEND` | Event stream backend (`kafka` for full architecture lane)                 |
| `PANTHEON_KAFKA_BOOTSTRAP_SERVERS` | Kafka bootstrap servers for stream mirror (for example `kafka:9092`) |
| `PANTHEON_KAFKA_TOPIC`    | Kafka topic for mirrored `PantheonEvent` records                         |
| `PANTHEON_KAFKA_CLIENT_ID`| Kafka producer client id for Hephaestus                                  |
| `WINDOWS_VPS_IP`          | IP of the Windows VPS for live detonation (if enabled)                  |
| `WINDOWS_VPS_USER`        | Windows VPS username (if enabled)                                       |
| `WINDOWS_VPS_PASSWORD`    | Windows VPS password (if enabled)                                       |

Note: some older scripts/templates may still reference SANDBOX_URL. Current agent + gateway runtime expects SANDBOX_API_URL.

---

## Quality Bar

```bash
uv run mypy .
uv run ruff check .
uv run pytest
```

Pantheon is developed in strict typing mode (mypy strict + Ruff linting).

---

## Key Documentation

- Safety rules and team boundaries: CLAUDE.md
- Original architecture: docs/superpowers/specs/2026-03-28-pantheon-design.md
- Dashboard + event protocol spec: docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md
- Judge demo script: docs/demo-judge-walkthrough.md
- Malware findings write-up: docs/malware-analysis-6108674530.md
- API contract: sandbox/models.py
- Team implementation prompts: AGENTS.md
- Cloud Run ADK apps: adk_apps/

---

## Google ADK Demo

Pantheon exposes a live ADK Dev UI and a remote A2A specialist on Google Cloud Run.

| Surface | URL |
| ------- | --- |
| ADK Dev UI (open for judges) | https://pantheon-agents-63prhgdheq-uc.a.run.app/dev-ui/ |
| Pantheon agent API | https://pantheon-agents-63prhgdheq-uc.a.run.app |
| Remote A2A impact specialist | https://impact-agent-63prhgdheq-uc.a.run.app |

What judges see in ADK Dev UI:
- The full Pantheon agent tree (Zeus → Athena → Hades → Apollo → Ares)
- Three Ares planning branches executing in parallel (ares_planning_parallel)
- A verifier/reviser self-correction loop (ares_refinement_loop, max 2 iterations)
- An outbound A2A handshake from Apollo to the remote impact-agent Cloud Run service
- The impact analysis folded back into the final incident response document

Deploy to Cloud Run:

```bash
export GCP_PROJECT_ID=your-project-id   # or set in .env
./infra/cloud-deploy.sh
```

The script enables required APIs, builds and pushes the Docker image to Artifact Registry, deploys both services, and wires the A2A URL automatically. Public URLs are printed at the end.

See docs/demo-judge-walkthrough.md for the 4-minute walkthrough.

---

## Team

![UCF](https://img.shields.io/badge/UCF-Knights-000000?style=flat-square&labelColor=FFC904) Pablo Molina  
![UCF](https://img.shields.io/badge/UCF-Knights-000000?style=flat-square&labelColor=FFC904) Saicharan Ramineni  
![FIU](https://img.shields.io/badge/FIU-Panthers-081E3F?style=flat-square&labelColor=B6862C) Gabriel Suarez  
![USF](https://img.shields.io/badge/USF-Bulls-006747?style=flat-square&labelColor=CFC493) Andres Dominguez

---

Pantheon turns malware chaos into coordinated, visible, and actionable response. This is incident response as a live multi-agent system, not a static post-mortem.

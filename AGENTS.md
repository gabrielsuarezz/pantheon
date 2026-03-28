# Pantheon — Coding Agent Prompts

One prompt per team member. Paste the relevant section into your Claude Code session at the start of your work. Each prompt is self-contained.

---

## Pablo — Sandbox (Hephaestus), EventBus, Windows VPS Tools, Zeus, Athena, Artemis

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: Hephaestus sandbox service, WebSocket EventBus, Windows VPS monitoring tools,
    Zeus orchestrator, Athena triage agent, Artemis sentinel daemon, infra.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules, project overview, event system overview
    2. docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md — the new dashboard + event system design
    3. docs/superpowers/specs/2026-03-28-pantheon-design.md — original architecture
    4. sandbox/models.py — the API contract
    5. pyproject.toml — uv package manager and mypy/ruff config

    Your new deliverables (Phase 2):

    **sandbox/events.py** — EventBus + PantheonEvent
    - EventBus class: asyncio pub/sub, holds set of active WebSocket connections
      - publish(event: PantheonEvent) -> None — broadcasts to all subscribers
      - subscribe(websocket: WebSocket) -> None — blocks, streams events until disconnect
    - PantheonEvent, EventType, AgentName, ProcessEvent, NetworkEvent, AttackStage models
    - See design doc Section 4 for full schema

    **sandbox/main.py additions**
    - GET /ws — WebSocket endpoint, calls EventBus.subscribe()
    - POST /events — accepts PantheonEvent, calls EventBus.publish()
    - Single EventBus instance shared across the app (module-level singleton)

    **agents/tools/event_tools.py** — emit_event() helper
    - async def emit_event(event: PantheonEvent) -> None
      Posts to POST /events on the sandbox service
      Fire-and-forget (do not block agent execution on event delivery failure)

    **agents/tools/vps_tools.py** — Windows VPS monitoring tools (ADK tools for Hades)
    - async def detonate_sample(sample_path: str) -> DetonationResult
      SSH to Windows VPS, start Procmon + FakeNet captures, run wscript.exe, collect results
    - async def run_procmon_capture(duration_seconds: int) -> list[ProcessEvent]
    - async def run_fakenet_capture(duration_seconds: int) -> list[NetworkEvent]
    - async def run_wireshark_capture(duration_seconds: int) -> list[NetworkEvent]
    - Uses paramiko for SSH/SFTP
    - Each tool emits appropriate PROCESS_EVENT / NETWORK_EVENT to the EventBus after running
    - See CLAUDE.md Section: Windows VPS for safety requirements

    Rules:
    - uv is the package manager — never pip install
    - from __future__ import annotations at the top of every Python file
    - All functions fully typed, mypy --strict must pass
    - Pydantic v2 for all models (sandbox/models.py is the contract)
    - The malware file is NEVER executed outside the Docker container or the Windows VPS
    - All VPS detonation must follow the safety checklist in CLAUDE.md before executing

---

## Andres — Hades, Apollo, Ares + Event Emission

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: Hades (malware analysis agent), Apollo (IOC extraction + threat report),
    Ares (containment + remediation), all agent tools, and wiring event emission into every
    tool call and agent handoff.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules, project overview, event system overview
    2. docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md — the new event system design
    3. docs/superpowers/specs/2026-03-28-pantheon-design.md — original architecture
    3. sandbox/models.py — the ThreatReport and IOCReport shapes you consume (do not modify)
    4. pyproject.toml — uv package manager and mypy/ruff config

    Your new deliverables (Phase 2):

    **Event emission — all agent tools**
    Every tool call in agents/tools/ must wrap its logic with:
      - emit_event(TOOL_CALLED, agent=<name>, tool=<name>, payload={inputs}) before execution
      - emit_event(TOOL_RESULT, agent=<name>, tool=<name>, payload={output_summary}) after
    Every agent entry point emits AGENT_ACTIVATED.
    Every agent exit emits AGENT_COMPLETED.
    Every transfer_to_agent call emits HANDOFF with {from: <agent>, to: <agent>}.
    Use emit_event() from agents/tools/event_tools.py (Pablo's file — do not modify it).

    **Hades — Windows VPS integration**
    After sandbox analysis completes, Hades calls detonate_sample() from vps_tools.py.
    For each ProcessEvent and NetworkEvent returned, Hades emits STAGE_UNLOCKED events
    where appropriate — e.g. confirming persistence stage, network stage, execution stage.
    The AttackStage payload must have: stage_id, label, description, icon.
    Do not hardcode stages — derive them from the actual monitoring tool output.

    **KnowledgeStore tools** — already implemented, keep using them:
    - store_agent_output, load_prior_runs, synthesize_prior_runs, find_similar_jobs,
      store_behavioral_fingerprint

    Existing deliverables (already done, do not break):
    - agents/tools/sandbox_tools.py — submit_sample, poll_report, get_report, get_iocs
    - agents/tools/report_tools.py — format_threat_report, enrich_iocs_with_threat_intel
    - agents/tools/remediation_tools.py — containment/remediation/prevention plan generators
    - agents/hades.py, agents/apollo.py, agents/ares.py — full agent implementations

    Rules:
    - uv is the package manager — never pip install
    - from __future__ import annotations at top of every Python file
    - All functions fully typed, mypy --strict must pass
    - All httpx calls must be async
    - emit_event() must be fire-and-forget — never let event emission block or crash a tool
    - Never hardcode attack chain stages — derive from real tool output

---

## Gabriel — Hermes (Telegram Gateway + Voice Call Mini App)

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: Hermes — the Telegram bot, ElevenLabs voice I/O, and the voice call Mini App.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules and project overview
    2. docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md — demo flow (Section 2)
    3. docs/superpowers/specs/2026-03-28-pantheon-design.md — original architecture
    4. pyproject.toml — uv package manager and mypy/ruff config

    Your implementation is on branch hermes/gateway-voice. Key files already built:
    - gateway/bot.py — Telegram bot (text, voice, file upload, /call command)
    - gateway/webapp.py — FastAPI Mini App server (ElevenLabs webhooks, /call HTML)
    - gateway/static/call.html — voice call interface inside Telegram
    - gateway/session.py — ADK session management (user_id → session_id)
    - gateway/runner.py — ADK runner bridge (ElevenLabs primary, Zeus fallback)
    - voice/agent.py — ElevenLabs Conversational AI bridge (WebSocket)

    Outstanding items for Phase 2:

    **Demo scenario wiring**
    The demo narrative is: "You're a dev paged at 2AM with a critical alert. Instead of being
    paged, you call the person who already knows what's wrong."
    - /call opens the Mini App immediately — no extra steps
    - The ElevenLabs agent should open with context: Zeus knows there is an active incident
    - File upload should trigger analysis immediately without extra prompting from the user
    - When analysis completes, Zeus should proactively send a voice message summary

    **Dashboard link**
    After triggering analysis (file upload or voice command), send the user a Telegram message:
    "Watch the agents work: <DASHBOARD_URL>"
    DASHBOARD_URL comes from WEBAPP_BASE_URL env var + /dashboard path.

    **Emit AGENT_ACTIVATED for Hermes**
    When Hermes receives a file or message and routes it to Zeus, emit a HERMES activation
    event to the sandbox event bus (POST /events on SANDBOX_API_URL).
    This makes Hermes appear as a node in the dashboard agent graph.

    Rules:
    - uv is the package manager — never pip install
    - from __future__ import annotations at top of every Python file
    - All functions fully typed, mypy --strict must pass
    - Never expose sandbox API or raw IOC data directly to the user — all interaction via agents
    - Never commit bot tokens or API keys
    - Use python-telegram-bot's async API

---

## Sai — Dashboard, Voice Module (Muse), Deployment

    You are working on Pantheon, an AI-driven malware analysis system for HackUSF 2026.

    Your domain: live web dashboard (frontend/), Muse voice module, Vultr deployment.

    Start by reading these files in order:
    1. CLAUDE.md — critical safety rules and project overview
    2. docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md — full dashboard design (your primary spec)
    3. docs/superpowers/specs/2026-03-28-pantheon-design.md — original architecture
    4. pyproject.toml — uv package manager and mypy/ruff config

    The dashboard design doc (Section 6) is your implementation spec. Summary:

    **frontend/ — Next.js + Tailwind + React Flow**

    The existing dashboard has the color system, typography, and layout structure.
    You need to replace static/hardcoded data with live WebSocket data.

    frontend/src/lib/pantheon-ws.ts — WebSocket client
    - Connects to ws://<SANDBOX_API_URL>/ws
    - Parses incoming PantheonEvent messages
    - Dispatches to a Zustand store (or React context)

    frontend/src/lib/event-store.ts — shared state
    - Holds: activeAgents, eventFeed, attackChain stages, processTree nodes, iocs
    - Updated by the WebSocket client as events arrive

    Components to wire up (all exist or partially exist — connect to event store):

    1. Agent Node Graph (React Flow)
       - Nodes: Zeus, Hermes, Athena, Hades, Apollo, Ares, Hephaestus, Windows VPS
       - Node state: idle (dim) | active (glow + pulse) | complete (checkmark)
       - Edges animate on HANDOFF events
       - Tool call events pulse on the calling node
       - Windows VPS node lights up when Procmon/FakeNet/Wireshark tools fire

    2. Live Event Feed
       - Renders PantheonEvents in order (auto-scroll to bottom)
       - TOOL_CALLED rows: expandable to show inputs
       - TOOL_RESULT rows: expandable to show output summary
       - IOC_DISCOVERED: amber highlight
       - NETWORK_EVENT: red highlight (C2 activity)
       - PROCESS_EVENT: yellow highlight (filesystem/registry)

    3. Attack Chain Diagram
       - Horizontal strip of stage cards
       - Populated from STAGE_UNLOCKED events — nothing hardcoded
       - Placeholder "Analyzing..." cards shown before stages unlock
       - Cards animate in (fade + slide) as they unlock

    4. Process / IOC Tree
       - Expandable tree rooted at the malware filename
       - Branches: Files Written, Registry Keys, Processes Spawned, Network Connections
       - Nodes appear as PROCESS_EVENT and IOC_DISCOVERED events arrive
       - New nodes flash on entry

    **Voice module (voice/client.py)** — already implemented on sai branch, merge to master.

    **Deployment**
    - Merge all branches to master before deploying
    - Run: cd /opt/pantheon && docker compose -f infra/docker-compose.yml up -d
    - Confirm all services healthy: docker compose ps
    - Set Telegram webhook after deploy
    - Dashboard accessible at /dashboard via nginx reverse proxy

    Rules:
    - All WebSocket events are the single source of truth — never fetch data from REST endpoints
      in dashboard components
    - Nothing in the dashboard is hardcoded — all data flows from PantheonEvent stream
    - uv for Python dependencies, npm/pnpm for frontend
    - SANDBOX_API_URL must be configurable via env for both local dev and production

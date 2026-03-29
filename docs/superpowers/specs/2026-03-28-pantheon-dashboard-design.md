# Pantheon — Live Dashboard + Windows VPS Monitoring Design

**Date:** 2026-03-28
**Status:** Approved — ready for implementation
**Authors:** Pablo Molina

---

## 1. Overview

This document describes the second major phase of Pantheon: a live web dashboard that visualizes the agent swarm in real time, and a Windows VPS monitoring layer that fills the gaps left by the Node.js sandbox (registry persistence, dropped payload behavior, C2 network activity).

The goal is a demo experience where a judge walks up to the table, the team says "imagine you're a dev paged at 2AM with a critical severity alert," someone sends a message or places a voice call via Telegram, and the dashboard on the laptop lights up — judges watch the agents wake up, hand off work, call real monitoring tools, and assemble a complete picture of the malware's intent in real time.

---

## 2. Demo Flow (end-to-end)

```
1. Team member hands judge their phone (Telegram open)
2. Judge sends "analyze this" + uploads malicious file  OR  hits /call and speaks to Zeus
3. Hermes receives the file/message
4. Zeus activates → Athena → Hades → Apollo → Ares
5. Dashboard (laptop on table) receives WebSocket events from the start
6. Agent graph lights up node by node as each agent activates
7. Tool calls appear in the live feed with real inputs and outputs
8. Hades calls Windows VPS tools — Procmon, Wireshark, FakeNet-NG output streams in
9. Attack chain diagram builds progressively as stages are discovered
10. Process tree expands: files written, registry keys set, processes spawned, network connections
11. Ares completes — full incident response playbook rendered on screen
12. Zeus responds to judge on Telegram via voice (ElevenLabs) with executive summary
```

---

## 3. System Architecture

```
[Telegram / Voice Call]
        |
   [Hermes — gateway/]
   python-telegram-bot + ElevenLabs Conversational AI
        |
   [Zeus — agents/zeus.py]
   ADK root orchestrator
        |
   ┌────────────────────────────────┐
   │  Agent Pipeline                │
   │  Athena → Hades → Apollo → Ares│
   └────────────────────────────────┘
        |                  |
        |         [Hephaestus — sandbox/]
        |          FastAPI on port 9000
        |          Static + Docker analysis
        |          EventBus (in-memory pub/sub)
        |          WebSocket endpoint /ws
        |                  |
        |         [Windows VPS Tools]
        |          Procmon, Wireshark, FakeNet-NG
        |          Exposed as ADK tools on Hades
        |
   POST /events  ← agents emit events directly
        |
   EventBus broadcasts to all /ws subscribers
        |
   [Dashboard — frontend/]
   Next.js + Tailwind, WebSocket client
   ├── Agent Node Graph
   ├── Live Event Feed
   ├── Attack Chain Diagram
   └── Process / IOC Tree
```

---

## 4. WebSocket Event System

### 4.1 EventBus

A lightweight asyncio pub/sub class lives inside `sandbox/main.py` (or `sandbox/events.py`). It holds a set of active WebSocket connections and broadcasts to all of them.

```python
class EventBus:
    def publish(self, event: PantheonEvent) -> None
    async def subscribe(self, websocket: WebSocket) -> None  # blocks, streams until disconnect
```

### 4.2 PantheonEvent schema

Every event emitted to the bus is a typed Pydantic model:

```python
class PantheonEvent(BaseModel):
    id: str                          # uuid4
    ts: str                          # ISO 8601 timestamp
    type: EventType                  # enum — see below
    agent: AgentName | None          # which agent emitted this
    tool: str | None                 # tool name if this is a tool call
    job_id: str | None               # sandbox job_id if applicable
    payload: dict[str, Any]          # event-specific data
```

### 4.3 EventType enum

```
AGENT_ACTIVATED       — agent comes online, receives control
AGENT_COMPLETED       — agent finishes its work
HANDOFF               — agent transfers to next agent (from, to)
TOOL_CALLED           — tool invoked (name, inputs)
TOOL_RESULT           — tool returned (name, output summary)
IOC_DISCOVERED        — new IOC found (type, value)
STAGE_UNLOCKED        — new attack chain stage confirmed (stage_id, label, description)
PROCESS_EVENT         — Procmon: process spawn, file write, registry write
NETWORK_EVENT         — Wireshark/FakeNet: DNS query, HTTP request, TCP connection
ANALYSIS_COMPLETE     — full pipeline finished (job_id, risk_level)
ERROR                 — any agent or tool failure
```

### 4.4 Endpoints

```
GET  /ws                   — WebSocket connection, receives PantheonEvent stream
POST /events               — HTTP endpoint for agents to emit events without calling sandbox
GET  /sandbox/health       — existing
POST /sandbox/analyze      — existing
GET  /sandbox/report/{id}  — existing
GET  /sandbox/iocs/{id}    — existing
```

### 4.5 Event emission points

Every agent tool in `agents/tools/` wraps its logic with event emission:

```python
# before tool execution
emit(TOOL_CALLED, agent="hades", tool="submit_sample", payload={...inputs})

# after tool execution
emit(TOOL_RESULT, agent="hades", tool="submit_sample", payload={...output_summary})
```

Agent handoffs emit `HANDOFF` events. Each agent's entry point emits `AGENT_ACTIVATED`. Each agent's exit emits `AGENT_COMPLETED`.

---

## 5. Windows VPS Monitoring Tools

### 5.1 Rationale

The Node.js harness cannot run `wscript.exe`, resolve COM objects, or execute native PE files. The full attack chain — registry persistence key name, dropped payload behavior, C2 network destination — requires a real Windows environment. These unknowns are discovered by running the sample on a sacrificial Windows VPS with three monitoring tools active simultaneously.

### 5.2 Tools exposed as ADK tools on Hades

Each tool SSHs into the Windows VPS (credentials from env), runs the relevant capture, parses the output, emits events, and returns structured data.

**`run_procmon_capture(duration_seconds: int) -> list[ProcessEvent]`**
- Starts Procmon on the VPS with a filter for the sample process tree
- Captures for `duration_seconds`
- Returns parsed events: `{type: "file_write"|"registry_write"|"process_spawn", path, value, process, pid}`
- Emits `PROCESS_EVENT` for each entry

**`run_fakenet_capture(duration_seconds: int) -> list[NetworkEvent]`**
- Starts FakeNet-NG on the VPS (simulates DNS/HTTP/TCP so the malware thinks it reached C2)
- Returns parsed network log: `{type: "dns_query"|"http_request"|"tcp_connect", host, path, payload_preview}`
- Emits `NETWORK_EVENT` for each entry

**`run_wireshark_capture(duration_seconds: int, pcap_path: str) -> list[NetworkEvent]`**
- Runs tshark (Wireshark CLI) on the VPS
- Returns parsed packet summary: `{src, dst, protocol, info}`
- Emits `NETWORK_EVENT` for each entry

**`detonate_sample(sample_path: str) -> DetonationResult`**
- Copies sample to VPS via SFTP
- Starts Procmon + FakeNet captures
- Executes `wscript.exe <sample_path>` on the VPS
- Waits for activity to settle (configurable timeout)
- Stops captures, collects results
- Returns combined `DetonationResult`

### 5.3 VPS safety

- The Windows VPS is a sacrificial cloud instance (Vultr/AWS)
- Snapshot taken before detonation — restore after
- FakeNet-NG intercepts all outbound connections — no real C2 reachable
- VPS network is isolated at the cloud provider level (security group: outbound blocked except FakeNet loopback)
- After detonation the snapshot is restored programmatically via the Vultr API

### 5.4 Environment variables required

```
WINDOWS_VPS_IP=...
WINDOWS_VPS_USER=...
WINDOWS_VPS_PASSWORD=...
WINDOWS_VPS_SNAPSHOT_ID=...   # optional: auto-restore after detonation
VULTR_API_KEY=...              # optional: for snapshot restore via API
```

---

## 6. Dashboard Design

Sai owns `frontend/`. The existing Next.js app has the color system and typography already. This section defines what components need to be built or wired up.

### 6.1 Layout (four panels)

```
┌────────────────────────────────────────────────────┐
│  HEADER: Pantheon  |  Job ID  |  Risk Level badge  │
├───────────────────────┬────────────────────────────┤
│                       │                            │
│   AGENT NODE GRAPH    │   LIVE EVENT FEED          │
│   (60% width)         │   (40% width)              │
│                       │                            │
│   Nodes: Zeus,        │   Chronological stream     │
│   Athena, Hades,      │   of PantheonEvents.       │
│   Apollo, Ares,       │   Tool calls show          │
│   Hermes, Hephaestus, │   collapsed input/output.  │
│   Windows VPS         │   Agent activations        │
│                       │   highlighted.             │
│   Edges animate on    │                            │
│   HANDOFF events.     │                            │
│   Tool calls pulse    │                            │
│   on the node.        │                            │
│                       │                            │
├───────────────────────┴────────────────────────────┤
│  ATTACK CHAIN (full width, horizontal)             │
│  Stages light up as STAGE_UNLOCKED events arrive.  │
│  Unknown stages shown as dimmed placeholders.      │
│  Each stage: icon + label + short description.     │
├───────────────────────┬────────────────────────────┤
│  PROCESS / IOC TREE   │  KEY INDICATORS SUMMARY    │
│  Expands as           │  IOC counts, risk level,   │
│  PROCESS_EVENT and    │  malware family, affected  │
│  IOC_DISCOVERED       │  systems — fills from      │
│  events arrive.       │  ANALYSIS_COMPLETE event.  │
└───────────────────────┴────────────────────────────┘
```

### 6.2 Agent Node Graph

- Library: React Flow (already in ecosystem, handles node/edge layout)
- Nodes: one per agent + Hephaestus sandbox + Windows VPS
- Node states: `idle` (dim), `active` (glowing, pulsing), `complete` (checkmark)
- Edges: directional arrows, animate (dash flow) when a handoff is in progress
- Tool call events: a small ring pulse on the calling agent's node
- Windows VPS node: distinct styling (server icon), lights up when Procmon/FakeNet tools fire

### 6.3 Live Event Feed

- Reverse chronological (newest at top) or forward (auto-scroll to bottom) — TBD by Sai
- Each event row: timestamp | agent icon | event type badge | description
- `TOOL_CALLED` rows are expandable — click to see full inputs/outputs
- `IOC_DISCOVERED` rows are highlighted in amber
- `NETWORK_EVENT` rows highlighted in red (C2 activity)
- `PROCESS_EVENT` rows in yellow (filesystem/registry activity)

### 6.4 Attack Chain Diagram

- Horizontal strip of stage cards
- Stages are not hardcoded — they are populated dynamically from `STAGE_UNLOCKED` events
- Before any stages unlock: shows placeholder cards labeled "Analyzing..."
- Each card: stage number, icon (file drop / persistence / execution / network / etc.), label, one-line description
- Cards animate in (fade + slide up) as they unlock

### 6.5 Process / IOC Tree

- Expandable tree: root is the malware filename
- Branches: Files Written, Registry Keys, Processes Spawned, Network Connections
- Nodes appear as `PROCESS_EVENT` and `IOC_DISCOVERED` events arrive
- New nodes animate in (highlight flash then settle)

### 6.6 WebSocket client

```typescript
// frontend/src/lib/pantheon-ws.ts
const ws = new WebSocket(`${SANDBOX_WS_URL}/ws`)
ws.onmessage = (msg) => {
  const event: PantheonEvent = JSON.parse(msg.data)
  dispatch(event)  // updates React state / Zustand store
}
```

All dashboard components subscribe to the shared event store. No component fetches data independently — everything comes through the WebSocket.

---

## 7. Updated Agent Responsibilities

### Hades (new)
- Calls `detonate_sample()` on Windows VPS after sandbox analysis completes
- Emits `STAGE_UNLOCKED` for each attack chain stage confirmed by Procmon/FakeNet output
- Emits `PROCESS_EVENT` and `NETWORK_EVENT` for each monitoring tool result

### All agents (new)
- Wrap every tool call with `emit(TOOL_CALLED, ...)` before and `emit(TOOL_RESULT, ...)` after
- Emit `AGENT_ACTIVATED` on entry, `AGENT_COMPLETED` on exit
- Emit `HANDOFF` when calling `transfer_to_agent`

---

## 8. New Models (sandbox/models.py additions)

```python
class EventType(str, Enum):
    AGENT_ACTIVATED = "agent_activated"
    AGENT_COMPLETED = "agent_completed"
    HANDOFF = "handoff"
    TOOL_CALLED = "tool_called"
    TOOL_RESULT = "tool_result"
    IOC_DISCOVERED = "ioc_discovered"
    STAGE_UNLOCKED = "stage_unlocked"
    PROCESS_EVENT = "process_event"
    NETWORK_EVENT = "network_event"
    ANALYSIS_COMPLETE = "analysis_complete"
    ERROR = "error"

class AgentName(str, Enum):
    ZEUS = "zeus"
    ATHENA = "athena"
    HADES = "hades"
    APOLLO = "apollo"
    ARES = "ares"
    HERMES = "hermes"

class PantheonEvent(BaseModel):
    id: str
    ts: str
    type: EventType
    agent: AgentName | None = None
    tool: str | None = None
    job_id: str | None = None
    payload: dict[str, Any] = {}

class ProcessEvent(BaseModel):
    event_type: Literal["file_write", "registry_write", "process_spawn"]
    path: str
    value: str | None = None
    process: str
    pid: int

class NetworkEvent(BaseModel):
    event_type: Literal["dns_query", "http_request", "tcp_connect"]
    host: str
    path: str | None = None
    payload_preview: str | None = None

class AttackStage(BaseModel):
    stage_id: str
    label: str
    description: str
    icon: str  # e.g. "file-drop", "persistence", "execution", "network", "exfiltration"
```

---

## 9. Implementation Order

This is the dependency order. Each item can only start after the one above it.

1. **`sandbox/events.py`** — EventBus + PantheonEvent + new models (Pablo)
2. **`sandbox/main.py`** — add `/ws` WebSocket endpoint + `POST /events` (Pablo)
3. **`agents/tools/event_tools.py`** — `emit_event()` helper all agents call (Pablo)
4. **Agent event wrappers** — wrap all tool calls + handoffs in Hades, Apollo, Ares (Andres)
5. **`agents/tools/vps_tools.py`** — Procmon, FakeNet, Wireshark, detonate_sample (Pablo)
6. **Dashboard WebSocket client** — `frontend/src/lib/pantheon-ws.ts` (Sai)
7. **Agent Node Graph component** — React Flow wiring (Sai)
8. **Live Event Feed component** — subscribe to event store (Sai)
9. **Attack Chain component** — STAGE_UNLOCKED driven (Sai)
10. **Process/IOC Tree component** — PROCESS_EVENT + IOC_DISCOVERED driven (Sai)
11. **Windows VPS setup** — install Procmon, FakeNet-NG, tshark, configure network isolation (Pablo)
12. **End-to-end demo run** — full pipeline with real malware, verify all events flow to dashboard

---

## 10. Open Questions

- **Windows VPS provider**: Vultr Windows instance or AWS EC2? Vultr preferred for consistency with existing infra.
- **Snapshot restore**: Vultr API supports programmatic snapshot restore. Pablo to confirm API key scope.
- **React Flow vs D3**: React Flow is higher-level and faster to wire up. D3 gives more control. Given the deadline, React Flow is recommended.
- **Dashboard hosting**: Served from the same nginx reverse proxy at `/dashboard`, or a separate Next.js dev server for the demo? The latter is simpler for the hackathon.
- **FakeNet on Windows VPS**: Requires Python on the VPS and admin rights. Confirm VPS has Python 3.x installed.

---

## 11. What This Unlocks for Judges

- **Google Cloud ADK Challenge**: Swarm of specialized agents with persistent memory, synthesis across runs, real tool integrations — this is the canonical ADK demo use case
- **NextEra Malware Challenge**: Complete attack chain reconstruction including the unknowns (C2 destination, registry key name, payload behavior) that static analysis couldn't reach
- **Best AI Hack**: The voice call + live dashboard combination is a genuinely novel interaction model — judge calls Zeus, watches the dashboard fill in while having a conversation about what the agents are finding

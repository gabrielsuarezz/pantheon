# Pantheon Phase 2 — Live Event Stream + Windows VPS Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a WebSocket event bus through the full agent pipeline so the live dashboard can visualize every agent activation, tool call, and discovery in real time; and expose Windows VPS monitoring tools (Procmon, FakeNet-NG, tshark) as ADK tools on Hades so the full attack chain can be observed beyond what the Node.js sandbox can see.

**Architecture:** The Hephaestus sandbox service (port 9000) becomes the central event hub — it gains a `GET /ws` WebSocket endpoint and a `POST /events` HTTP endpoint backed by an in-memory `EventBus`. Every agent tool wraps its execution with `emit_event()` calls (fire-and-forget HTTP to `/events`). Windows VPS tools SSH into a sacrificial Windows machine, run Procmon/FakeNet-NG/wscript.exe, retrieve the logs, parse them into structured events, and broadcast them through the same bus.

**Tech Stack:** Python 3.12, FastAPI WebSocket, asyncio.Queue, paramiko (SSH/SFTP), Pydantic v2, pytest, httpx, google-adk

---

## Progress

| Task | Status | Commit |
|---|---|---|
| 1: Event models (sandbox/models.py) | DONE | `feat: add event system models to sandbox/models.py` |
| 2: EventBus (sandbox/events.py) | DONE | `feat: add EventBus for WebSocket pub/sub` |
| 3: /ws + POST /events (sandbox/main.py) | DONE | `feat: add /ws WebSocket and POST /events endpoints to Hephaestus` |
| 4: emit_event() helper (agents/tools/event_tools.py) | DONE | `feat: add emit_event() helper for agent tool event emission` |
| 5: Wrap sandbox_tools.py | DONE | `feat: wrap sandbox_tools with event emission` |
| 6: Wrap memory/report/remediation tools | DONE | `feat: wrap memory, report, and remediation tools with event emission` |
| 7: vps_tools.py | DONE | `feat: add Windows VPS monitoring tools (Procmon, FakeNet-NG, detonate_sample)` |
| 8: Wire Hades to VPS + STAGE_UNLOCKED | DONE | `feat: wire Hades VPS detonation and STAGE_UNLOCKED event emission` |
| 9: Hermes dashboard link + activation event | pending (Gabriel) | — |
| 10: Dashboard WebSocket integration | pending (Sai) | — |
| 11: Windows VPS setup | pending (manual) | — |
| 12: End-to-end demo verification | pending (all) | — |

---

## File Map

| File | Action | Owner |
|---|---|---|
| `sandbox/models.py` | Modify — add EventType, AgentName, PantheonEvent, ProcessEvent, NetworkEvent, AttackStage, DetonationResult | Pablo |
| `sandbox/events.py` | Create — EventBus class, module-level singleton `bus` | Pablo |
| `sandbox/main.py` | Modify — add `/ws` WebSocket + `POST /events` endpoints, import bus | Pablo |
| `agents/tools/event_tools.py` | Create — `emit_event()` async helper | Pablo |
| `agents/tools/sandbox_tools.py` | Modify — wrap every function with emit_event calls | Andres |
| `agents/tools/memory_tools.py` | Modify — wrap every function with emit_event calls | Andres |
| `agents/tools/report_tools.py` | Modify — wrap every function with emit_event calls | Andres |
| `agents/tools/remediation_tools.py` | Modify — wrap every function with emit_event calls | Andres |
| `agents/tools/vps_tools.py` | Create — detonate_sample, Procmon, FakeNet-NG, tshark tools | Pablo |
| `agents/tools/__init__.py` | Modify — export new tools | Andres / Pablo |
| `agents/hades.py` | Modify — add VPS tools, emit STAGE_UNLOCKED from detonation results | Andres |
| `gateway/bot.py` | Modify — send dashboard link after triggering analysis, emit Hermes event | Gabriel |
| `tests/sandbox/test_events.py` | Create — EventBus + endpoint tests | Pablo |
| `tests/agents/test_event_tools.py` | Create — emit_event helper tests | Pablo |
| `tests/agents/test_vps_tools.py` | Create — VPS tool tests with mocked paramiko | Pablo |
| `frontend/` | Modify — WebSocket client + event store (open-ended, Sai owns) | Sai |

---

## Task 1: Add Event Models to sandbox/models.py

**Files:**
- Modify: `sandbox/models.py`

The existing models file has no event-related types. These additions give every service a shared vocabulary for what events look like.

- [x] **Step 1: Write the failing test**

Create `tests/sandbox/test_events.py`:

```python
from __future__ import annotations

from sandbox.models import (
    AgentName,
    AttackStage,
    DetonationResult,
    EventType,
    NetworkEvent,
    PantheonEvent,
    ProcessEvent,
)


def test_pantheon_event_defaults_id_and_ts() -> None:
    event = PantheonEvent(type=EventType.AGENT_ACTIVATED)
    assert len(event.id) == 36  # uuid4
    assert "T" in event.ts      # ISO 8601


def test_pantheon_event_serializes_to_json() -> None:
    event = PantheonEvent(
        type=EventType.TOOL_CALLED,
        agent=AgentName.HADES,
        tool="submit_sample",
        job_id="abc123",
        payload={"file_path": "/tmp/sample.js"},
    )
    data = event.model_dump()
    assert data["type"] == "tool_called"
    assert data["agent"] == "hades"
    assert data["payload"]["file_path"] == "/tmp/sample.js"


def test_process_event_fields() -> None:
    ev = ProcessEvent(
        event_type="file_write",
        path="C:\\Users\\Public\\Mands.png",
        process="wscript.exe",
        pid=1234,
    )
    assert ev.event_type == "file_write"
    assert ev.value is None


def test_network_event_fields() -> None:
    ev = NetworkEvent(
        event_type="dns_query",
        host="evil.example.com",
    )
    assert ev.path is None


def test_detonation_result_defaults_empty() -> None:
    result = DetonationResult()
    assert result.process_events == []
    assert result.network_events == []
    assert result.error is None


def test_attack_stage_fields() -> None:
    stage = AttackStage(
        stage_id="persistence",
        label="Registry Persistence",
        description="Writes HKCU Run key",
        icon="persistence",
    )
    assert stage.stage_id == "persistence"
```

- [x] **Step 2: Run test to confirm it fails**

```bash
uv run pytest tests/sandbox/test_events.py -v
```

Expected: `ImportError` — `EventType`, `AgentName`, etc. not yet defined.

- [x] **Step 3: Add event models to sandbox/models.py**

Add after the existing `SimilarJob` class (at the bottom of the file):

```python
# --- Event system models ----------------------------------------------------

import uuid
from datetime import datetime, timezone
from enum import Enum


class EventType(str, Enum):
    """All event types emitted by agents and tools to the EventBus."""

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
    """Canonical agent identifiers used in events."""

    ZEUS = "zeus"
    ATHENA = "athena"
    HADES = "hades"
    APOLLO = "apollo"
    ARES = "ares"
    HERMES = "hermes"


class PantheonEvent(BaseModel):
    """A single structured event broadcast through the EventBus."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ts: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    type: EventType
    agent: AgentName | None = None
    tool: str | None = None
    job_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class ProcessEvent(BaseModel):
    """A file, registry, or process event captured by Procmon on the Windows VPS."""

    event_type: Literal["file_write", "registry_write", "process_spawn"]
    path: str
    value: str | None = None
    process: str
    pid: int


class NetworkEvent(BaseModel):
    """A network event captured by FakeNet-NG or tshark on the Windows VPS."""

    event_type: Literal["dns_query", "http_request", "tcp_connect"]
    host: str
    path: str | None = None
    payload_preview: str | None = None


class AttackStage(BaseModel):
    """A confirmed stage of the malware's attack chain."""

    stage_id: str
    label: str
    description: str
    icon: str


class DetonationResult(BaseModel):
    """Combined output from a live Windows VPS detonation run."""

    process_events: list[ProcessEvent] = Field(default_factory=list)
    network_events: list[NetworkEvent] = Field(default_factory=list)
    error: str | None = None
```

Also update the imports at the top of models.py — find the existing lines and extend them:

```python
# extend existing typing import
from typing import Any, Literal

# add these new imports (not yet in the file)
import uuid
from datetime import datetime, timezone
from enum import Enum
```

- [x] **Step 4: Run tests to confirm they pass**

```bash
uv run pytest tests/sandbox/test_events.py -v
uv run mypy sandbox/models.py
```

Expected: all tests pass, mypy clean.

- [x] **Step 5: Commit**

```bash
git add sandbox/models.py tests/sandbox/test_events.py
git commit -m "feat: add event system models to sandbox/models.py"
```

---

## Task 2: Create sandbox/events.py (EventBus)

**Files:**
- Create: `sandbox/events.py`
- Test: `tests/sandbox/test_events.py` (extend)

The EventBus holds one `asyncio.Queue` per connected WebSocket subscriber. `publish()` is synchronous (puts to all queues via `put_nowait`). `subscribe()` is async and drains the queue, sending each event as JSON text to the WebSocket until disconnect.

- [x] **Step 1: Write the failing test**

Append to `tests/sandbox/test_events.py`:

```python
import asyncio
from unittest.mock import AsyncMock, MagicMock

from sandbox.events import EventBus
from sandbox.models import EventType, PantheonEvent


def _make_event(event_type: EventType = EventType.AGENT_ACTIVATED) -> PantheonEvent:
    return PantheonEvent(type=event_type, agent=None)


def test_publish_with_no_subscribers_does_not_raise() -> None:
    bus = EventBus()
    bus.publish(_make_event())  # should not raise


def test_publish_puts_event_in_subscriber_queue() -> None:
    bus = EventBus()
    queue: asyncio.Queue[PantheonEvent | None] = asyncio.Queue()
    bus._queues.add(queue)

    event = _make_event(EventType.TOOL_CALLED)
    bus.publish(event)

    assert not queue.empty()
    assert queue.get_nowait().id == event.id


def test_publish_removes_full_queues_silently() -> None:
    bus = EventBus()
    full_queue: asyncio.Queue[PantheonEvent | None] = asyncio.Queue(maxsize=1)
    full_queue.put_nowait(_make_event())  # fill it
    bus._queues.add(full_queue)

    bus.publish(_make_event())  # should not raise, should remove dead queue
    assert full_queue not in bus._queues


@pytest.mark.asyncio
async def test_subscribe_sends_events_to_websocket() -> None:
    bus = EventBus()
    ws = MagicMock()
    ws.accept = AsyncMock()
    ws.send_text = AsyncMock()

    event = _make_event(EventType.ANALYSIS_COMPLETE)

    async def _publish_then_disconnect() -> None:
        await asyncio.sleep(0.01)
        bus.publish(event)
        await asyncio.sleep(0.01)
        # Simulate disconnect by putting None sentinel
        for q in list(bus._queues):
            q.put_nowait(None)

    await asyncio.gather(
        bus.subscribe(ws),
        _publish_then_disconnect(),
    )

    ws.accept.assert_called_once()
    ws.send_text.assert_called_once()
    call_arg = ws.send_text.call_args[0][0]
    assert event.id in call_arg
```

Also add `import pytest` to the top of the test file.

- [x] **Step 2: Run to confirm failure**

```bash
uv run pytest tests/sandbox/test_events.py -v -k "EventBus"
```

Expected: `ImportError` — `sandbox.events` does not exist.

- [x] **Step 3: Create sandbox/events.py**

```python
"""EventBus — in-memory pub/sub for the Pantheon WebSocket event stream.

One asyncio.Queue per connected WebSocket subscriber. publish() is
synchronous and safe to call from any context. subscribe() is an
async coroutine that blocks until the client disconnects.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket

from sandbox.models import PantheonEvent

logger = logging.getLogger("hephaestus.events")


class EventBus:
    """Broadcasts PantheonEvents to all connected WebSocket subscribers."""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[PantheonEvent | None]] = set()

    def publish(self, event: PantheonEvent) -> None:
        """Put *event* onto every subscriber queue. Non-blocking."""
        dead: set[asyncio.Queue[PantheonEvent | None]] = set()
        for queue in self._queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                dead.add(queue)
        self._queues -= dead
        if dead:
            logger.debug("dropped %d slow subscriber(s)", len(dead))

    async def subscribe(self, websocket: WebSocket) -> None:
        """Accept *websocket* and stream events until disconnect."""
        await websocket.accept()
        queue: asyncio.Queue[PantheonEvent | None] = asyncio.Queue(maxsize=256)
        self._queues.add(queue)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                await websocket.send_text(event.model_dump_json())
        except Exception:
            pass
        finally:
            self._queues.discard(queue)


# Module-level singleton used by sandbox/main.py and tests.
bus: EventBus = EventBus()
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_events.py -v
uv run mypy sandbox/events.py
```

Expected: all pass, mypy clean.

- [x] **Step 5: Commit**

```bash
git add sandbox/events.py tests/sandbox/test_events.py
git commit -m "feat: add EventBus for WebSocket pub/sub"
```

---

## Task 3: Add /ws and POST /events to sandbox/main.py

**Files:**
- Modify: `sandbox/main.py`
- Test: `tests/sandbox/test_main.py` (extend)

- [x] **Step 1: Write the failing tests**

Append to `tests/sandbox/test_main.py`:

```python
from fastapi.testclient import TestClient
from sandbox.models import EventType, PantheonEvent


def test_post_events_returns_204(client: TestClient) -> None:
    event = PantheonEvent(type=EventType.AGENT_ACTIVATED, agent=None)
    resp = client.post("/events", content=event.model_dump_json(), headers={"Content-Type": "application/json"})
    assert resp.status_code == 204


def test_post_events_bad_payload_returns_422(client: TestClient) -> None:
    resp = client.post("/events", json={"not_a_valid": "event"})
    assert resp.status_code == 422


def test_websocket_connects_and_receives_event(client: TestClient) -> None:
    event = PantheonEvent(type=EventType.TOOL_CALLED, tool="submit_sample")

    with client.websocket_connect("/ws") as ws:
        # Post an event via HTTP — bus should broadcast it to the WS connection
        client.post("/events", content=event.model_dump_json(), headers={"Content-Type": "application/json"})
        data = ws.receive_text()

    import json
    received = json.loads(data)
    assert received["type"] == "tool_called"
    assert received["tool"] == "submit_sample"
```

- [x] **Step 2: Run to confirm failure**

```bash
uv run pytest tests/sandbox/test_main.py -v -k "events or websocket"
```

Expected: 404 on `/events`, and the websocket test will fail — the endpoints don't exist yet.

- [x] **Step 3: Update sandbox/main.py**

Add these imports at the top (alongside existing imports):

```python
from fastapi import FastAPI, HTTPException, WebSocket

from sandbox.events import bus
from sandbox.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    IOCReport,
    MemoryEntry,
    PantheonEvent,
    SimilarJob,
    StoreMemoryRequest,
    StoreMemoryResponse,
    ThreatReport,
)
```

Add these two endpoints after the existing `/sandbox/health` endpoint:

```python
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Stream PantheonEvents to connected dashboard clients."""
    await bus.subscribe(websocket)


@app.post("/events", status_code=204)
async def receive_event(event: PantheonEvent) -> None:
    """Accept an event from any agent and broadcast it to all /ws subscribers."""
    bus.publish(event)
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_main.py -v
uv run mypy sandbox/main.py
```

Expected: all pass, mypy clean.

- [x] **Step 5: Commit**

```bash
git add sandbox/main.py tests/sandbox/test_main.py
git commit -m "feat: add /ws WebSocket and POST /events endpoints to Hephaestus"
```

---

## Task 4: Create agents/tools/event_tools.py

**Files:**
- Create: `agents/tools/event_tools.py`
- Test: `tests/agents/test_event_tools.py`

This is the helper all agents call. It must never raise or block — a failed event emission must not break a tool call.

- [x] **Step 1: Write the failing test**

Create `tests/agents/test_event_tools.py`:

```python
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from sandbox.models import AgentName, EventType


@pytest.mark.asyncio
async def test_emit_event_posts_to_sandbox() -> None:
    from agents.tools.event_tools import emit_event

    mock_response = AsyncMock()
    mock_response.raise_for_status = AsyncMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("agents.tools.event_tools.httpx.AsyncClient", return_value=mock_client):
        await emit_event(
            EventType.TOOL_CALLED,
            agent=AgentName.HADES,
            tool="submit_sample",
            job_id="job-1",
            payload={"file_path": "/tmp/sample.js"},
        )

    mock_client.post.assert_called_once()
    call_url = mock_client.post.call_args[0][0]
    assert call_url.endswith("/events")


@pytest.mark.asyncio
async def test_emit_event_does_not_raise_on_network_failure() -> None:
    from agents.tools.event_tools import emit_event
    import httpx

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("sandbox down"))

    with patch("agents.tools.event_tools.httpx.AsyncClient", return_value=mock_client):
        # Must not raise
        await emit_event(EventType.ERROR, agent=AgentName.ZEUS, payload={"msg": "test"})
```

- [x] **Step 2: Run to confirm failure**

```bash
uv run pytest tests/agents/test_event_tools.py -v
```

Expected: `ImportError` — module does not exist.

- [x] **Step 3: Create agents/tools/event_tools.py**

```python
"""Event emission helper — thin wrapper around POST /events on Hephaestus.

All agent tools call emit_event() before and after execution.
Failures are logged at DEBUG level and silently swallowed — event emission
must never block or crash a tool invocation.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from sandbox.models import AgentName, EventType, PantheonEvent

logger = logging.getLogger("pantheon.events")

_SANDBOX_URL: str = os.getenv("SANDBOX_API_URL", "http://sandbox:9000")


async def emit_event(
    event_type: EventType,
    *,
    agent: AgentName | None = None,
    tool: str | None = None,
    job_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget: emit a PantheonEvent to the Hephaestus EventBus."""
    event = PantheonEvent(
        type=event_type,
        agent=agent,
        tool=tool,
        job_id=job_id,
        payload=payload or {},
    )
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(
                f"{_SANDBOX_URL}/events",
                content=event.model_dump_json(),
                headers={"Content-Type": "application/json"},
            )
    except Exception as exc:
        logger.debug("event emit failed (non-fatal): %s", exc)
```

- [x] **Step 4: Export from agents/tools/__init__.py**

Open `agents/tools/__init__.py` and add `emit_event` to `__all__`:

```python
from agents.tools.event_tools import emit_event
```

- [x] **Step 5: Run tests**

```bash
uv run pytest tests/agents/test_event_tools.py -v
uv run mypy agents/tools/event_tools.py
```

Expected: all pass, mypy clean.

- [x] **Step 6: Commit**

```bash
git add agents/tools/event_tools.py agents/tools/__init__.py tests/agents/test_event_tools.py
git commit -m "feat: add emit_event() helper for agent tool event emission"
```

---

## Task 5: Wrap sandbox_tools.py with Event Emission (Andres)

**Files:**
- Modify: `agents/tools/sandbox_tools.py`

Apply the emit-before/emit-after pattern to every public function. The pattern is identical for all tools — shown once in full for `submit_sample`, then applied to the remaining functions.

- [x] **Step 1: Add imports to sandbox_tools.py**

At the top of `agents/tools/sandbox_tools.py`, add:

```python
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType
```

- [x] **Step 2: Wrap submit_sample**

Replace the existing `submit_sample` function body with:

```python
async def submit_sample(file_path: str, analysis_type: str = "both") -> dict[str, str]:
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.HADES,
        tool="submit_sample",
        payload={"file_path": file_path, "analysis_type": analysis_type},
    )
    path = Path(file_path)
    raw_bytes = path.read_bytes()
    b64 = base64.b64encode(raw_bytes).decode()
    job_id = str(uuid.uuid4())
    request = AnalyzeRequest(
        job_id=job_id,
        file_content_b64=b64,
        filename=path.name,
        analysis_type=analysis_type,  # type: ignore[arg-type]
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{_SANDBOX_URL}/sandbox/analyze",
            json=request.model_dump(),
        )
        resp.raise_for_status()
        result = AnalyzeResponse.model_validate(resp.json())
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.HADES,
        tool="submit_sample",
        job_id=result.job_id,
        payload={"job_id": result.job_id, "status": result.status},
    )
    return {"job_id": result.job_id, "status": result.status}
```

- [x] **Step 3: Apply same pattern to get_report, poll_report, get_iocs, check_sandbox_health**

For each function:
- Add `await emit_event(EventType.TOOL_CALLED, agent=AgentName.HADES, tool="<fn_name>", job_id=job_id_if_available, payload={...key_inputs})` at the top of the function body
- Add `await emit_event(EventType.TOOL_RESULT, agent=AgentName.HADES, tool="<fn_name>", job_id=..., payload={...key_output_summary})` before the return statement

For `get_report` the agent is `AgentName.HADES`, for `get_iocs` the agent is `AgentName.APOLLO`. For `check_sandbox_health` the agent is `AgentName.HADES`.

- [x] **Step 4: Run existing tests to confirm nothing broke**

```bash
uv run pytest tests/agents/ -v
uv run mypy agents/tools/sandbox_tools.py
```

Expected: all existing tests pass.

- [x] **Step 5: Commit**

```bash
git add agents/tools/sandbox_tools.py
git commit -m "feat: wrap sandbox_tools with event emission"
```

---

## Task 6: Wrap memory_tools, report_tools, remediation_tools with Event Emission (Andres)

**Files:**
- Modify: `agents/tools/memory_tools.py`
- Modify: `agents/tools/report_tools.py`
- Modify: `agents/tools/remediation_tools.py`

Apply the same pattern from Task 5 to every public function in each file. Use the correct `AgentName` for each:

| File | AgentName |
|---|---|
| memory_tools.py | `AgentName.HADES` for `store_behavioral_fingerprint`, `find_similar_jobs`; `AgentName.APOLLO` for `load_prior_runs`, `synthesize_prior_runs`; `AgentName.ARES` for `store_agent_output` |
| report_tools.py | `AgentName.APOLLO` |
| remediation_tools.py | `AgentName.ARES` |

- [x] **Step 1: Add imports to each file**

At the top of each file add:

```python
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType
```

- [x] **Step 2: Wrap all public functions in memory_tools.py**

Example for `store_agent_output`:

```python
async def store_agent_output(
    job_id: str, agent_name: str, output: str, temperature: float = 0.3
) -> dict[str, int]:
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.ARES,
        tool="store_agent_output",
        job_id=job_id,
        payload={"agent_name": agent_name, "temperature": temperature},
    )
    # ... existing implementation unchanged ...
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.ARES,
        tool="store_agent_output",
        job_id=job_id,
        payload={"run_number": result["run_number"], "total_runs": result["total_runs"]},
    )
    return result
```

Apply this pattern to every function in all three files. The payload for TOOL_RESULT should summarize the output — not dump the full text.

- [x] **Step 3: Run tests**

```bash
uv run pytest tests/agents/ -v
uv run mypy agents/tools/memory_tools.py agents/tools/report_tools.py agents/tools/remediation_tools.py
```

Expected: all pass.

- [x] **Step 4: Commit**

```bash
git add agents/tools/memory_tools.py agents/tools/report_tools.py agents/tools/remediation_tools.py
git commit -m "feat: wrap memory, report, and remediation tools with event emission"
```

---

## Task 7: Create agents/tools/vps_tools.py (Pablo)

**Files:**
- Create: `agents/tools/vps_tools.py`
- Test: `tests/agents/test_vps_tools.py`

These tools SSH into the Windows VPS, run monitoring software, retrieve logs, and parse them into structured events. The exact log parsing formats must be validated against actual tool output once the VPS is set up — mark any parsing logic with `# VALIDATE: check against actual output` so it's easy to find during VPS setup.

**Prerequisites:** `uv add paramiko` before writing this task.

- [x] **Step 0: Add paramiko dependency**

```bash
uv add paramiko
```

- [x] **Step 1: Write the failing tests**

Create `tests/agents/test_vps_tools.py`:

```python
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch, AsyncMock

from sandbox.models import DetonationResult, NetworkEvent, ProcessEvent


@pytest.mark.asyncio
async def test_detonate_sample_returns_detonation_result() -> None:
    from agents.tools.vps_tools import detonate_sample

    mock_ssh = MagicMock()
    mock_transport = MagicMock()
    mock_sftp = MagicMock()
    mock_channel = MagicMock()
    mock_channel.recv_exit_status.return_value = 0

    mock_stdin = MagicMock()
    mock_stdout = MagicMock()
    mock_stdout.read.return_value = b""
    mock_stderr = MagicMock()
    mock_stderr.read.return_value = b""

    mock_ssh.exec_command.return_value = (mock_stdin, mock_stdout, mock_stderr)
    mock_ssh.open_sftp.return_value = mock_sftp

    with patch("agents.tools.vps_tools.paramiko.SSHClient", return_value=mock_ssh):
        with patch("agents.tools.vps_tools.emit_event", new_callable=AsyncMock):
            result = await detonate_sample("/tmp/sample.js")

    assert isinstance(result, dict)
    assert "process_events" in result
    assert "network_events" in result


@pytest.mark.asyncio
async def test_parse_procmon_csv_extracts_file_writes() -> None:
    from agents.tools.vps_tools import _parse_procmon_csv

    csv_content = (
        '"Time of Day","Process Name","PID","Operation","Path","Result","Detail"\n'
        '"12:00:00.000","wscript.exe","1234","WriteFile","C:\\\\Users\\\\Public\\\\Mands.png","SUCCESS",""\n'
        '"12:00:01.000","wscript.exe","1234","RegSetValue",'
        '"HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run\\\\Updater","SUCCESS",""\n'
    )
    events = _parse_procmon_csv(csv_content)
    assert len(events) == 2
    assert events[0].event_type == "file_write"
    assert events[0].path == "C:\\Users\\Public\\Mands.png"
    assert events[1].event_type == "registry_write"
    assert "Run" in events[1].path


@pytest.mark.asyncio
async def test_parse_fakenet_log_extracts_dns_queries() -> None:
    from agents.tools.vps_tools import _parse_fakenet_log

    log_content = (
        "Listener DNS: Received A query for evil.example.com from 127.0.0.1\n"
        "Listener HTTP: GET /payload.bin HTTP/1.1 Host: evil.example.com\n"
    )
    events = _parse_fakenet_log(log_content)
    assert any(e.event_type == "dns_query" and "evil.example.com" in e.host for e in events)
```

- [x] **Step 2: Run to confirm failure**

```bash
uv run pytest tests/agents/test_vps_tools.py -v
```

Expected: `ImportError` — module does not exist.

- [x] **Step 3: Create agents/tools/vps_tools.py**

```python
"""Windows VPS monitoring tools — live detonation with Procmon and FakeNet-NG.

These tools SSH into the sacrificial Windows VPS, execute the malware sample
under Procmon and FakeNet-NG monitoring, retrieve the logs, and parse them
into structured ProcessEvent and NetworkEvent objects.

SAFETY: The VPS must have all outbound network blocked at the cloud provider
security group level before calling detonate_sample(). FakeNet-NG intercepts
all local network calls. After detonation, restore the VPS snapshot.

NOTE: Log parsing logic is marked with # VALIDATE comments — verify against
actual tool output on the real VPS before the demo.
"""

from __future__ import annotations

import csv
import io
import logging
import os
import re
import time
from typing import Any

import paramiko

from agents.tools.event_tools import emit_event
from sandbox.models import (
    AgentName,
    AttackStage,
    DetonationResult,
    EventType,
    NetworkEvent,
    ProcessEvent,
)

logger = logging.getLogger("pantheon.vps")

_VPS_IP: str = os.getenv("WINDOWS_VPS_IP", "")
_VPS_USER: str = os.getenv("WINDOWS_VPS_USER", "Administrator")
_VPS_PASSWORD: str = os.getenv("WINDOWS_VPS_PASSWORD", "")

# Paths on the Windows VPS — adjust after setup
_PROCMON_PATH: str = r"C:\tools\Procmon.exe"
_FAKENET_PATH: str = r"C:\tools\fakenet\fakenet.py"
_SAMPLE_DIR: str = r"C:\work"
_CAPTURE_PML: str = r"C:\work\capture.pml"
_CAPTURE_CSV: str = r"C:\work\capture.csv"
_FAKENET_LOG: str = r"C:\work\fakenet.log"
_DETONATION_TIMEOUT: int = int(os.getenv("DETONATION_TIMEOUT", "30"))


def _ssh_connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())  # noqa: S507
    client.connect(_VPS_IP, username=_VPS_USER, password=_VPS_PASSWORD, timeout=15)
    return client


def _exec(ssh: paramiko.SSHClient, command: str, timeout: int = 60) -> tuple[str, str]:
    """Run a command over SSH and return (stdout, stderr)."""
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    return out, err


def _parse_procmon_csv(csv_content: str) -> list[ProcessEvent]:
    """Parse a Procmon CSV export into ProcessEvent objects.

    # VALIDATE: check column names against actual Procmon CSV output on the VPS.
    Expected columns: Time of Day, Process Name, PID, Operation, Path, Result, Detail
    """
    events: list[ProcessEvent] = []
    reader = csv.DictReader(io.StringIO(csv_content))
    for row in reader:
        operation = row.get("Operation", "").lower()
        path = row.get("Path", "")
        process = row.get("Process Name", "unknown")
        pid_str = row.get("PID", "0")
        try:
            pid = int(pid_str)
        except ValueError:
            pid = 0

        if "writefile" in operation or "createfile" in operation:
            events.append(ProcessEvent(
                event_type="file_write",
                path=path,
                process=process,
                pid=pid,
            ))
        elif "regsetvalue" in operation or "regcreatekey" in operation:
            events.append(ProcessEvent(
                event_type="registry_write",
                path=path,
                process=process,
                pid=pid,
            ))
        elif "process create" in operation:
            events.append(ProcessEvent(
                event_type="process_spawn",
                path=path,
                process=process,
                pid=pid,
            ))
    return events


def _parse_fakenet_log(log_content: str) -> list[NetworkEvent]:
    """Parse FakeNet-NG log output into NetworkEvent objects.

    # VALIDATE: check log format against actual FakeNet-NG output on the VPS.
    FakeNet-NG log lines typically start with 'Listener <name>: <detail>'
    """
    events: list[NetworkEvent] = []
    for line in log_content.splitlines():
        # DNS queries: "Listener DNS: Received A query for <host> from ..."
        dns_match = re.search(r"Received [A-Z]+ query for ([^\s]+)", line)
        if dns_match:
            events.append(NetworkEvent(
                event_type="dns_query",
                host=dns_match.group(1),
            ))
            continue

        # HTTP requests: "Listener HTTP: GET /path HTTP/1.1 Host: <host>"
        http_match = re.search(r"(GET|POST|PUT|HEAD) (/[^\s]*)[^H]*Host: ([^\s]+)", line)
        if http_match:
            events.append(NetworkEvent(
                event_type="http_request",
                host=http_match.group(3),
                path=http_match.group(2),
                payload_preview=line[:120],
            ))
            continue

        # TCP connections: "Listener TCP: Handling TCP connection from <host>:<port>"
        tcp_match = re.search(r"Handling TCP connection[^f]+from ([^\s:]+)", line)
        if tcp_match:
            events.append(NetworkEvent(
                event_type="tcp_connect",
                host=tcp_match.group(1),
            ))
    return events


async def detonate_sample(sample_path: str) -> dict[str, Any]:
    """Copy sample to Windows VPS, run under Procmon + FakeNet-NG, return structured results.

    Args:
        sample_path: Local path to the malware sample.

    Returns:
        DetonationResult serialized as dict (for ADK compatibility).
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.HADES,
        tool="detonate_sample",
        payload={"sample_path": sample_path},
    )

    if not _VPS_IP:
        logger.warning("WINDOWS_VPS_IP not set — skipping live detonation")
        result = DetonationResult(error="WINDOWS_VPS_IP not configured")
        return result.model_dump()

    ssh = _ssh_connect()
    try:
        # Upload sample via SFTP
        sftp = ssh.open_sftp()
        remote_sample = f"{_SAMPLE_DIR}\\sample.js"
        sftp.put(sample_path, remote_sample)
        sftp.close()

        # Start FakeNet-NG in a background process
        # # VALIDATE: confirm FakeNet path and Python availability on VPS
        _exec(ssh, f"start /B python {_FAKENET_PATH} -l {_FAKENET_LOG}", timeout=5)
        time.sleep(2)

        # Start Procmon capture
        # # VALIDATE: confirm Procmon path on VPS
        _exec(ssh, f"{_PROCMON_PATH} /AcceptEula /Quiet /Minimized /BackingFile {_CAPTURE_PML}")
        time.sleep(1)

        # Detonate
        _exec(ssh, f"wscript.exe {remote_sample}", timeout=_DETONATION_TIMEOUT + 5)
        time.sleep(5)  # let activity settle

        # Stop Procmon and export CSV
        _exec(ssh, f"{_PROCMON_PATH} /Terminate")
        time.sleep(2)
        _exec(ssh, f"{_PROCMON_PATH} /OpenLog {_CAPTURE_PML} /SaveAs {_CAPTURE_CSV}")
        time.sleep(3)

        # Retrieve Procmon CSV
        sftp = ssh.open_sftp()
        with sftp.open(_CAPTURE_CSV, "r") as f:
            procmon_csv = f.read().decode(errors="replace")

        # Retrieve FakeNet log
        try:
            with sftp.open(_FAKENET_LOG, "r") as f:
                fakenet_log = f.read().decode(errors="replace")
        except OSError:
            fakenet_log = ""
        sftp.close()

    finally:
        ssh.close()

    process_events = _parse_procmon_csv(procmon_csv)
    network_events = _parse_fakenet_log(fakenet_log)

    # Emit individual process and network events to the bus
    for pe in process_events:
        await emit_event(
            EventType.PROCESS_EVENT,
            agent=AgentName.HADES,
            tool="detonate_sample",
            payload=pe.model_dump(),
        )
    for ne in network_events:
        await emit_event(
            EventType.NETWORK_EVENT,
            agent=AgentName.HADES,
            tool="detonate_sample",
            payload=ne.model_dump(),
        )

    result = DetonationResult(
        process_events=process_events,
        network_events=network_events,
    )

    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.HADES,
        tool="detonate_sample",
        payload={
            "process_event_count": len(process_events),
            "network_event_count": len(network_events),
        },
    )

    return result.model_dump()
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/agents/test_vps_tools.py -v
uv run mypy agents/tools/vps_tools.py
```

Expected: all pass, mypy clean.

- [x] **Step 5: Export from __init__.py**

Add to `agents/tools/__init__.py`:

```python
from agents.tools.vps_tools import detonate_sample
```

- [x] **Step 6: Commit**

```bash
git add agents/tools/vps_tools.py agents/tools/__init__.py tests/agents/test_vps_tools.py
git commit -m "feat: add Windows VPS monitoring tools (Procmon, FakeNet-NG, detonate_sample)"
```

---

## Task 8: Wire Hades to Call VPS Tools + Emit STAGE_UNLOCKED (Andres)

**Files:**
- Modify: `agents/hades.py`

After `poll_report` completes, Hades calls `detonate_sample()` and derives attack chain stages from the results. Each confirmed stage emits `STAGE_UNLOCKED`. Stages must be derived from actual detonation output — nothing hardcoded.

- [x] **Step 1: Read the current agents/hades.py**

Read `agents/hades.py` fully before making any changes. Understand the current instruction set and tool list.

- [x] **Step 2: Add detonate_sample to Hades tools list**

In the Hades agent definition, add `detonate_sample` to the `tools` parameter alongside existing tools.

- [x] **Step 3: Update Hades instruction to include VPS detonation step**

In the Hades `instruction` string, add after the sandbox analysis steps:

```
After sandbox analysis completes and you have a ThreatReport:
5. Call detonate_sample() with the same file path to run the sample on the live Windows VPS.
6. For each category of evidence found in the detonation result, emit a STAGE_UNLOCKED event:
   - If process_events contains any file_write events: emit STAGE_UNLOCKED with stage_id="file_drop",
     label="Payload Drop", description="Dropped files: <list paths>", icon="file-drop"
   - If process_events contains registry_write events: emit STAGE_UNLOCKED with stage_id="persistence",
     label="Registry Persistence", description="Registry keys: <list paths>", icon="persistence"
   - If network_events contains dns_query or http_request events: emit STAGE_UNLOCKED with
     stage_id="c2_contact", label="C2 Communication", description="Contacted: <list hosts>", icon="network"
   - If process_events contains process_spawn events: emit STAGE_UNLOCKED with
     stage_id="execution", label="Process Execution", description="Spawned: <list processes>", icon="execution"
   Only emit a stage if there is actual evidence for it in the detonation result.
```

- [x] **Step 4: Add AGENT_ACTIVATED and AGENT_COMPLETED emission**

At the entry point of Hades (the first instruction line), wrap with:

The ADK agent instructions cannot call Python directly, so instead add `emit_event` as a tool available to Hades, and add to the instruction:

```
At the very start of your work, call emit_event with type=AGENT_ACTIVATED, agent=hades.
At the very end before transferring to Apollo, call emit_event with type=AGENT_COMPLETED, agent=hades,
and then call emit_event with type=HANDOFF, payload={from: hades, to: apollo}.
```

Add `emit_event` to the Hades tools list.

- [x] **Step 5: Run pipeline tests**

```bash
uv run pytest tests/agents/test_pipeline.py -v
uv run mypy agents/hades.py
```

Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add agents/hades.py
git commit -m "feat: wire Hades VPS detonation and STAGE_UNLOCKED event emission"
```

---

## Task 9: Gabriel — Hermes Dashboard Link + Activation Event

**Files:**
- Modify: `gateway/bot.py`

Two small additions to the existing bot implementation.

- [ ] **Step 1: Send dashboard link after analysis is triggered**

In the file upload handler in `gateway/bot.py`, after the analysis trigger message is sent, add:

```python
dashboard_url = os.getenv("WEBAPP_BASE_URL", "") + "/dashboard"
if dashboard_url.startswith("http"):
    await update.message.reply_text(f"Watch the agents work: {dashboard_url}")
```

- [ ] **Step 2: Emit Hermes AGENT_ACTIVATED when routing to Zeus**

In `gateway/runner.py`, at the start of `get_agent_response()`, add an HTTP call to the sandbox event bus:

```python
import httpx
import os
from sandbox.models import AgentName, EventType, PantheonEvent

_SANDBOX_URL = os.getenv("SANDBOX_API_URL", "http://sandbox:9000")

async def _emit_hermes_active(job_id: str | None = None) -> None:
    event = PantheonEvent(
        type=EventType.AGENT_ACTIVATED,
        agent=AgentName.HERMES,
        job_id=job_id,
        payload={"source": "telegram"},
    )
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(
                f"{_SANDBOX_URL}/events",
                content=event.model_dump_json(),
                headers={"Content-Type": "application/json"},
            )
    except Exception:
        pass
```

Call `await _emit_hermes_active()` at the start of `get_agent_response()`.

- [ ] **Step 3: Run Hermes tests**

```bash
uv run pytest tests/test_bot.py tests/test_runner.py -v
uv run mypy gateway/bot.py gateway/runner.py
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add gateway/bot.py gateway/runner.py
git commit -m "feat: Hermes sends dashboard link and emits activation event"
```

---

## Task 10: Dashboard WebSocket Integration (Sai — open-ended)

**Files:**
- Modify: `frontend/` (Sai owns all decisions here)

This task defines the contract Sai's dashboard must consume. The visual implementation, component design, and library choices are entirely up to Sai.

### WebSocket contract

Connect to:
```
ws://<SANDBOX_API_URL>/ws
```

Every message is a JSON-serialized `PantheonEvent`:

```typescript
type EventType =
  | "agent_activated" | "agent_completed" | "handoff"
  | "tool_called" | "tool_result"
  | "ioc_discovered" | "stage_unlocked"
  | "process_event" | "network_event"
  | "analysis_complete" | "error"

type AgentName = "zeus" | "athena" | "hades" | "apollo" | "ares" | "hermes"

interface PantheonEvent {
  id: string           // uuid4
  ts: string           // ISO 8601
  type: EventType
  agent: AgentName | null
  tool: string | null
  job_id: string | null
  payload: Record<string, unknown>
}
```

### What each event type means for the UI

| Event | Payload keys | UI hint |
|---|---|---|
| `agent_activated` | — | Light up that agent's node |
| `agent_completed` | — | Mark node complete |
| `handoff` | `from`, `to` | Animate edge between nodes |
| `tool_called` | `tool`, inputs | Pulse on calling agent's node, add to feed |
| `tool_result` | `tool`, output summary | Add expandable result row to feed |
| `ioc_discovered` | `type`, `value` | Add to IOC tree, amber highlight in feed |
| `stage_unlocked` | `stage_id`, `label`, `description`, `icon` | Add/light up attack chain card |
| `process_event` | `event_type`, `path`, `process`, `pid` | Add to process tree, yellow highlight |
| `network_event` | `event_type`, `host`, `path` | Add to network branch, red highlight |
| `analysis_complete` | `job_id`, `risk_level` | Fill summary panel |
| `error` | `error` | Red banner in feed |

### Recommended approach

```typescript
// frontend/src/lib/pantheon-ws.ts
export function connectPantheonWS(
  url: string,
  onEvent: (event: PantheonEvent) => void
): () => void {
  const ws = new WebSocket(url)
  ws.onmessage = (msg) => onEvent(JSON.parse(msg.data))
  ws.onerror = () => setTimeout(() => connectPantheonWS(url, onEvent), 2000)
  return () => ws.close()
}
```

All state that flows from events should live in a single store (Zustand, React context, or similar). Components should subscribe to the store — not directly to the WebSocket.

The four dashboard panels (agent graph, live feed, attack chain, process tree) are described in the design spec at `docs/superpowers/specs/2026-03-28-pantheon-dashboard-design.md` Section 6. Visual decisions are yours.

- [ ] **Step 1: Implement WebSocket client and event store**
- [ ] **Step 2: Connect existing agent graph to event store**
- [ ] **Step 3: Connect existing live feed to event store**
- [ ] **Step 4: Implement attack chain panel (data-driven from STAGE_UNLOCKED)**
- [ ] **Step 5: Implement process/IOC tree (data-driven from PROCESS_EVENT + IOC_DISCOVERED)**
- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: connect dashboard to live WebSocket event stream"
```

---

## Task 11: Windows VPS Setup Checklist (Pablo — manual)

Before the demo, the VPS must be configured. This is a manual checklist, not code.

- [ ] Provision a Windows Server VPS (Vultr recommended)
- [ ] Take an initial snapshot immediately after provisioning (before any tools are installed)
- [ ] Install Python 3.x (for FakeNet-NG)
- [ ] Download Procmon.exe from Sysinternals — place at `C:\tools\Procmon.exe`
- [ ] Clone FakeNet-NG — place at `C:\tools\fakenet\`
- [ ] Install tshark (optional, for packet-level capture)
- [ ] Create `C:\work\` directory
- [ ] Run Procmon once manually to accept the EULA: `Procmon.exe /AcceptEula`
- [ ] Run a test detonation with a benign JS file: `wscript.exe test.js` while Procmon is running — verify CSV export works
- [ ] Verify FakeNet-NG starts and creates a log file
- [ ] Take a "clean tools" snapshot — this is the snapshot ID to put in `WINDOWS_VPS_SNAPSHOT_ID`
- [ ] Block all outbound traffic at the Vultr security group level
- [ ] Confirm the `VALIDATE` comments in `vps_tools.py` match actual tool output
- [ ] Set all VPS env vars in `.env` on the deployment server

---

## Task 12: End-to-End Demo Verification (All)

- [ ] Deploy full stack: `docker compose -f infra/docker-compose.yml up -d`
- [ ] Open dashboard at `<WEBAPP_BASE_URL>/dashboard` — confirm WebSocket connects (check browser console)
- [ ] Send a file to the Telegram bot — confirm Hermes activation event appears on dashboard
- [ ] Watch agent graph light up node by node through the pipeline
- [ ] Confirm tool calls appear in the live feed with inputs/outputs
- [ ] Confirm VPS detonation fires and STAGE_UNLOCKED events appear
- [ ] Confirm process/IOC tree populates with real findings
- [ ] Confirm Ares produces a complete incident response plan
- [ ] Confirm Zeus sends a voice reply to Telegram
- [ ] Restore VPS snapshot after test run
- [ ] Run the demo flow 2-3 times to confirm reliability before judging

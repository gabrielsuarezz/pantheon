from __future__ import annotations

import pytest
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
    data = event.model_dump(mode="json")
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


import asyncio
from unittest.mock import AsyncMock, MagicMock

from sandbox.events import EventBus


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

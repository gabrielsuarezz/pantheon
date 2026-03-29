from __future__ import annotations

import pytest

from sandbox.models import EventType, PantheonEvent
from sandbox.streaming import EventStreamReplicator


async def test_replicator_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PANTHEON_STREAM_BACKEND", raising=False)
    replicator = EventStreamReplicator()
    assert not replicator.enabled
    await replicator.start()
    replicator.enqueue(PantheonEvent(type=EventType.AGENT_ACTIVATED))
    await replicator.stop()


async def test_replicator_unknown_backend_is_safe(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PANTHEON_STREAM_BACKEND", "something-else")
    replicator = EventStreamReplicator()
    assert replicator.enabled
    await replicator.start()
    replicator.enqueue(PantheonEvent(type=EventType.AGENT_COMPLETED))
    await replicator.stop()

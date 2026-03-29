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

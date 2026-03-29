"""Tests for gateway.runner — ADK runner bridge."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from gateway import runner as runner_mod


@pytest.fixture(autouse=True)
def _reset_runner() -> None:  # type: ignore[misc]
    """Clear the cached runner between tests."""
    runner_mod._runner = None


def _make_event(text: str) -> MagicMock:
    """Create a minimal mock Event with a single text Part."""
    event = MagicMock()
    part = MagicMock()
    part.text = text
    event.content = MagicMock()
    event.content.parts = [part]
    return event


def _make_empty_event() -> MagicMock:
    """Event whose content has no parts."""
    event = MagicMock()
    event.content = MagicMock()
    event.content.parts = []
    return event


async def _async_gen(*events: MagicMock) -> AsyncGenerator[MagicMock, None]:
    for e in events:
        yield e


@patch("gateway.runner._get_runner")
@patch("gateway.runner.create_or_get_session")
async def test_get_agent_response_concatenates_parts(
    mock_session: AsyncMock,
    mock_get_runner: MagicMock,
) -> None:
    session = MagicMock()
    session.id = "sess_1"
    mock_session.return_value = session

    mock_runner = MagicMock()
    mock_runner.run_async = MagicMock(
        return_value=_async_gen(_make_event("Hello "), _make_event("world!")),
    )
    mock_get_runner.return_value = mock_runner

    result = await runner_mod.get_agent_response("u1", "hi")
    assert result == "Hello world!"


@patch("gateway.runner._get_runner")
@patch("gateway.runner.create_or_get_session")
async def test_empty_response_returns_fallback(
    mock_session: AsyncMock,
    mock_get_runner: MagicMock,
) -> None:
    session = MagicMock()
    session.id = "sess_2"
    mock_session.return_value = session

    mock_runner = MagicMock()
    mock_runner.run_async = MagicMock(
        return_value=_async_gen(_make_empty_event()),
    )
    mock_get_runner.return_value = mock_runner

    result = await runner_mod.get_agent_response("u2", "nothing")
    assert "couldn't generate" in result.lower()

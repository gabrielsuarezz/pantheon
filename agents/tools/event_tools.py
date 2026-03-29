"""Event emission helper — thin wrapper around POST /events on Hephaestus.

All agent tools call emit_event() before and after execution.
Failures are logged at DEBUG level and silently swallowed — event emission
must never block or crash a tool invocation.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from sandbox.models import AgentName, EventType, PantheonEvent

logger = logging.getLogger("pantheon.events")

_SANDBOX_URL: str = os.getenv("SANDBOX_API_URL", "http://localhost:9000")


async def emit_event(
    event_type: str,
    *,
    agent: str | None = None,
    tool: str | None = None,
    job_id: str | None = None,
    payload: str | None = None,
) -> None:
    """Fire-and-forget: emit a PantheonEvent to the Hephaestus EventBus.

    LLM callers pass payload as a JSON string e.g. '{"from": "zeus", "to": "athena"}'.
    Programmatic callers (bot.py, worker.py) also pass a JSON string via json.dumps().
    """
    parsed: dict[str, Any] = {}
    if payload:
        try:
            parsed = json.loads(payload) if isinstance(payload, str) else payload
        except (json.JSONDecodeError, TypeError):
            parsed = {"raw": str(payload)}

    event = PantheonEvent(
        type=EventType(event_type.lower()),
        agent=AgentName(agent.lower()) if agent else None,
        tool=tool,
        job_id=job_id,
        payload=parsed,
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

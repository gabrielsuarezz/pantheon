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
    payload: dict[str, Any] | None = None,  # Any: payload schema varies per EventType
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

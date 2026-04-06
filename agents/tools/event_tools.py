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
    event_type: str | EventType,
    *,
    agent: str | AgentName | None = None,
    tool: str | None = None,
    job_id: str | None = None,
    payload: str | dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget: emit a PantheonEvent to the Hephaestus EventBus.

    Accepts both raw strings (from LLM callers) and enum values (from
    programmatic callers like callbacks, worker.py, etc.).
    Payload may be a JSON string or a dict — both are handled.
    """
    parsed: dict[str, Any] = {}
    if payload:
        if isinstance(payload, dict):
            parsed = payload
        elif isinstance(payload, str):
            try:
                parsed = json.loads(payload)
            except (json.JSONDecodeError, TypeError):
                parsed = {"raw": payload}
        else:
            parsed = {"raw": str(payload)}

    # Normalize enums to their string values for the Pydantic constructors.
    et_str: str = event_type.value if isinstance(event_type, EventType) else event_type
    agent_str: str | None = None
    if agent is not None:
        agent_str = agent.value if isinstance(agent, AgentName) else agent

    event = PantheonEvent(
        type=EventType(et_str.lower()),
        agent=AgentName(agent_str.lower()) if agent_str else None,
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
        logger.warning("event emit failed (non-fatal): %s", exc)

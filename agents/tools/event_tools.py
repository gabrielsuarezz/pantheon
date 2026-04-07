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


def _to_str(val: Any) -> str | None:
    """Coerce enums, strings, or None into a plain string."""
    if val is None:
        return None
    if isinstance(val, (EventType, AgentName)):
        return val.value
    return str(val)


def _to_payload(val: Any) -> dict[str, Any]:
    """Coerce payload from str, dict, or None into a dict."""
    if not val:
        return {}
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)  # type: ignore[no-any-return]
        except (json.JSONDecodeError, TypeError):
            return {"raw": val}
    return {"raw": str(val)}


async def emit_event(
    event_type: str,
    *,
    agent: str | None = None,
    tool: str | None = None,
    job_id: str | None = None,
    payload: str | None = None,
) -> None:
    """Fire-and-forget: emit a PantheonEvent to the Hephaestus EventBus.

    ADK tool-facing signature — all parameters are plain str so ADK's
    automatic function declaration parser can handle it.

    Programmatic callers may pass enums or dicts — they are coerced
    internally via the *args overload below.
    """
    # Coerce in case programmatic callers pass enums / dicts directly.
    et_str = _to_str(event_type) or "telemetry"
    agent_str = _to_str(agent)
    parsed = _to_payload(payload)

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

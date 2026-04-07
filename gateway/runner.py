"""Hermes — ADK runner bridge.

Sends user messages to Zeus (ADK pipeline) when available, falling back
to the ElevenLabs Conversational AI agent for intelligent responses.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re

from google.adk.runners import Runner
from google.genai import types

from gateway.session import APP_NAME, create_or_get_session, get_session_service

logger = logging.getLogger(__name__)

# Lazy singleton — initialised on first call via _get_runner().
_runner: Runner | None = None
_use_elevenlabs_agent: bool | None = None


def _looks_like_pantheon_activation(text: str) -> bool:
    """Return True when user intent clearly asks to run Pantheon analysis."""
    lowered = text.lower()
    activation_markers = (
        "start pantheon",
        "run pantheon",
        "activate pantheon",
        "analyze malware",
        "analyse malware",
        "analyze the malware",
        "analyse the malware",
        "analyze sample",
        "analyse sample",
        "analyze the sample",
        "analyse the sample",
        "run analysis",
        "the malware",
        "start analysis",
        "begin analysis",
    )
    return any(marker in lowered for marker in activation_markers)


def _looks_like_malware_sample_prompt(text: str) -> bool:
    """True for Hermes file-upload / voice analyze prompts (must use ADK swarm only)."""
    return text.lower().strip().startswith("analyze the malware sample at ")


def _has_elevenlabs_agent() -> bool:
    """Check whether we should route through ElevenLabs Conversational AI."""
    global _use_elevenlabs_agent
    if _use_elevenlabs_agent is None:
        _use_elevenlabs_agent = bool(os.getenv("ELEVENLABS_AGENT_ID"))
    return _use_elevenlabs_agent


def _load_zeus() -> object:
    """Import the Zeus agent, falling back to the dev stub for local testing."""
    try:
        from agents.zeus import zeus  # type: ignore[import-untyped,unused-ignore]

        if zeus is not None:
            return zeus
    except (ImportError, AttributeError):
        pass

    try:
        from agents._dev_stub import zeus as stub_zeus  # type: ignore[import-untyped,unused-ignore]

        logger.warning("Real Zeus not found — using development stub agent")
        return stub_zeus
    except ImportError:
        raise RuntimeError(
            "Neither agents/zeus.py nor agents/_dev_stub.py provides a Zeus agent. "
            "Ask Pablo for the real Zeus or create agents/_dev_stub.py for local testing."
        ) from None


def _get_runner() -> Runner:
    """Build (or return) the ADK Runner wired to Zeus."""
    global _runner
    if _runner is None:
        from google.adk.agents import BaseAgent

        zeus = _load_zeus()
        assert isinstance(zeus, BaseAgent)

        _runner = Runner(
            agent=zeus,
            app_name=APP_NAME,
            session_service=get_session_service(),
        )
    return _runner


async def _run_via_adk(user_id: str, text: str) -> str:
    """Send through the ADK Runner (Zeus -> Athena -> Hades -> ...)."""
    from agents.tools.event_tools import emit_event
    from sandbox.models import AgentName, EventType

    # Emit Zeus activation so the dashboard shows the orchestrator lighting up.
    await emit_event(
        EventType.AGENT_ACTIVATED.value,
        agent=AgentName.ZEUS.value,
    )

    session = await create_or_get_session(user_id)
    runner = _get_runner()

    message = types.Content(
        role="user",
        parts=[types.Part(text=text)],
    )

    response_parts: list[str] = []
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session.id,
        new_message=message,
    ):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    response_parts.append(part.text)

    if not response_parts:
        logger.warning("Zeus returned an empty response for user %s", user_id)
        await emit_event(
            EventType.AGENT_COMPLETED.value,
            agent=AgentName.ZEUS.value,
            payload='{"status": "empty"}',
        )
        return ""

    result = "".join(response_parts)

    # Emit Zeus completion so the dashboard marks the orchestrator as done.
    await emit_event(
        EventType.AGENT_COMPLETED.value,
        agent=AgentName.ZEUS.value,
    )

    return result


async def _run_via_elevenlabs(text: str) -> str:
    """Send through the ElevenLabs Conversational AI agent."""
    from voice.agent import ask_agent

    return await ask_agent(text)


async def get_zeus_response(user_id: str, text: str) -> str:
    """Public helper for callers that must always use Zeus/ADK."""
    return await _run_via_adk(user_id, text)


_STRICT_ADK_FAILURE_MESSAGE = (
    "Pantheon analysis did not finish: the ADK swarm returned no response or hit an error. "
    "Verify OPENROUTER_API_KEY, SANDBOX_API_URL, and that Hephaestus is running; "
    "then send /reset and try again."
)


def _is_rate_limit_error(exc: BaseException) -> bool:
    """True when *exc* indicates OpenRouter / LiteLLM quota exhaustion."""
    try:
        from openai import RateLimitError

        if isinstance(exc, RateLimitError):
            return True
    except ImportError:
        pass
    text = str(exc).lower()
    return "429" in text or "rate limit" in text or "resource exhausted" in text


def _requires_strict_adk_only(text: str, *, force_adk: bool) -> bool:
    """Malware analysis paths must not fall through to ElevenLabs (different brain, no swarm)."""
    return (
        force_adk
        or _looks_like_pantheon_activation(text)
        or _looks_like_malware_sample_prompt(text)
    )


async def get_agent_response(user_id: str, text: str, *, force_adk: bool = False) -> str:
    """Send *text* to the best available agent and return the full reply.

    Priority:
    1. ADK pipeline via Zeus (real or stub) — always preferred so the full
       multi-agent swarm runs and dashboard events are emitted.
    2. ElevenLabs Conversational AI agent — fallback only when ADK fails or is
       empty *and* the message is not a malware-analysis activation.

    Analysis-style prompts (file upload wording, ``force_adk=True``, or explicit
    analyze/triage phrasing) never use ElevenLabs fallback.
    """
    strict_adk = _requires_strict_adk_only(text, force_adk=force_adk)

    # --- Always try ADK pipeline first (Zeus → Athena → Hades → ...) ---
    # Retry once on 429 RESOURCE_EXHAUSTED — parse the retry-after delay from
    # the error and wait before attempting again.
    for attempt in range(2):
        try:
            response = await _run_via_adk(user_id, text)
            if response:
                return response
            logger.warning("ADK pipeline returned empty for user %s", user_id)
            break
        except Exception as exc:
            if _is_rate_limit_error(exc) and attempt == 0:
                # Extract retry delay suggested by the API (default 40 s).
                match = re.search(r"retry in (\d+)", str(exc), re.IGNORECASE)
                wait = int(match.group(1)) + 2 if match else 40
                logger.warning(
                    "ADK pipeline hit model quota (429) for user %s — retrying in %ds",
                    user_id, wait,
                )
                await asyncio.sleep(wait)
                continue
            logger.exception("ADK pipeline failed for user %s", user_id)
            break

    if strict_adk:
        return _STRICT_ADK_FAILURE_MESSAGE

    # --- Fall back to ElevenLabs agent (conversational only) ---
    if _has_elevenlabs_agent():
        try:
            response = await _run_via_elevenlabs(text)
            if response:
                return response
            logger.warning("ElevenLabs agent returned empty")
        except Exception:
            logger.exception("ElevenLabs agent fallback also failed for user %s", user_id)

    return "I couldn't generate a response. Please try again or send /reset."

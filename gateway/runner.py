"""Hermes — ADK runner bridge.

Sends user messages to Zeus (ADK pipeline) when available, falling back
to the ElevenLabs Conversational AI agent for intelligent responses.
"""

from __future__ import annotations

import logging
import os

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
        "analyze sample",
        "analyse sample",
        "run analysis",
    )
    return any(marker in lowered for marker in activation_markers)


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
        return ""

    return "".join(response_parts)


async def _run_via_elevenlabs(text: str) -> str:
    """Send through the ElevenLabs Conversational AI agent."""
    from voice.agent import ask_agent

    return await ask_agent(text)


async def get_zeus_response(user_id: str, text: str) -> str:
    """Public helper for callers that must always use Zeus/ADK."""
    return await _run_via_adk(user_id, text)


async def get_agent_response(user_id: str, text: str, *, force_adk: bool = False) -> str:
    """Send *text* to the best available agent and return the full reply.

    Priority:
    1. ElevenLabs Conversational AI agent (if ELEVENLABS_AGENT_ID is set)
    2. ADK pipeline via Zeus (real or stub)

    If the primary fails, falls back to the other. The user always gets
    a response.
    """
    if force_adk or _looks_like_pantheon_activation(text):
        try:
            response = await _run_via_adk(user_id, text)
            if response:
                return response
        except Exception:
            logger.exception("Forced ADK route failed for user %s", user_id)

    # --- Try ElevenLabs agent first (intelligent responses) ---
    if _has_elevenlabs_agent():
        try:
            response = await _run_via_elevenlabs(text)
            if response:
                return response
            logger.warning("ElevenLabs agent returned empty — falling back to ADK")
        except Exception:
            logger.exception("ElevenLabs agent failed — falling back to ADK")

    # --- Fall back to ADK pipeline ---
    try:
        response = await _run_via_adk(user_id, text)
        if response:
            return response
    except Exception:
        logger.exception("ADK pipeline failed for user %s", user_id)

    return "I couldn't generate a response. Please try again or send /reset."

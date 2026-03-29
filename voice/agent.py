"""ElevenLabs Conversational AI agent bridge.

Opens a WebSocket session to the ElevenLabs agent, sends a text message,
waits for the agent's full response, and returns it.  No microphone or
speaker needed — we handle audio separately via TTS/STT in client.py.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from typing import Any

from elevenlabs import AsyncElevenLabs
from elevenlabs.conversational_ai.conversation import (
    AsyncAudioInterface,
    AsyncConversation,
)

logger = logging.getLogger(__name__)

_RESPONSE_TIMEOUT = 30
_WS_CONNECT_TIMEOUT = 10


class _SilentAudio(AsyncAudioInterface):
    """No-op audio interface — we pipe text, not real audio."""

    async def start(self, input_callback: Any) -> None:
        """No mic input needed."""

    async def stop(self) -> None:
        """Nothing to tear down."""

    async def output(self, audio: bytes) -> None:
        """Discard agent audio — we synthesise our own via TTS."""

    async def interrupt(self) -> None:
        """No playback to interrupt."""


async def _wait_for_ws(conversation: AsyncConversation) -> bool:
    """Poll until the WebSocket is connected or timeout."""
    for _ in range(int(_WS_CONNECT_TIMEOUT * 20)):  # check every 50ms
        if conversation._ws is not None:
            return True
        await asyncio.sleep(0.05)
    return False


async def ask_agent(text: str) -> str:
    """Send *text* to the ElevenLabs Conversational AI agent and return its reply."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    agent_id = os.getenv("ELEVENLABS_AGENT_ID")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set")
    if not agent_id:
        raise RuntimeError("ELEVENLABS_AGENT_ID is not set")

    client = AsyncElevenLabs(api_key=api_key)

    response_chunks: list[str] = []
    response_done = asyncio.Event()

    async def on_agent_response(text_chunk: str) -> None:
        response_chunks.append(text_chunk)
        # Reset a timer — if no new chunk arrives for 2s, we're done.
        response_done.set()

    async def on_session_end() -> None:
        response_done.set()

    conversation = AsyncConversation(
        client=client,  # type: ignore[arg-type]
        agent_id=agent_id,
        requires_auth=False,
        audio_interface=_SilentAudio(),
        callback_agent_response=on_agent_response,
        callback_end_session=on_session_end,
    )

    try:
        # start_session fires a background task; we must wait for the WS.
        await conversation.start_session()  # type: ignore[no-untyped-call]

        if not await _wait_for_ws(conversation):
            logger.error("WebSocket did not connect within %ds", _WS_CONNECT_TIMEOUT)
            return ""

        # Small delay to let the initiation handshake complete.
        await asyncio.sleep(0.5)

        await conversation.send_user_message(text)
        logger.info("Sent message to ElevenLabs agent: %s", text)

        # Wait for the agent to respond. The agent may send multiple chunks,
        # so we wait for the done event, then give a short grace period for
        # any trailing chunks.
        try:
            await asyncio.wait_for(
                response_done.wait(), timeout=_RESPONSE_TIMEOUT,
            )
            # Grace period for trailing chunks.
            await asyncio.sleep(2)
        except TimeoutError:
            logger.warning(
                "Agent response timed out after %ds", _RESPONSE_TIMEOUT,
            )
    finally:
        with contextlib.suppress(Exception):
            await conversation.end_session()  # type: ignore[no-untyped-call]

    if response_chunks:
        full = " ".join(response_chunks)
        logger.info("ElevenLabs agent responded: %s", full[:200])
        return full

    return ""

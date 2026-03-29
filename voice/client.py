from __future__ import annotations

import os
from typing import Final

import httpx
from google.genai import types

from agents.model_config import MUSE_STT_MODEL, get_genai_client
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType
from voice.exceptions import SpeechError, TranscriptionError
from voice.personas import ZEUS_VOICE_ID

_ELEVENLABS_BASE_URL: Final[str] = "https://api.elevenlabs.io/v1"
_STT_MODEL: Final[str] = "scribe_v2"
_TTS_MODEL: Final[str] = "eleven_multilingual_v2"
_TTS_OUTPUT_FORMAT: Final[str] = "opus_48000_128"
_GEMINI_AUDIO_MODEL: Final[str] = MUSE_STT_MODEL
_TIMEOUT: Final[httpx.Timeout] = httpx.Timeout(60.0)


def _get_elevenlabs_api_key() -> str:
    """Get ElevenLabs API key from environment."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        # Fallback to current .env name if needed, but prefer _KEY
        api_key = os.getenv("ELEVENLABS_API")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY is not set")
    return api_key


async def transcribe(audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
    """Transcribe audio to text via ElevenLabs STT with Gemini fallback."""
    if not audio_bytes:
        raise TranscriptionError("Empty audio payload")

    # Muse starts transcription
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.MUSE,
        tool="transcribe",
        payload={"mime_type": mime_type, "size_bytes": len(audio_bytes)},
    )

    try:
        response_text = await _transcribe_elevenlabs(audio_bytes, mime_type)
        await emit_event(
            EventType.TOOL_RESULT,
            agent=AgentName.MUSE,
            tool="transcribe",
            payload={"text_preview": response_text[:50], "chars": len(response_text)},
        )
        return response_text
    except Exception as exc:
        try:
            response_text = await _transcribe_gemini(audio_bytes, mime_type)
            await emit_event(
                EventType.TOOL_RESULT,
                agent=AgentName.MUSE,
                tool="transcribe",
                payload={
                    "text_preview": response_text[:50],
                    "chars": len(response_text),
                    "method": "gemini_fallback",
                },
            )
            return response_text
        except Exception as gemini_exc:  # pragma: no cover
            message = (
                "Transcription failed with ElevenLabs and Gemini: "
                f"{exc.__class__.__name__}: {exc}; "
                f"{gemini_exc.__class__.__name__}: {gemini_exc}"
            )
            # Never log audio bytes or transcription content as per AGENTS.md
            raise TranscriptionError(message) from gemini_exc


async def speak(text: str, voice_id: str | None = None) -> bytes:
    """Convert text to speech with ElevenLabs and return OGG/Opus bytes."""
    if not text.strip():
        raise SpeechError("Text must be non-empty")

    api_key = _get_elevenlabs_api_key()
    resolved_voice_id = voice_id or ZEUS_VOICE_ID
    url = f"{_ELEVENLABS_BASE_URL}/text-to-speech/{resolved_voice_id}"

    headers = {
        "xi-api-key": api_key,
        "accept": "audio/ogg",
    }
    params = {"output_format": _TTS_OUTPUT_FORMAT}
    payload = {
        "text": text,
        "model_id": _TTS_MODEL,
    }

    # Muse starts TTS
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.MUSE,
        tool="speak",
        payload={"text_preview": text[:50], "chars": len(text), "voice_id": resolved_voice_id},
    )

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(url, headers=headers, params=params, json=payload)
        try:
            response.raise_for_status()
            audio_content = response.content
            await emit_event(
                EventType.TOOL_RESULT,
                agent=AgentName.MUSE,
                tool="speak",
                payload={"audio_size_bytes": len(audio_content)},
            )
            return audio_content
        except httpx.HTTPStatusError as exc:  # pragma: no cover
            await emit_event(
                EventType.ERROR,
                agent=AgentName.MUSE,
                payload={"error": f"ElevenLabs TTS failed: {exc}"},
            )
            raise SpeechError(f"ElevenLabs TTS failed: {exc}") from exc


async def _transcribe_elevenlabs(audio_bytes: bytes, mime_type: str) -> str:
    """Internal ElevenLabs STT implementation."""
    api_key = _get_elevenlabs_api_key()
    url = f"{_ELEVENLABS_BASE_URL}/speech-to-text"

    headers = {"xi-api-key": api_key}
    data = {"model_id": _STT_MODEL}
    files = {
        "file": ("audio.ogg", audio_bytes, mime_type),
    }

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(url, headers=headers, data=data, files=files)
        response.raise_for_status()

    payload = response.json()
    text = str(payload.get("text", "")).strip()
    if not text:
        raise TranscriptionError("ElevenLabs STT returned empty text")
    return text


async def _transcribe_gemini(audio_bytes: bytes, mime_type: str) -> str:
    """Internal Gemini STT fallback implementation using recommended model."""
    client = get_genai_client()
    response = await client.aio.models.generate_content(
        model=_GEMINI_AUDIO_MODEL,
        contents=[
            "Transcribe the following audio into plain text. Do not add commentary.",
            types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
        ],
    )

    text = (response.text or "").strip()
    if not text:
        raise TranscriptionError("Gemini STT returned empty text")
    return text

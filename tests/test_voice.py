"""Tests for voice module — ElevenLabs TTS + STT."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from voice import client as voice_client
from voice.exceptions import SpeechError, TranscriptionError


@pytest.fixture(autouse=True)
def _reset_client() -> None:  # type: ignore[misc]
    """Clear cached client between tests."""
    voice_client._client = None


# ---------------------------------------------------------------------------
# transcribe()
# ---------------------------------------------------------------------------


@patch.dict("os.environ", {"ELEVENLABS_API_KEY": "fake-key"})
@patch("voice.client.AsyncElevenLabs")
async def test_transcribe_returns_text(mock_cls: MagicMock) -> None:
    mock_client = AsyncMock()
    mock_cls.return_value = mock_client

    result_obj = MagicMock()
    result_obj.text = "hello world"
    mock_client.speech_to_text.convert = AsyncMock(return_value=result_obj)

    text = await voice_client.transcribe(b"fake-audio", "audio/ogg")
    assert text == "hello world"
    mock_client.speech_to_text.convert.assert_awaited_once()


@patch.dict("os.environ", {"ELEVENLABS_API_KEY": "fake-key"})
@patch("voice.client.AsyncElevenLabs")
async def test_transcribe_empty_raises(mock_cls: MagicMock) -> None:
    mock_client = AsyncMock()
    mock_cls.return_value = mock_client

    result_obj = MagicMock()
    result_obj.text = "   "
    mock_client.speech_to_text.convert = AsyncMock(return_value=result_obj)

    with pytest.raises(TranscriptionError, match="empty"):
        await voice_client.transcribe(b"fake-audio")


@patch.dict("os.environ", {"ELEVENLABS_API_KEY": "fake-key"})
@patch("voice.client.AsyncElevenLabs")
async def test_transcribe_api_error_raises(mock_cls: MagicMock) -> None:
    mock_client = AsyncMock()
    mock_cls.return_value = mock_client
    mock_client.speech_to_text.convert = AsyncMock(side_effect=RuntimeError("API down"))

    with pytest.raises(TranscriptionError, match="API down"):
        await voice_client.transcribe(b"fake-audio")


# ---------------------------------------------------------------------------
# speak()
# ---------------------------------------------------------------------------


async def _fake_audio_iter() -> None:
    """Helper — we build the real async gen in the test."""


@patch.dict("os.environ", {"ELEVENLABS_API_KEY": "fake-key"})
@patch("voice.client.AsyncElevenLabs")
async def test_speak_returns_audio_bytes(mock_cls: MagicMock) -> None:
    mock_client = AsyncMock()
    mock_cls.return_value = mock_client

    async def fake_chunks() -> None:  # type: ignore[misc]
        yield b"chunk1"
        yield b"chunk2"

    mock_client.text_to_speech.convert = MagicMock(return_value=fake_chunks())

    audio = await voice_client.speak("hello")
    assert audio == b"chunk1chunk2"


@patch.dict("os.environ", {"ELEVENLABS_API_KEY": "fake-key"})
@patch("voice.client.AsyncElevenLabs")
async def test_speak_empty_audio_raises(mock_cls: MagicMock) -> None:
    mock_client = AsyncMock()
    mock_cls.return_value = mock_client

    async def empty_chunks() -> None:  # type: ignore[misc]
        return
        yield  # type: ignore[misc]

    mock_client.text_to_speech.convert = MagicMock(return_value=empty_chunks())

    with pytest.raises(SpeechError, match="empty"):
        await voice_client.speak("hello")


@patch.dict("os.environ", {"ELEVENLABS_API_KEY": "fake-key"})
@patch("voice.client.AsyncElevenLabs")
async def test_speak_api_error_raises(mock_cls: MagicMock) -> None:
    mock_client = AsyncMock()
    mock_cls.return_value = mock_client
    mock_client.text_to_speech.convert = MagicMock(side_effect=RuntimeError("TTS down"))

    with pytest.raises(SpeechError, match="TTS down"):
        await voice_client.speak("hello")


# ---------------------------------------------------------------------------
# _get_client()
# ---------------------------------------------------------------------------


def test_get_client_missing_key_raises() -> None:
    with patch.dict("os.environ", {}, clear=True):
        import os
        os.environ.pop("ELEVENLABS_API_KEY", None)
        with pytest.raises(RuntimeError, match="ELEVENLABS_API_KEY"):
            voice_client._get_client()

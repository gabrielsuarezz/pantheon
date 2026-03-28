"""Tests for gateway.bot — Telegram bot handlers."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from gateway import bot


@pytest.fixture(autouse=True)
def _clean_active() -> None:  # type: ignore[misc]
    bot._active_analyses.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_update(
    user_id: int = 1,
    text: str | None = None,
    voice: MagicMock | None = None,
    video_note: MagicMock | None = None,
    video: MagicMock | None = None,
    document: MagicMock | None = None,
) -> MagicMock:
    """Build a minimal mock Telegram Update."""
    update = MagicMock(spec_set=["effective_user", "effective_chat", "message"])
    update.effective_user = MagicMock()
    update.effective_user.id = user_id
    update.effective_chat = AsyncMock()
    update.effective_chat.send_message = AsyncMock()
    update.effective_chat.send_action = AsyncMock()
    update.effective_chat.send_voice = AsyncMock()

    update.message = MagicMock()
    update.message.text = text
    update.message.voice = voice
    update.message.video_note = video_note
    update.message.video = video
    update.message.document = document
    return update


# ---------------------------------------------------------------------------
# /start, /reset, /status
# ---------------------------------------------------------------------------

async def test_cmd_start_sends_welcome() -> None:
    update = _make_update()
    await bot.cmd_start(update, MagicMock())
    update.effective_chat.send_message.assert_awaited_once()
    msg: str = update.effective_chat.send_message.call_args[0][0]
    assert "Pantheon" in msg


@patch("gateway.bot.reset_session", new_callable=AsyncMock)
async def test_cmd_reset_clears_session(mock_reset: AsyncMock) -> None:
    update = _make_update(user_id=42)
    await bot.cmd_reset(update, MagicMock())
    mock_reset.assert_awaited_once_with("42")
    update.effective_chat.send_message.assert_awaited_once()


async def test_cmd_status_no_active() -> None:
    update = _make_update(user_id=7)
    await bot.cmd_status(update, MagicMock())
    msg: str = update.effective_chat.send_message.call_args[0][0]
    assert "No active" in msg


async def test_cmd_status_active() -> None:
    bot._active_analyses.add("7")
    update = _make_update(user_id=7)
    await bot.cmd_status(update, MagicMock())
    msg: str = update.effective_chat.send_message.call_args[0][0]
    assert "running" in msg.lower()


# ---------------------------------------------------------------------------
# Text handler
# ---------------------------------------------------------------------------

@patch("gateway.bot.speak", new_callable=AsyncMock, return_value=b"audio")
@patch("gateway.bot.get_agent_response", new_callable=AsyncMock, return_value="Zeus says hi")
async def test_handle_text(mock_agent: AsyncMock, mock_speak: AsyncMock) -> None:
    update = _make_update(user_id=10, text="hello")
    await bot.handle_text(update, MagicMock())
    mock_agent.assert_awaited_once_with("10", "hello")
    update.effective_chat.send_message.assert_awaited()
    # Text replies now also include voice.
    mock_speak.assert_awaited_once()
    update.effective_chat.send_voice.assert_awaited_once()


# ---------------------------------------------------------------------------
# Document handler
# ---------------------------------------------------------------------------

@patch("gateway.bot.speak", new_callable=AsyncMock, return_value=b"audio")
@patch("gateway.bot.get_agent_response", new_callable=AsyncMock, return_value="Analysis complete")
async def test_handle_document_accepted_ext(
    mock_agent: AsyncMock, mock_speak: AsyncMock, tmp_path: Path,
) -> None:
    doc = MagicMock()
    doc.file_name = "sample.js"
    tg_file = AsyncMock()
    tg_file.download_to_drive = AsyncMock()
    doc.get_file = AsyncMock(return_value=tg_file)

    update = _make_update(user_id=20, document=doc)

    with patch.object(bot, "SAMPLES_DIR", tmp_path):
        await bot.handle_document(update, MagicMock())

    # Should have sent the "Received" acknowledgement + the analysis reply.
    assert update.effective_chat.send_message.await_count >= 2
    mock_agent.assert_awaited_once()


async def test_handle_document_rejected_ext() -> None:
    doc = MagicMock()
    doc.file_name = "readme.txt"

    update = _make_update(user_id=30, document=doc)
    await bot.handle_document(update, MagicMock())

    msg: str = update.effective_chat.send_message.call_args[0][0]
    assert "Unsupported" in msg


# ---------------------------------------------------------------------------
# Voice / video handlers
# ---------------------------------------------------------------------------

def _make_audio_update(user_id: int = 1, media_attr: str = "voice") -> MagicMock:
    """Build a mock Update with downloadable audio media."""
    media = MagicMock()
    tg_file = AsyncMock()
    tg_file.download_as_bytearray = AsyncMock(return_value=bytearray(b"fake-audio"))
    media.get_file = AsyncMock(return_value=tg_file)

    update = _make_update(user_id=user_id, **{media_attr: media})
    return update


@patch("gateway.bot.speak", new_callable=AsyncMock, return_value=b"audio")
@patch("gateway.bot.get_agent_response", new_callable=AsyncMock, return_value="agent reply")
@patch("gateway.bot.transcribe", new_callable=AsyncMock, return_value="hello world")
async def test_handle_voice_full_pipeline(
    mock_transcribe: AsyncMock, mock_agent: AsyncMock, mock_speak: AsyncMock,
) -> None:
    update = _make_audio_update(user_id=5, media_attr="voice")
    await bot.handle_voice(update, MagicMock())
    mock_transcribe.assert_awaited_once()
    mock_agent.assert_awaited_once_with("5", "hello world")
    # Should send "I heard: ..." + agent text + voice.
    assert update.effective_chat.send_message.await_count >= 2


@patch("gateway.bot.speak", new_callable=AsyncMock, return_value=b"audio")
@patch("gateway.bot.get_agent_response", new_callable=AsyncMock, return_value="reply")
@patch("gateway.bot.transcribe", new_callable=AsyncMock, return_value="test")
async def test_handle_video_note(
    mock_transcribe: AsyncMock, mock_agent: AsyncMock, mock_speak: AsyncMock,
) -> None:
    update = _make_audio_update(user_id=6, media_attr="video_note")
    await bot.handle_video_note(update, MagicMock())
    mock_transcribe.assert_awaited_once()
    mock_agent.assert_awaited_once()


@patch("gateway.bot.transcribe", new_callable=AsyncMock, side_effect=RuntimeError("STT failed"))
async def test_handle_voice_transcription_failure(mock_transcribe: AsyncMock) -> None:
    update = _make_audio_update(user_id=7, media_attr="voice")
    await bot.handle_voice(update, MagicMock())
    # Should still send an error message to the user.
    msg: str = update.effective_chat.send_message.call_args[0][0]
    assert "couldn't understand" in msg.lower()


async def test_handle_voice_no_media() -> None:
    update = _make_update(user_id=8)
    update.message.voice = None
    update.message.video_note = None
    update.message.video = None
    await bot.handle_voice(update, MagicMock())
    msg: str = update.effective_chat.send_message.call_args[0][0]
    assert "couldn't read" in msg.lower()


# ---------------------------------------------------------------------------
# /call
# ---------------------------------------------------------------------------

@patch.object(bot, "WEBAPP_BASE_URL", "")
async def test_cmd_call_no_url_configured() -> None:
    update = _make_update()
    await bot.cmd_call(update, MagicMock())
    msg: str = update.effective_chat.send_message.call_args[0][0]
    assert "not configured" in msg.lower()


@patch.object(bot, "WEBAPP_BASE_URL", "https://example.com")
async def test_cmd_call_sends_button() -> None:
    update = _make_update()
    await bot.cmd_call(update, MagicMock())
    call_kwargs = update.effective_chat.send_message.call_args
    assert call_kwargs is not None
    assert "reply_markup" in call_kwargs.kwargs


# ---------------------------------------------------------------------------
# Voice fallback — if TTS fails, text is still sent
# ---------------------------------------------------------------------------

@patch("gateway.bot.speak", new_callable=AsyncMock, side_effect=RuntimeError("TTS down"))
@patch("gateway.bot.get_agent_response", new_callable=AsyncMock, return_value="text reply")
async def test_voice_failure_still_sends_text(
    mock_agent: AsyncMock, mock_speak: AsyncMock,
) -> None:
    update = _make_update(user_id=10, text="hello")
    await bot.handle_text(update, MagicMock())
    # Text was sent even though TTS failed.
    update.effective_chat.send_message.assert_awaited()


# ---------------------------------------------------------------------------
# build_app
# ---------------------------------------------------------------------------

def test_build_app_requires_token() -> None:
    with patch.dict(os.environ, {}, clear=True):
        # Remove the var if it somehow exists.
        os.environ.pop("TELEGRAM_BOT_TOKEN", None)
        with pytest.raises(RuntimeError, match="TELEGRAM_BOT_TOKEN"):
            bot.build_app()


@patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "fake:token"})
def test_build_app_returns_application() -> None:
    app = bot.build_app()
    assert app is not None

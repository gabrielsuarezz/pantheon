"""Hermes — Telegram bot handlers.

The sole user interface for Pantheon.  Handles text, voice, file uploads,
and the /start, /reset, /status commands.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from gateway.runner import get_agent_response
from gateway.session import reset_session
from voice.client import speak, transcribe

logger = logging.getLogger(__name__)

# Track which users have an analysis in flight.
_active_analyses: set[str] = set()

SAMPLES_DIR = Path(os.getenv("SAMPLES_DIR", "/tmp/samples"))
ALLOWED_EXTENSIONS = frozenset({".malicious", ".js", ".zip", ".exe"})
LONG_ANALYSIS_SECONDS = 10


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Greet the user and explain Pantheon's capabilities."""
    assert update.effective_chat is not None
    await update.effective_chat.send_message(
        "⚡ *Welcome to Pantheon*\n\n"
        "I'm Hermes, your gateway to the gods of malware analysis.\n\n"
        "• Send me a malware sample (`.js`, `.exe`, `.zip`, `.malicious`) "
        "and I'll have the pantheon analyze it.\n"
        "• Send a voice message to talk to me.\n"
        "• Send text to ask questions about threats.\n\n"
        "Commands:\n"
        "/start — this message\n"
        "/call — live voice conversation with the agent\n"
        "/reset — clear your session\n"
        "/status — check if an analysis is running",
        parse_mode=ParseMode.MARKDOWN,
    )


async def cmd_reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Clear the user's ADK session."""
    assert update.effective_user is not None
    assert update.effective_chat is not None
    user_id = str(update.effective_user.id)
    await reset_session(user_id)
    await update.effective_chat.send_message("Session cleared. Send a new message to start fresh.")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Report whether an analysis is currently running."""
    assert update.effective_user is not None
    assert update.effective_chat is not None
    user_id = str(update.effective_user.id)
    if user_id in _active_analyses:
        await update.effective_chat.send_message("⏳ An analysis is currently running.")
    else:
        await update.effective_chat.send_message("✅ No active analysis. Send me a sample!")


WEBAPP_BASE_URL: str = os.getenv("WEBAPP_BASE_URL", "")


async def cmd_call(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Launch the real-time voice call Mini App inside Telegram."""
    assert update.effective_chat is not None
    if not WEBAPP_BASE_URL:
        await update.effective_chat.send_message(
            "Voice calls are not configured. Set WEBAPP_BASE_URL in .env.",
        )
        return

    from telegram import WebAppInfo

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            "📞 Start Voice Call",
            web_app=WebAppInfo(url=f"{WEBAPP_BASE_URL}/call"),
        )],
    ])
    await update.effective_chat.send_message(
        "🎙️ *Talk to Pantheon*\n\n"
        "Tap the button below to start a live voice conversation "
        "with the AI agent. You can discuss threats, request analysis, "
        "and hear real-time reports.",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=keyboard,
    )


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------

async def _send_with_typing(
    update: Update,
    user_id: str,
    prompt: str,
) -> None:
    """Run the agent pipeline with a typing indicator and an intermediate
    status message if the response takes longer than *LONG_ANALYSIS_SECONDS*.
    """
    assert update.effective_chat is not None
    chat = update.effective_chat

    _active_analyses.add(user_id)
    try:
        # Fire off the agent call and a delayed status update concurrently.
        response_task = asyncio.create_task(get_agent_response(user_id, prompt))

        # Typing indicator — Telegram shows "typing…" for ~5 s per call.
        await chat.send_action(ChatAction.TYPING)

        # If the response hasn't arrived after LONG_ANALYSIS_SECONDS, send a
        # heads-up so the user knows we're still working.
        done, _ = await asyncio.wait({response_task}, timeout=LONG_ANALYSIS_SECONDS)
        if not done:
            await chat.send_message("🔬 Analysis in progress — Hades is examining the sample…")
            await chat.send_action(ChatAction.TYPING)

        response_text = await response_task

        # Always send the text response first.
        await chat.send_message(response_text)

        # Then send a voice version alongside it.
        try:
            audio_bytes = await speak(response_text)
            await chat.send_voice(voice=audio_bytes)
        except Exception:
            logger.exception("Voice synthesis failed — text already sent")

    finally:
        _active_analyses.discard(user_id)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Forward a plain-text message to Zeus and reply with the result."""
    assert update.effective_user is not None
    assert update.message is not None and update.message.text is not None
    user_id = str(update.effective_user.id)
    await _send_with_typing(update, user_id, update.message.text)


async def _handle_audio_input(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    mime_type: str = "audio/ogg",
) -> None:
    """Shared handler for voice messages, video notes, and video messages.

    1. Download audio  2. Transcribe  3. Send to Zeus  4. Reply with voice
    Every step has a fallback so the user ALWAYS gets a response.
    """
    assert update.effective_user is not None
    assert update.effective_chat is not None
    assert update.message is not None
    user_id = str(update.effective_user.id)
    chat = update.effective_chat

    await chat.send_action(ChatAction.TYPING)

    # --- Download audio from whichever message type sent it ---
    msg = update.message
    media = msg.voice or msg.video_note or msg.video
    if media is None:
        await chat.send_message("I couldn't read that media. Try again?")
        return

    try:
        tg_file = await media.get_file()
        raw = await tg_file.download_as_bytearray()
        audio_bytes = bytes(raw)
    except Exception:
        logger.exception("Failed to download audio for user %s", user_id)
        await chat.send_message(
            "I couldn't download that audio. Please try again.",
        )
        return

    # --- Transcribe ---
    try:
        transcribed = await transcribe(audio_bytes, mime_type)
        logger.info("Transcribed audio for user %s: %s", user_id, transcribed)
    except Exception:
        logger.exception("Transcription failed for user %s", user_id)
        await chat.send_message(
            "I couldn't understand that audio. "
            "Please try again or send your question as text.",
        )
        return

    await chat.send_message(f'🎙️ I heard: "{transcribed}"')
    await _send_with_typing(update, user_id, transcribed)


async def handle_voice(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle a standard voice message (hold mic button)."""
    await _handle_audio_input(update, context, "audio/ogg")


async def handle_video_note(
    update: Update, context: ContextTypes.DEFAULT_TYPE,
) -> None:
    """Handle a video note (round circle camera recording)."""
    await _handle_audio_input(update, context, "audio/ogg")


async def handle_video(
    update: Update, context: ContextTypes.DEFAULT_TYPE,
) -> None:
    """Handle a video message."""
    await _handle_audio_input(update, context, "audio/mp4")


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Save an uploaded file and trigger malware analysis."""
    assert update.effective_user is not None
    assert update.effective_chat is not None
    assert update.message is not None and update.message.document is not None

    user_id = str(update.effective_user.id)
    chat = update.effective_chat
    doc = update.message.document

    filename = doc.file_name or "unknown_sample"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        await chat.send_message(
            f"Unsupported file type `{ext}`. "
            f"Accepted: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
        return

    # Save to shared samples volume.
    user_dir = SAMPLES_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_dir / filename

    tg_file = await doc.get_file()
    await tg_file.download_to_drive(str(file_path))

    await chat.send_message(
        f"📁 Received *{filename}* — starting analysis…",
        parse_mode=ParseMode.MARKDOWN,
    )

    prompt = f"analyze the malware sample at {file_path}"
    await _send_with_typing(update, user_id, prompt)


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def build_app() -> Application:  # type: ignore[type-arg]
    """Construct and return a configured Telegram Application (not yet running)."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN environment variable is not set")

    app: Application = Application.builder().token(token).build()  # type: ignore[type-arg]

    # Global error handler — user always gets feedback.
    async def error_handler(
        update: object, ctx: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        logger.error("Unhandled exception: %s", ctx.error, exc_info=ctx.error)
        if isinstance(update, Update) and update.effective_chat:
            try:
                await update.effective_chat.send_message(
                    "Something went wrong. Please try again or use /reset.",
                )
            except Exception:
                logger.exception("Failed to send error message to user")

    app.add_error_handler(error_handler)

    # Commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("reset", cmd_reset))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("call", cmd_call))

    # Audio handlers — voice, video note (circle), and video.
    app.add_handler(MessageHandler(filters.VOICE, handle_voice))
    app.add_handler(MessageHandler(filters.VIDEO_NOTE, handle_video_note))
    app.add_handler(MessageHandler(filters.VIDEO, handle_video))

    # File uploads and text (text last).
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    app.add_handler(MessageHandler(
        filters.TEXT & ~filters.COMMAND, handle_text,
    ))

    return app

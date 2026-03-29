"""Voice persona configuration."""

from __future__ import annotations

import os

# Default is a public demo voice; override via ELEVENLABS_VOICE_ID in .env.
ZEUS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")


def get_voice_id() -> str:
    """Return the current voice ID, checking env each time for hot-reload."""
    return os.getenv("ELEVENLABS_VOICE_ID") or ZEUS_VOICE_ID

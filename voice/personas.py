from __future__ import annotations

import os

# Default is a public demo voice; override via ELEVENLABS_VOICE_ID in .env.
ZEUS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")

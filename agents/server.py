from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from google.adk.cli.fast_api import get_fast_api_app

_REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = str(_REPO_ROOT / "adk_apps")
SESSION_SERVICE_URI = os.getenv(
    "PANTHEON_ADK_SESSION_SERVICE_URI",
    "sqlite+aiosqlite:///./data/sessions.db",
)
ALLOW_ORIGINS = os.getenv("PANTHEON_ADK_ALLOW_ORIGINS", "*").split(",")

app: FastAPI = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=SESSION_SERVICE_URI,
    allow_origins=ALLOW_ORIGINS,
    web=True,
    a2a=True,
)

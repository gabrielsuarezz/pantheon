"""Pantheon entry point — starts all services."""
from __future__ import annotations

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()


def _check_env() -> None:
    required = ["GOOGLE_API_KEY", "TELEGRAM_BOT_TOKEN", "ELEVENLABS_API_KEY"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in values.")
        sys.exit(1)


def main() -> None:
    _check_env()
    import uvicorn
    from sandbox.main import app
    uvicorn.run(app, host="0.0.0.0", port=9000, log_level="info")


if __name__ == "__main__":
    main()

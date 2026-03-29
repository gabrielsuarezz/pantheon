"""Pantheon entry point — starts all services concurrently.

Services:
    - Hermes Telegram bot (polling mode)
    - Voice call Mini App (FastAPI on WEBAPP_PORT)
    - Hephaestus sandbox API (FastAPI on port 9000)

Usage:
    uv run python run.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv


def _env(*names: str) -> str:
    """Return the first non-empty env var value from *names*."""
    for name in names:
        value = os.getenv(name)
        if value:
            return value
    return ""


def _check_env() -> None:
    """Warn about missing environment variables when strict mode is enabled."""
    if os.getenv("PANTHEON_STRICT_ENV") != "1":
        return

    required = {
        "TELEGRAM_BOT_TOKEN|TELEGRAM_API": _env("TELEGRAM_BOT_TOKEN", "TELEGRAM_API"),
        "ELEVENLABS_API_KEY|ELEVENLABS_API": _env("ELEVENLABS_API_KEY", "ELEVENLABS_API"),
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"Warning: missing environment variables: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in values.")


async def _run_bot() -> None:
    """Start the Telegram bot in polling mode."""
    from gateway.bot import build_app

    tg_app = build_app()
    logging.getLogger(__name__).info("Hermes is online — polling for updates…")

    await tg_app.initialize()
    await tg_app.start()
    await tg_app.updater.start_polling(drop_pending_updates=True)  # type: ignore[union-attr]

    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await tg_app.updater.stop()  # type: ignore[union-attr]
        await tg_app.stop()
        await tg_app.shutdown()


async def _run_webapp() -> None:
    """Start the voice-call Mini App FastAPI server."""
    import uvicorn

    from gateway.webapp import app

    port = int(os.getenv("WEBAPP_PORT", "8443"))
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def _run_sandbox() -> None:
    """Start the Hephaestus sandbox API server."""
    import uvicorn

    from sandbox.main import app

    config = uvicorn.Config(app, host="0.0.0.0", port=9000, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def _main() -> None:
    """Run all available services concurrently."""
    logger = logging.getLogger(__name__)
    tasks: list[asyncio.Task[None]] = []

    # Hermes Telegram bot (requires TELEGRAM_BOT_TOKEN).
    if _env("TELEGRAM_BOT_TOKEN", "TELEGRAM_API"):
        tasks.append(asyncio.create_task(_run_bot()))
        logger.info("Hermes Telegram bot enabled")
    else:
        logger.info("TELEGRAM_BOT_TOKEN/TELEGRAM_API not set — Telegram bot disabled")

    # Voice call Mini App (requires WEBAPP_BASE_URL and ELEVENLABS_API_KEY).
    if os.getenv("WEBAPP_BASE_URL") and _env("ELEVENLABS_API_KEY", "ELEVENLABS_API"):
        tasks.append(asyncio.create_task(_run_webapp()))
        logger.info("WebApp starting on port %s", os.getenv("WEBAPP_PORT", "8443"))
    else:
        logger.info("WEBAPP_BASE_URL or ELEVENLABS_API_KEY/ELEVENLABS_API not set — voice call Mini App disabled")

    # Sandbox API (requires sandbox.main to exist).
    try:
        from sandbox.main import app as _  # noqa: F401

        tasks.append(asyncio.create_task(_run_sandbox()))
        logger.info("Hephaestus sandbox API starting on port 9000")
    except ImportError:
        logger.info("sandbox.main not available — sandbox API disabled")

    if not tasks:
        logger.error("No services enabled. Set env vars or ensure sandbox.main is available.")
        return

    await asyncio.gather(*tasks)


def main() -> None:
    load_dotenv()
    _check_env()

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    asyncio.run(_main())


if __name__ == "__main__":
    main()

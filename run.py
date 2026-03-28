"""Pantheon entry point — starts Hermes (Telegram bot + webapp) concurrently.

Usage:
    uv run python run.py
"""

from __future__ import annotations

import asyncio
import logging
import os

from dotenv import load_dotenv


async def _run_webapp() -> None:
    """Start the FastAPI webapp for the voice-call Mini App."""
    import uvicorn

    from gateway.webapp import app

    port = int(os.getenv("WEBAPP_PORT", "8443"))
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def _run_bot() -> None:
    """Start the Telegram bot in polling mode."""
    from gateway.bot import build_app

    tg_app = build_app()
    logging.getLogger(__name__).info("Hermes is online — polling for updates…")

    # python-telegram-bot's run_polling() is blocking — use the async API.
    await tg_app.initialize()
    await tg_app.start()
    await tg_app.updater.start_polling(drop_pending_updates=True)  # type: ignore[union-attr]

    # Keep running until cancelled.
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await tg_app.updater.stop()  # type: ignore[union-attr]
        await tg_app.stop()
        await tg_app.shutdown()


async def _main() -> None:
    """Run the Telegram bot and the webapp concurrently."""
    logger = logging.getLogger(__name__)

    tasks: list[asyncio.Task[None]] = [asyncio.create_task(_run_bot())]

    if os.getenv("WEBAPP_BASE_URL"):
        tasks.append(asyncio.create_task(_run_webapp()))
        logger.info(
            "WebApp server starting on port %s",
            os.getenv("WEBAPP_PORT", "8443"),
        )
    else:
        logger.info("WEBAPP_BASE_URL not set — voice call Mini App disabled")

    await asyncio.gather(*tasks)


def main() -> None:
    load_dotenv()

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    asyncio.run(_main())


if __name__ == "__main__":
    main()

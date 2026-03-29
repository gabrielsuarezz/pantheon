"""Artemis — idle sentinel daemon. Watches for new malware samples and auto-triggers analysis."""
from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import Any

logger = logging.getLogger("artemis")

_WATCH_DIR = Path(os.getenv("SAMPLES_DIR", "/tmp/samples"))
_POLL_INTERVAL = 5.0  # seconds

# Type alias for the callback signature: async def handler(path: Path) -> None
SampleHandler = Callable[[Path], Coroutine[Any, Any, None]]


class Artemis:
    """
    File-watcher daemon. Polls SAMPLES_DIR for new files.
    When a new file appears, triggers the Zeus pipeline and notifies via Telegram.

    Usage:
        artemis = Artemis(on_new_sample=handler)
        await artemis.run()
    """

    def __init__(
        self,
        on_new_sample: SampleHandler,
        watch_dir: Path = _WATCH_DIR,
        poll_interval: float = _POLL_INTERVAL,
    ) -> None:
        self._on_new_sample = on_new_sample
        self._watch_dir = watch_dir
        self._poll_interval = poll_interval
        self._seen: set[Path] = set()

    async def run(self) -> None:
        """Run forever — poll for new files and trigger the handler."""
        self._watch_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Artemis watching %s every %.1fs", self._watch_dir, self._poll_interval)

        # Seed seen set with existing files so we don't re-analyze on restart
        self._seen = set(self._watch_dir.rglob("*"))

        while True:
            await asyncio.sleep(self._poll_interval)
            try:
                current = set(self._watch_dir.rglob("*"))
                new_files = current - self._seen
                for path in sorted(new_files):
                    if path.is_file():
                        logger.info("Artemis: new sample detected: %s", path)
                        try:
                            await self._on_new_sample(path)
                        except Exception as exc:
                            logger.error("Handler failed for %s: %s", path, exc)
                self._seen = current
            except Exception as exc:
                logger.error("Artemis poll error: %s", exc)

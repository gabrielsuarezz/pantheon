"""EventBus — in-memory pub/sub for the Pantheon WebSocket event stream.

One asyncio.Queue per connected WebSocket subscriber. publish() is
synchronous and safe to call from any context. subscribe() is an
async coroutine that blocks until the client disconnects.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import WebSocket

from sandbox.models import PantheonEvent

logger = logging.getLogger("hephaestus.events")


class EventBus:
    """Broadcasts PantheonEvents to all connected WebSocket subscribers."""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[PantheonEvent | None]] = set()

    def publish(self, event: PantheonEvent) -> None:
        """Put *event* onto every subscriber queue. Non-blocking."""
        dead: set[asyncio.Queue[PantheonEvent | None]] = set()
        for queue in self._queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                dead.add(queue)
        self._queues -= dead
        if dead:
            logger.debug("dropped %d slow subscriber(s)", len(dead))

    async def subscribe(self, websocket: WebSocket) -> None:
        """Accept *websocket* and stream events until disconnect."""
        await websocket.accept()
        queue: asyncio.Queue[PantheonEvent | None] = asyncio.Queue(maxsize=256)
        self._queues.add(queue)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                await websocket.send_text(event.model_dump_json())
        except Exception:
            pass
        finally:
            self._queues.discard(queue)


# Module-level singleton used by sandbox/main.py and tests.
bus: EventBus = EventBus()

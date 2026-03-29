"""Optional event streaming backends for Pantheon telemetry.

The default backend is disabled (`none`) so the existing demo remains unchanged.
When enabled with `PANTHEON_STREAM_BACKEND=kafka`, events are mirrored to Kafka.
"""

from __future__ import annotations

import asyncio
import importlib
import json
import logging
import os
from typing import TYPE_CHECKING

from sandbox.models import PantheonEvent

if TYPE_CHECKING:
    from aiokafka import AIOKafkaProducer

logger = logging.getLogger("hephaestus.streaming")


class EventStreamReplicator:
    """Mirrors EventBus traffic into an optional external stream backend."""

    def __init__(self) -> None:
        self._backend = os.getenv("PANTHEON_STREAM_BACKEND", "none").strip().lower()
        self._topic = os.getenv("PANTHEON_KAFKA_TOPIC", "pantheon.events")
        self._bootstrap = os.getenv("PANTHEON_KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self._client_id = os.getenv("PANTHEON_KAFKA_CLIENT_ID", "pantheon-hephaestus")
        self._producer: AIOKafkaProducer | None = None
        self._ready = False
        self._pending_tasks: set[asyncio.Task[None]] = set()

    @property
    def enabled(self) -> bool:
        return self._backend != "none"

    async def start(self) -> None:
        """Initialize the configured stream backend."""
        if self._backend == "none":
            logger.info("event stream backend disabled")
            return
        if self._backend != "kafka":
            logger.warning("unknown stream backend '%s'; disabling", self._backend)
            return

        try:
            module = importlib.import_module("aiokafka")
            producer_cls = module.AIOKafkaProducer
        except Exception as exc:
            logger.warning("aiokafka unavailable; kafka mirror disabled: %s", exc)
            return

        producer = producer_cls(
            bootstrap_servers=self._bootstrap,
            client_id=self._client_id,
            value_serializer=lambda payload: json.dumps(payload).encode("utf-8"),
        )
        try:
            await producer.start()
        except Exception as exc:
            logger.warning("kafka producer start failed; mirror disabled: %s", exc)
            return

        self._producer = producer
        self._ready = True
        logger.info(
            "kafka event mirror enabled topic=%s bootstrap=%s",
            self._topic,
            self._bootstrap,
        )

    async def stop(self) -> None:
        """Stop the configured stream backend cleanly."""
        producer = self._producer
        if producer is None:
            return
        self._producer = None
        self._ready = False
        try:
            await producer.stop()
        except Exception as exc:
            logger.debug("kafka producer stop failed: %s", exc)

    def enqueue(self, event: PantheonEvent) -> None:
        """Fire-and-forget replication for a single event."""
        if not self._ready:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        task = loop.create_task(self._replicate(event))
        self._pending_tasks.add(task)
        task.add_done_callback(self._pending_tasks.discard)

    async def _replicate(self, event: PantheonEvent) -> None:
        producer = self._producer
        if producer is None:
            return
        try:
            await producer.send_and_wait(self._topic, event.model_dump(mode="json"))
        except Exception as exc:
            logger.debug("kafka mirror publish failed (non-fatal): %s", exc)


replicator: EventStreamReplicator = EventStreamReplicator()

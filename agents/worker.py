"""Background worker loop connecting Artemis, SwarmManager, and Zeus.

This creates the continuous 'Swarm loop' automating the malware pipeline.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from agents.artemis import Artemis
from agents.swarm import get_swarm
from agents.zeus import zeus
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType

logger = logging.getLogger("pantheon.worker")


async def _on_new_sample(path: Path) -> None:
    """Callback when Artemis detects a new malware file."""
    swarm = await get_swarm()
    job_id = await swarm.ingest_sample(path)

    # Broadcast that Hephaestus/Swarm is active and ingesting
    await emit_event(
        event_type=EventType.AGENT_ACTIVATED,
        job_id=job_id,
        payload={"message": f"Artemis detected new sample: {path.name}"},
    )
    logger.info("Artemis passed new sample %s to Swarm (Job: %s)", path, job_id)


async def swarm_worker_loop() -> None:
    """Continuously poll SwarmManager for new jobs and trigger Zeus."""
    swarm = await get_swarm()
    logger.info("Swarm worker loop started. Waiting for jobs...")

    while True:
        try:
            job = await swarm.route_next()
            if job is not None:
                logger.info("Swarm worker routing job %s to Zeus", job.job_id)
                prompt = (
                    f"A new malware sample '{job.sample_name}' at path '{job.sample_path}' "
                    f"has been detected (job_id: {job.job_id}). "
                    "Please initiate the full Pantheon analysis pipeline immediately."
                )

                try:
                    # Trigger the full loop through ADK agent 'zeus'
                    await emit_event(
                        event_type=EventType.AGENT_ACTIVATED,
                        agent=AgentName.ZEUS,
                        job_id=job.job_id,
                        payload={"message": "Initializing orchestrator pipeline."},
                    )
                    
                    await zeus.run(prompt)
                    await swarm.complete_job(job.job_id)
                    
                    await emit_event(
                        event_type=EventType.ANALYSIS_COMPLETE,
                        agent=AgentName.ZEUS,
                        job_id=job.job_id,
                        payload={"message": "Analysis loop complete."},
                    )

                except Exception as e:
                    logger.error("Zeus pipeline failed for job %s: %s", job.job_id, e)
                    await swarm.fail_job(job.job_id, str(e))
                    await emit_event(
                        event_type=EventType.ERROR,
                        agent=AgentName.ZEUS,
                        job_id=job.job_id,
                        payload={"error": str(e)},
                    )

        except Exception as e:
            logger.error("Swarm worker loop error: %s", e)

        # Polling delay
        await asyncio.sleep(2.0)

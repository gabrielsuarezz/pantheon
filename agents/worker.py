"""Background worker loop connecting Artemis, SwarmManager, and Zeus.

This creates the continuous 'Swarm loop' automating the malware pipeline.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from agents.swarm import get_swarm
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType

logger = logging.getLogger("pantheon.worker")


async def _on_new_sample(path: Path) -> None:
    """Callback when Artemis detects a new malware file."""
    swarm = await get_swarm()
    job_id = await swarm.ingest_sample(path)

    # Broadcast that Artemis detected a new sample.
    await emit_event(
        event_type=EventType.AGENT_ACTIVATED.value,
        agent=AgentName.ARTEMIS.value,
        job_id=job_id,
        payload=json.dumps({"message": f"Artemis detected new sample: {path.name}"}),
    )
    logger.info("Artemis passed new sample %s to Swarm (Job: %s)", path, job_id)


async def _run_zeus_pipeline(prompt: str) -> str:
    """Route a prompt through the Zeus ADK pipeline via Runner.run_async().

    This is the correct way to invoke an ADK agent — Agent objects do not
    have a .run() method; they must be driven through a Runner.
    """
    from gateway.runner import get_zeus_response

    return await get_zeus_response("swarm-worker", prompt)


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
                    await emit_event(
                        event_type=EventType.AGENT_ACTIVATED.value,
                        agent=AgentName.ZEUS.value,
                        job_id=job.job_id,
                        payload=json.dumps({"message": "Initializing orchestrator pipeline."}),
                    )

                    response = await _run_zeus_pipeline(prompt)
                    await swarm.complete_job(job.job_id)

                    await emit_event(
                        event_type=EventType.ANALYSIS_COMPLETE.value,
                        agent=AgentName.ZEUS.value,
                        job_id=job.job_id,
                        payload=json.dumps({
                            "message": "Analysis loop complete.",
                            "response_length": len(response),
                        }),
                    )

                except Exception as e:
                    logger.error("Zeus pipeline failed for job %s: %s", job.job_id, e)
                    await swarm.fail_job(job.job_id, str(e))
                    await emit_event(
                        event_type=EventType.ERROR.value,
                        agent=AgentName.ZEUS.value,
                        job_id=job.job_id,
                        payload=json.dumps({"error": str(e)}),
                    )

        except Exception as e:
            logger.error("Swarm worker loop error: %s", e)

        # Polling delay
        await asyncio.sleep(2.0)

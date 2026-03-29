"""Voice agent tool implementations — called by ElevenLabs Conversational AI.

These tools connect Muse to the Pantheon sandbox infrastructure. They are
registered as client_tools on the ElevenLabs agent so Muse can trigger
analysis, poll for results, and check system health during a live voice call.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_SAMPLES_DIR = Path(os.getenv(
    "SAMPLES_DIR", "/Users/sairamen/projects/pantheon/MALWARE"
))

# How long to poll for a completed report before returning partial results.
_POLL_TIMEOUT = 90
_POLL_INTERVAL = 3


async def tool_analyze(parameters: dict[str, Any]) -> str:
    """Trigger sandbox analysis and poll until the report is ready.

    Instead of returning immediately with "submitted", this tool waits for
    the analysis to complete (up to _POLL_TIMEOUT seconds) so that Muse can
    brief the analyst in the same turn. This prevents the ElevenLabs session
    from disconnecting due to prolonged silence.
    """
    filename = parameters.get("filename", "")

    sample_path: Path | None = None
    if filename:
        for candidate in _SAMPLES_DIR.rglob(filename):
            sample_path = candidate
            break

    if sample_path is None:
        known_sample = _SAMPLES_DIR / "6108674530.JS.malicious"
        if known_sample.exists() and known_sample.is_file():
            sample_path = known_sample
        else:
            all_samples = sorted(
                _SAMPLES_DIR.rglob("*"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for s in all_samples:
                if s.is_file():
                    sample_path = s
                    break

    if sample_path is None:
        return json.dumps({
            "status": "error",
            "message": (
                "No sample found. Upload a file through Telegram first, "
                "then ask me to analyze it."
            ),
        })

    job_id = str(uuid.uuid4())[:8]
    file_b64 = base64.b64encode(sample_path.read_bytes()).decode()
    sandbox_url = os.getenv("SANDBOX_API_URL", "http://localhost:9000")

    # --- Submit the analysis job ---
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{sandbox_url}/sandbox/analyze",
                json={
                    "job_id": job_id,
                    "file_content_b64": file_b64,
                    "filename": sample_path.name,
                    "analysis_type": parameters.get("analysis_type", "both"),
                },
            )
            resp.raise_for_status()
            logger.info("Sandbox accepted job %s", job_id)
    except Exception:
        logger.exception(
            "Sandbox not reachable — running ADK fallback for %s",
            sample_path.name,
        )
        from gateway.runner import get_agent_response

        response = await get_agent_response(
            "voice-call-user",
            f"analyze the malware sample at {sample_path}",
        )
        return json.dumps({
            "status": "complete",
            "job_id": job_id,
            "filename": sample_path.name,
            "message": response,
        })

    # --- Poll for the completed report ---
    elapsed = 0
    report_data: dict[str, Any] | None = None

    while elapsed < _POLL_TIMEOUT:
        await asyncio.sleep(_POLL_INTERVAL)
        elapsed += _POLL_INTERVAL

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                rpt = await client.get(
                    f"{sandbox_url}/sandbox/report/{job_id}"
                )
                if rpt.status_code == 200:
                    report_data = rpt.json()
                    status = report_data.get("status", "")
                    if status in ("complete", "completed", "failed"):
                        break
        except Exception:
            logger.debug("Poll attempt failed for job %s", job_id)

    if report_data and report_data.get("status") in (
        "complete", "completed",
    ):
        return json.dumps({
            "status": "complete",
            "job_id": job_id,
            "filename": sample_path.name,
            "report": report_data,
        })

    # Timed out or still running — return what we have
    return json.dumps({
        "status": "in_progress",
        "job_id": job_id,
        "filename": sample_path.name,
        "message": (
            f"Analysis for {sample_path.name} is still running after "
            f"{elapsed} seconds. Use the report tool with job ID {job_id} "
            "to check again shortly."
        ),
        "partial_report": report_data,
    })


async def tool_report(parameters: dict[str, Any]) -> str:
    """Retrieve analysis report for a job, polling briefly if not yet ready."""
    job_id = parameters.get("job_id", "")
    if not job_id:
        return json.dumps({
            "status": "error",
            "message": "Please specify the job ID from the analysis.",
        })

    sandbox_url = os.getenv("SANDBOX_API_URL", "http://localhost:9000")

    # Try a few times in case the report is almost done
    for attempt in range(5):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{sandbox_url}/sandbox/report/{job_id}"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    status = data.get("status", "")
                    if status in ("complete", "completed", "failed"):
                        return json.dumps(data)
                    # Still running — wait and retry
                    if attempt < 4:
                        await asyncio.sleep(3)
                        continue
                    return json.dumps(data)
                elif resp.status_code == 404 and attempt < 4:
                    await asyncio.sleep(3)
                    continue
                else:
                    return json.dumps(resp.json())
        except Exception:
            logger.exception("Could not retrieve report for job %s", job_id)
            if attempt < 4:
                await asyncio.sleep(2)
                continue

    return json.dumps({
        "status": "error",
        "message": (
            f"Report for job {job_id} is not available yet. "
            "The analysis may still be running."
        ),
    })


async def tool_status(parameters: dict[str, Any]) -> str:
    """Check if the sandbox is healthy and ready."""
    sandbox_url = os.getenv("SANDBOX_API_URL", "http://localhost:9000")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{sandbox_url}/sandbox/health")
            return json.dumps(resp.json())
    except Exception:
        return json.dumps({
            "status": "degraded",
            "docker_available": False,
            "message": (
                "Sandbox service is not reachable. "
                "Analysis will use the AI pipeline instead."
            ),
        })

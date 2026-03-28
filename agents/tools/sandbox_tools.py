"""HTTP tools for calling the Hephaestus sandbox service.

All functions are async and use httpx. They return JSON-serializable dicts
so that google-adk can pass results back to the LLM.
"""

from __future__ import annotations

import asyncio
import base64
import os
import uuid
from pathlib import Path
from typing import Any

import httpx

from sandbox.models import AnalyzeRequest, AnalyzeResponse, IOCReport, ThreatReport

_SANDBOX_URL: str = os.getenv("SANDBOX_API_URL", "http://sandbox:9000")
_POLL_INTERVAL: float = 2.0
_MAX_POLLS: int = 30


async def submit_sample(file_path: str, analysis_type: str = "both") -> dict[str, str]:
    """Submit a malware sample to the Hephaestus sandbox for analysis.

    Reads the file at *file_path*, base64-encodes it, generates a unique job
    ID, and posts an AnalyzeRequest to POST /sandbox/analyze.

    Args:
        file_path: Absolute path to the malware sample on disk.
        analysis_type: Pipeline(s) to run — "static", "dynamic", or "both".

    Returns:
        Dict with ``job_id`` (str) and ``status`` ("queued" or "running").
    """
    path = Path(file_path)
    raw_bytes = path.read_bytes()
    b64 = base64.b64encode(raw_bytes).decode()
    job_id = str(uuid.uuid4())

    request = AnalyzeRequest(
        job_id=job_id,
        file_content_b64=b64,
        filename=path.name,
        analysis_type=analysis_type,  # type: ignore[arg-type]
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{_SANDBOX_URL}/sandbox/analyze",
            json=request.model_dump(),
        )
        resp.raise_for_status()
        result = AnalyzeResponse.model_validate(resp.json())

    return {"job_id": result.job_id, "status": result.status}


async def get_report(job_id: str) -> dict[str, Any]:  # Any: pydantic model_dump()
    """Fetch the current threat analysis report for a sandbox job.

    Calls GET /sandbox/report/{job_id}. Status may be ``queued``, ``running``,
    ``complete``, or ``failed``.

    Args:
        job_id: Job identifier returned from :func:`submit_sample`.

    Returns:
        Dict representation of :class:`~sandbox.models.ThreatReport`.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{_SANDBOX_URL}/sandbox/report/{job_id}")
        resp.raise_for_status()
        report = ThreatReport.model_validate(resp.json())
    return report.model_dump()


async def get_iocs(job_id: str) -> dict[str, Any]:  # Any: pydantic model_dump()
    """Fetch the flat IOC list for a completed sandbox job.

    Calls GET /sandbox/iocs/{job_id}.

    Args:
        job_id: Job identifier returned from :func:`submit_sample`.

    Returns:
        Dict representation of :class:`~sandbox.models.IOCReport` with keys
        ``ips``, ``domains``, ``file_hashes``, ``file_paths``, ``ports``,
        ``registry_keys``, ``cve_ids``, and ``urls``.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{_SANDBOX_URL}/sandbox/iocs/{job_id}")
        resp.raise_for_status()
        ioc_report = IOCReport.model_validate(resp.json())
    return ioc_report.model_dump()


async def poll_report(job_id: str) -> dict[str, Any]:  # Any: pydantic model_dump()
    """Poll the sandbox until a job finishes, then return the full ThreatReport.

    Polls GET /sandbox/report/{job_id} every two seconds for up to 60 seconds.
    Returns as soon as status is ``complete`` or ``failed``.

    Args:
        job_id: Job identifier returned from :func:`submit_sample`.

    Returns:
        Dict representation of :class:`~sandbox.models.ThreatReport` with
        ``status`` equal to ``"complete"`` or ``"failed"``.

    Raises:
        TimeoutError: The job did not complete within the polling window.
        httpx.HTTPStatusError: The sandbox returned an HTTP error response.
    """
    for _ in range(_MAX_POLLS):
        report = await get_report(job_id)
        if report.get("status") in ("complete", "failed"):
            return report
        await asyncio.sleep(_POLL_INTERVAL)

    raise TimeoutError(
        f"Sandbox job {job_id!r} did not complete within "
        f"{_MAX_POLLS * _POLL_INTERVAL:.0f} seconds."
    )


async def check_sandbox_health() -> dict[str, Any]:  # Any: health json payload
    """Check whether the Hephaestus sandbox service and Docker daemon are up.

    Calls GET /sandbox/health.

    Returns:
        Dict with ``status`` ("ok" or "degraded") and ``docker_available`` (bool).
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{_SANDBOX_URL}/sandbox/health")
        resp.raise_for_status()
    data: dict[str, Any] = resp.json()
    return data

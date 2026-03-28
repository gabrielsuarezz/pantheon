"""FastAPI web app — serves the voice-call Mini App and agent tool webhooks.

Runs alongside the Telegram bot so that Telegram's WebApp iframe can load
the call page and connect directly to ElevenLabs Conversational AI.

The /api/tools/* endpoints are registered as **custom tools** on the
ElevenLabs agent, allowing the voice agent to trigger sandbox analysis
and retrieve reports during a live call.
"""

from __future__ import annotations

import base64
import logging
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logger = logging.getLogger(__name__)

app = FastAPI(title="Pantheon — Hermes WebApp")

# ElevenLabs JS SDK needs CORS to hit /api/* from the Mini App iframe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC_DIR = Path(__file__).parent / "static"
_SAMPLES_DIR = Path(os.getenv("SAMPLES_DIR", "/tmp/samples"))


# ---------------------------------------------------------------------------
# Mini App pages
# ---------------------------------------------------------------------------

@app.get("/call")
async def call_page() -> FileResponse:
    """Serve the voice-call Mini App HTML."""
    return FileResponse(_STATIC_DIR / "call.html", media_type="text/html")


@app.get("/api/agent-config")
async def agent_config() -> JSONResponse:
    """Return the ElevenLabs agent ID so the Mini App can connect."""
    agent_id = os.getenv("ELEVENLABS_AGENT_ID", "")
    return JSONResponse({"agent_id": agent_id})


# ---------------------------------------------------------------------------
# ElevenLabs agent tool webhooks
# ---------------------------------------------------------------------------
# These are configured as "custom tools" on the ElevenLabs Conversational AI
# platform.  When the user asks the agent to analyze a file, check status,
# or get a report, the agent calls these webhooks and speaks the results.

class AnalyzeToolInput(BaseModel):
    """Input the ElevenLabs agent sends when the user requests analysis."""
    filename: str = ""
    analysis_type: str = "both"


class StatusToolInput(BaseModel):
    """Input for checking analysis status."""
    job_id: str


@app.post("/api/tools/analyze")
async def tool_analyze(body: dict[str, Any]) -> JSONResponse:
    """Webhook: trigger sandbox analysis on a previously uploaded sample.

    The ElevenLabs agent calls this when the user says something like
    'analyze the malware sample' during a voice call.
    """
    # ElevenLabs sends tool calls with the schema in a nested dict.
    params = body.get("parameters", body)
    filename = params.get("filename", "")

    # Look for the most recent sample on disk.
    sample_path: Path | None = None
    if filename:
        for candidate in _SAMPLES_DIR.rglob(filename):
            sample_path = candidate
            break

    if sample_path is None:
        # Try the newest file in the samples dir.
        all_samples = sorted(_SAMPLES_DIR.rglob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
        for s in all_samples:
            if s.is_file():
                sample_path = s
                break

    if sample_path is None:
        return JSONResponse({
            "status": "error",
            "message": (
                "No sample found. Upload a file through Telegram first, "
                "then ask me to analyze it."
            ),
        })

    # Build an AnalyzeRequest for the sandbox.
    job_id = str(uuid.uuid4())[:8]
    file_b64 = base64.b64encode(sample_path.read_bytes()).decode()

    # Try to forward to the sandbox service if it's running.
    sandbox_url = os.getenv("SANDBOX_URL", "http://localhost:9090")
    try:
        import httpx

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{sandbox_url}/sandbox/analyze",
                json={
                    "job_id": job_id,
                    "file_content_b64": file_b64,
                    "filename": sample_path.name,
                    "analysis_type": params.get("analysis_type", "both"),
                },
            )
            result = resp.json()
            logger.info("Sandbox accepted job %s: %s", job_id, result)
            return JSONResponse({
                "status": "submitted",
                "job_id": job_id,
                "filename": sample_path.name,
                "message": f"Analysis started for {sample_path.name}. Job ID is {job_id}. "
                           f"I'll check the results once the analysis completes.",
            })
    except Exception:
        logger.exception("Sandbox not reachable — running ADK fallback for %s", sample_path.name)

        # Fallback: run through the ADK pipeline instead.
        from gateway.runner import get_agent_response

        response = await get_agent_response(
            "voice-call-user",
            f"analyze the malware sample at {sample_path}",
        )
        return JSONResponse({
            "status": "complete",
            "job_id": job_id,
            "filename": sample_path.name,
            "message": response,
        })


@app.post("/api/tools/report")
async def tool_report(body: dict[str, Any]) -> JSONResponse:
    """Webhook: retrieve analysis report for a job.

    The agent calls this when the user asks about results.
    """
    params = body.get("parameters", body)
    job_id = params.get("job_id", "")

    sandbox_url = os.getenv("SANDBOX_URL", "http://localhost:9090")
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{sandbox_url}/sandbox/report/{job_id}")
            return JSONResponse(resp.json())
    except Exception:
        logger.exception("Could not retrieve report for job %s", job_id)
        return JSONResponse({
            "status": "error",
            "message": f"Report for job {job_id} is not available yet. "
                       "The analysis may still be running.",
        })


@app.post("/api/tools/status")
async def tool_status(body: dict[str, Any]) -> JSONResponse:
    """Webhook: check if the sandbox is healthy and ready."""
    sandbox_url = os.getenv("SANDBOX_URL", "http://localhost:9090")
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{sandbox_url}/sandbox/health")
            return JSONResponse(resp.json())
    except Exception:
        return JSONResponse({
            "status": "degraded",
            "docker_available": False,
            "message": (
                "Sandbox service is not reachable. "
                "Analysis will use the AI pipeline instead."
            ),
        })


# Serve static assets from gateway/static/.
if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

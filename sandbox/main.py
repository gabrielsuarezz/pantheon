"""Hephaestus — FastAPI sandbox service."""
from __future__ import annotations

import logging

import docker
import docker.errors
from fastapi import FastAPI, HTTPException, WebSocket

from sandbox.analyzer import Analyzer
from sandbox.events import bus
from sandbox.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    IOCReport,
    MemoryEntry,
    PantheonEvent,
    SimilarJob,
    StoreMemoryRequest,
    StoreMemoryResponse,
    ThreatReport,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("hephaestus")

app = FastAPI(
    title="Hephaestus",
    description="Pantheon malware sandbox service",
    version="0.1.0",
)

_analyzer = Analyzer()


@app.get("/sandbox/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        client = docker.from_env()
        client.ping()
        docker_ok = True
    except Exception:
        docker_ok = False
    return HealthResponse(status="ok" if docker_ok else "degraded", docker_available=docker_ok)


@app.post("/sandbox/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    job_id = await _analyzer.submit(
        request.file_content_b64,
        request.filename,
        request.analysis_type,
    )
    return AnalyzeResponse(job_id=job_id, status="queued")


@app.get("/sandbox/report/{job_id}", response_model=ThreatReport)
def get_report(job_id: str) -> ThreatReport:
    report = _analyzer.get_report(job_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return report


@app.get("/sandbox/iocs/{job_id}", response_model=IOCReport)
def get_iocs(job_id: str) -> IOCReport:
    iocs = _analyzer.get_iocs(job_id)
    if iocs is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found or still running")
    return iocs


# --- KnowledgeStore endpoints ------------------------------------------------


@app.post("/sandbox/memory", response_model=StoreMemoryResponse)
def store_memory(request: StoreMemoryRequest) -> StoreMemoryResponse:
    """Store an agent's output for one analysis run."""
    return _analyzer.store_memory(
        request.job_id, request.agent_name, request.output, request.temperature
    )


@app.get("/sandbox/memory/{job_id}/{agent_name}", response_model=list[MemoryEntry])
def load_memory(job_id: str, agent_name: str) -> list[MemoryEntry]:
    """Return all stored runs for a (job_id, agent_name) pair, oldest first."""
    return _analyzer.load_memory(job_id, agent_name)


@app.post("/sandbox/fingerprint/{job_id}")
def store_fingerprint(job_id: str) -> dict[str, str]:
    """Compute and persist a behavioral fingerprint for a completed job."""
    report = _analyzer.get_report(job_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    _analyzer.store_fingerprint(job_id)
    return {"status": "ok", "job_id": job_id}


@app.get("/sandbox/similar/{job_id}", response_model=list[SimilarJob])
def find_similar(job_id: str) -> list[SimilarJob]:
    """Return jobs with behavioral similarity to the given job."""
    return _analyzer.find_similar(job_id)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Stream PantheonEvents to connected dashboard clients."""
    await bus.subscribe(websocket)


@app.post("/events", status_code=204)
async def receive_event(event: PantheonEvent) -> None:
    """Accept an event from any agent and broadcast it to all /ws subscribers."""
    bus.publish(event)

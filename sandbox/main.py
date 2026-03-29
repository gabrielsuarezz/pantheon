"""Hephaestus — FastAPI sandbox service."""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import docker
import docker.errors
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from sandbox.analyzer import Analyzer
from sandbox.events import bus
from sandbox.models import (
    AgentName,
    AnalyzeRequest,
    AnalyzeResponse,
    EventType,
    HealthResponse,
    IOCReport,
    MemoryEntry,
    PantheonEvent,
    SimilarJob,
    StoreMemoryRequest,
    StoreMemoryResponse,
    ThreatReport,
)
from sandbox.streaming import replicator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("hephaestus")
_LOG_STREAMING_INSTALLED = False


def _is_noisy_telemetry(command: str | None, output: str | None, message: str | None) -> bool:
    """Return True for low-value telemetry chatter that should not be broadcast."""
    normalized_command = (command or "").strip().lower()
    normalized_output = (output or "").strip().lower()
    normalized_message = (message or "").strip().lower()
    return normalized_command == "heartbeat" or any(
        token == "heartbeat: hephaestus alive"
        for token in (normalized_output, normalized_message)
    )


def _emit_telemetry(
    message: str,
    *,
    command: str | None = None,
    stream: str = "stdout",
    level: str = "info",
) -> None:
    payload: dict[str, str] = {
        "message": message,
        "output": message,
        "stream": stream,
        "level": level,
    }
    if command:
        payload["command"] = command
    event = PantheonEvent(
        type=EventType.TELEMETRY,
        agent=AgentName.HEPHAESTUS,
        payload=payload,
    )
    bus.publish(event)
    replicator.enqueue(event)


class _EventBusLogHandler(logging.Handler):
    """Forward server log lines to dashboard telemetry."""

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith("hephaestus.events"):
            return
        try:
            message = self.format(record)
        except Exception:
            return
        stream = "stderr" if record.levelno >= logging.ERROR else "stdout"
        _emit_telemetry(
            message,
            stream=stream,
            level=record.levelname.lower(),
        )


def _install_log_streaming() -> None:
    global _LOG_STREAMING_INSTALLED
    if _LOG_STREAMING_INSTALLED:
        return

    handler = _EventBusLogHandler(level=logging.INFO)
    handler.setFormatter(
        logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s")
    )
    logging.getLogger().addHandler(handler)
    _LOG_STREAMING_INSTALLED = True


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from agents.artemis import Artemis
    from agents.worker import _on_new_sample, swarm_worker_loop

    _install_log_streaming()
    await replicator.start()
    _emit_telemetry("Hephaestus boot complete", command="uvicorn sandbox.main:app")

    artemis_daemon = Artemis(on_new_sample=_on_new_sample)
    
    # Start the background tasks
    artemis_task = asyncio.create_task(artemis_daemon.run())
    worker_task = asyncio.create_task(swarm_worker_loop())
    
    yield
    
    # Cancel tasks on shutdown
    artemis_task.cancel()
    worker_task.cancel()
    await replicator.stop()

app = FastAPI(
    title="Hephaestus",
    description="Pantheon malware sandbox service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_analyzer = Analyzer()


@app.middleware("http")
async def telemetry_http_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    start = time.perf_counter()
    command = f"{request.method} {request.url.path}"
    _emit_telemetry(f"HTTP {command} [start]", command=command, stream="stdin")
    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start) * 1000
        _emit_telemetry(
            f"HTTP {command} [error] {exc} ({elapsed_ms:.1f} ms)",
            command=command,
            stream="stderr",
            level="error",
        )
        raise

    elapsed_ms = (time.perf_counter() - start) * 1000
    _emit_telemetry(
        f"HTTP {command} -> {response.status_code} ({elapsed_ms:.1f} ms)",
        command=command,
        stream="stdout",
    )
    return response


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
    _emit_telemetry("WS /ws client connected", command="ws subscribe /ws")
    try:
        await bus.subscribe(websocket)
    finally:
        _emit_telemetry("WS /ws client disconnected", command="ws subscribe /ws")


@app.post("/events", status_code=204)
async def receive_event(event: PantheonEvent) -> None:
    """Accept an event from any agent and broadcast it to all /ws subscribers."""
    if event.type == EventType.TELEMETRY:
        payload = event.payload
        if _is_noisy_telemetry(
            payload.get("command") if isinstance(payload.get("command"), str) else None,
            payload.get("output") if isinstance(payload.get("output"), str) else None,
            payload.get("message") if isinstance(payload.get("message"), str) else None,
        ):
            return

    if event.type != EventType.TELEMETRY:
        _emit_telemetry(
            (
                f"EVENT {event.type.value} "
                f"agent={event.agent.value if event.agent else 'unknown'} "
                f"tool={event.tool or '-'}"
            ),
            command="POST /events",
            stream="stdout",
        )
    bus.publish(event)
    replicator.enqueue(event)


@app.post("/sandbox/agents/{agent_name}/command", status_code=204)
async def agent_command(agent_name: AgentName, command: str, job_id: str | None = None) -> None:
    """Send a control command to a specific agent."""
    event = PantheonEvent(
        type=EventType.AGENT_COMMAND,
        agent=agent_name,
        job_id=job_id,
        payload={"command": command},
    )
    bus.publish(event)
    replicator.enqueue(event)
    logger.info("Control command '%s' sent to agent %s", command, agent_name)

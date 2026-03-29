# Sandbox (Hephaestus)

Hephaestus is the FastAPI service that powers malware analysis, persistence, agent memory, and real-time event streaming for the Pantheon platform.

## Responsibilities

- Accept sample submissions for static and dynamic analysis
- Run analysis pipelines via `Analyzer` (static extraction + optional Docker-based dynamic harness)
- Persist reports, IOCs, and agent memory in SQLite (WAL mode)
- Provide behavioral fingerprinting and cross-run similarity search (KnowledgeStore)
- Broadcast real-time events to dashboard clients over WebSocket (EventBus)
- Optionally mirror events to Kafka (`PANTHEON_STREAM_BACKEND=kafka`) for replay/analytics

## Key Files

- `main.py`: FastAPI app, all endpoints, CORS configuration, and service lifecycle
- `analyzer.py`: analysis orchestration, job management, persistence logic, and KnowledgeStore
- `models.py`: Pydantic v2 API contract — **single source of truth** for all inter-service data shapes
- `events.py`: in-memory EventBus singleton — asyncio pub/sub with WebSocket broadcast
- `streaming.py`: optional stream replicator (default `none`, optional `kafka`)
- `static/`: static analysis components (string extraction, AST deobfuscation, entropy scanning)
- `dynamic/`: containerized dynamic analysis harness (Docker SDK, Node.js instrumentation)

## API Endpoints

### Analysis
- `GET /sandbox/health` — service health check (includes Docker availability)
- `POST /sandbox/analyze` — submit a sample for analysis
- `GET /sandbox/report/{job_id}` — retrieve analysis report
- `GET /sandbox/iocs/{job_id}` — retrieve extracted IOCs

### Agent Memory (KnowledgeStore)
- `POST /sandbox/memory` — store agent output for a job
- `GET /sandbox/memory/{job_id}/{agent_name}` — retrieve agent memory
- `POST /sandbox/fingerprint/{job_id}` — generate behavioral fingerprint
- `GET /sandbox/similar/{job_id}` — find similar past analyses

### Event System
- `POST /events` — ingest PantheonEvent from agents (fire-and-forget delivery)
- `GET /ws` — WebSocket endpoint for real-time event stream

## Event System

`events.py` exposes a module-level EventBus singleton:

- **Producers** post `PantheonEvent` payloads to `POST /events` (agents use `emit_event()` from `agents/tools/event_tools.py`)
- **Consumers** subscribe to `GET /ws` (dashboard WebSocket client)
- Events are broadcast fan-out via per-client `asyncio.Queue` instances
- Event types: `AGENT_ACTIVATED`, `AGENT_COMPLETED`, `TOOL_CALLED`, `TOOL_RESULT`, `HANDOFF`, `IOC_DISCOVERED`, `STAGE_UNLOCKED`, `PROCESS_EVENT`, `NETWORK_EVENT`, `AGENT_COMMAND`

## Running Locally

From repository root:

```bash
uv sync
uv run python run.py
```

Or standalone:

```bash
uv run uvicorn sandbox.main:app --host 0.0.0.0 --port 9000
```

Service default address: `http://localhost:9000`

## Docker Deployment

Hephaestus runs as a Docker service in production via `infra/docker-compose.yml`:

```bash
docker compose -f infra/docker-compose.yml up -d sandbox
```

The container mounts the Docker socket for container-in-container dynamic analysis and uses a persistent volume for the SQLite database.

## Quality Checks

```bash
uv run mypy sandbox
uv run ruff check sandbox
uv run pytest tests/sandbox
```

## Safety Constraints

- Dynamic execution must stay inside approved isolation boundaries (Docker `--network none`, `--memory 256m`, `--read-only`, `--no-new-privileges`, `--cap-drop ALL`).
- Never run malware directly in this process or host shell.
- Keep `models.py` stable — coordinate contract changes across teams before modifying.

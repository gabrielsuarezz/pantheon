"""FastAPI web app — serves the voice-call Mini App and agent tool webhooks.

Runs alongside the Telegram bot so that Telegram's WebApp iframe can load
the call page and connect directly to ElevenLabs Conversational AI.

The /api/tools/* endpoints are registered as **custom tools** on the
ElevenLabs agent, allowing the voice agent to trigger sandbox analysis
and retrieve reports during a live call.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from voice.tools import tool_analyze, tool_report, tool_status

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


class ToolCallBody(BaseModel):
    """Best-effort parser for incoming tool call payloads from providers."""

    tool_name: str | None = None
    name: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    arguments: dict[str, Any] | str | None = None
    tool_input: dict[str, Any] | None = None
    input: dict[str, Any] | None = None


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
# ElevenLabs / custom tool webhooks
# ---------------------------------------------------------------------------


def _normalize_parameters(payload: ToolCallBody) -> dict[str, Any]:
    """Extract tool parameters from different payload shapes safely."""
    if payload.parameters:
        return payload.parameters

    if isinstance(payload.arguments, dict):
        return payload.arguments

    if isinstance(payload.arguments, str):
        try:
            parsed = json.loads(payload.arguments)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            logger.warning("Tool call arguments were not valid JSON")

    if payload.tool_input:
        return payload.tool_input

    if payload.input:
        return payload.input

    return {}


async def _dispatch_tool(tool_name: str, parameters: dict[str, Any]) -> JSONResponse:
    """Run one of the supported voice tools and return structured JSON."""
    tool_key = tool_name.strip().lower()

    if tool_key == "analyze":
        raw = await tool_analyze(parameters)
    elif tool_key == "report":
        raw = await tool_report(parameters)
    elif tool_key == "status":
        raw = await tool_status(parameters)
    else:
        raise HTTPException(status_code=404, detail=f"Unknown tool: {tool_name}")

    # voice.tools returns JSON strings. Keep compatibility if this ever changes.
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return JSONResponse(parsed)
        except json.JSONDecodeError:
            return JSONResponse({"status": "ok", "result": raw})

    return JSONResponse({"status": "ok", "result": raw})


@app.post("/api/tools")
async def call_tool(body: ToolCallBody) -> JSONResponse:
    """Generic tool endpoint where tool name is provided in request body."""
    tool_name = body.tool_name or body.name
    if not tool_name:
        raise HTTPException(status_code=400, detail="tool_name (or name) is required")

    parameters = _normalize_parameters(body)
    return await _dispatch_tool(tool_name, parameters)


@app.post("/api/tools/{tool_name}")
async def call_tool_by_path(tool_name: str, body: ToolCallBody | None = None) -> JSONResponse:
    """Path-based endpoint used by providers configured per-tool URL."""
    payload = body if body is not None else ToolCallBody()
    parameters = _normalize_parameters(payload)
    return await _dispatch_tool(tool_name, parameters)


# Serve static assets from gateway/static/.
if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

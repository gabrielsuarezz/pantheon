"""Tests for gateway.webapp — FastAPI Mini App endpoints."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from gateway.webapp import app

client = TestClient(app)


def test_call_page_returns_html() -> None:
    resp = client.get("/call")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "Pantheon" in resp.text


@patch.dict("os.environ", {"ELEVENLABS_AGENT_ID": "test-agent-123"})
def test_agent_config_returns_id() -> None:
    resp = client.get("/api/agent-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent_id"] == "test-agent-123"


def test_tool_status_sandbox_unreachable() -> None:
    resp = client.post("/api/tools/status", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "degraded"


def test_tool_analyze_no_sample(tmp_path: pytest.TempPathFactory) -> None:  # type: ignore[type-arg]
    with patch("gateway.webapp._SAMPLES_DIR", tmp_path):
        resp = client.post("/api/tools/analyze", json={"parameters": {"filename": "nope.js"}})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"

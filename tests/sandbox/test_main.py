from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from sandbox.models import ThreatReport, IOCReport, NetworkIOCs, FileIOCs


@pytest.fixture()
def client() -> TestClient:
    from sandbox.main import app
    return TestClient(app)


@pytest.fixture()
def sample_b64() -> str:
    return base64.b64encode(b"var x = WScript.Run('cmd');").decode()


def test_health(client: TestClient) -> None:
    resp = client.get("/sandbox/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")


def test_analyze_returns_job_id(client: TestClient, sample_b64: str) -> None:
    fake_job_id = "abc123"
    with patch("sandbox.main._analyzer.submit", new_callable=AsyncMock, return_value=fake_job_id):
        resp = client.post("/sandbox/analyze", json={
            "job_id": "caller-id",
            "file_content_b64": sample_b64,
            "filename": "test.js",
            "analysis_type": "static",
        })
    assert resp.status_code == 200
    assert resp.json()["job_id"] == fake_job_id


def test_get_report_not_found(client: TestClient) -> None:
    with patch("sandbox.main._analyzer.get_report", return_value=None):
        resp = client.get("/sandbox/report/nonexistent")
    assert resp.status_code == 404


def test_get_report_found(client: TestClient) -> None:
    fake = ThreatReport(
        job_id="abc123", status="complete",
        malware_type="dropper", obfuscation_technique="_0x",
        network_iocs=NetworkIOCs(ips=["1.2.3.4"]),
        file_iocs=FileIOCs(sha256="a" * 64, md5="b" * 32),
        risk_level="critical", affected_systems=["Windows"],
        gemini_summary="bad stuff",
    )
    with patch("sandbox.main._analyzer.get_report", return_value=fake):
        resp = client.get("/sandbox/report/abc123")
    assert resp.status_code == 200
    assert resp.json()["malware_type"] == "dropper"


def test_get_iocs_found(client: TestClient) -> None:
    fake = IOCReport(ips=["1.2.3.4"], domains=["evil.com"])
    with patch("sandbox.main._analyzer.get_iocs", return_value=fake):
        resp = client.get("/sandbox/iocs/abc123")
    assert resp.status_code == 200
    assert "1.2.3.4" in resp.json()["ips"]


def test_post_events_returns_204(client: TestClient) -> None:
    from sandbox.models import EventType, PantheonEvent
    event = PantheonEvent(type=EventType.AGENT_ACTIVATED, agent=None)
    resp = client.post("/events", content=event.model_dump_json(), headers={"Content-Type": "application/json"})
    assert resp.status_code == 204


def test_post_events_bad_payload_returns_422(client: TestClient) -> None:
    resp = client.post("/events", json={"not_a_valid": "event"})
    assert resp.status_code == 422


def test_websocket_connects_and_receives_event(client: TestClient) -> None:
    import json
    from sandbox.models import EventType, PantheonEvent
    event = PantheonEvent(type=EventType.TOOL_CALLED, tool="submit_sample")

    with client.websocket_connect("/ws") as ws:
        # Post an event via HTTP — bus should broadcast it to the WS connection
        client.post("/events", content=event.model_dump_json(), headers={"Content-Type": "application/json"})
        data = ws.receive_text()

    received = json.loads(data)
    assert received["type"] == "tool_called"
    assert received["tool"] == "submit_sample"

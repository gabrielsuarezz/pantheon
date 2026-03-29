"""Tests for KnowledgeStore memory endpoints on the Hephaestus sandbox service."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from sandbox.models import MemoryEntry, SimilarJob, StoreMemoryResponse


@pytest.fixture()
def client() -> TestClient:
    from sandbox.main import app
    return TestClient(app)


# --- POST /sandbox/memory ---------------------------------------------------


def test_store_memory_returns_run_number(client: TestClient) -> None:
    fake = StoreMemoryResponse(run_number=1, total_runs=1)
    with patch("sandbox.main._analyzer.store_memory", return_value=fake):
        resp = client.post("/sandbox/memory", json={
            "job_id": "abc123",
            "agent_name": "ares",
            "output": "containment plan text",
            "temperature": 0.3,
        })
    assert resp.status_code == 200
    data = resp.json()
    assert data["run_number"] == 1
    assert data["total_runs"] == 1


def test_store_memory_increments_run_number(client: TestClient) -> None:
    fake_run2 = StoreMemoryResponse(run_number=2, total_runs=2)
    with patch("sandbox.main._analyzer.store_memory", return_value=fake_run2):
        resp = client.post("/sandbox/memory", json={
            "job_id": "abc123",
            "agent_name": "ares",
            "output": "second plan",
            "temperature": 0.6,
        })
    assert resp.status_code == 200
    assert resp.json()["run_number"] == 2


def test_store_memory_passes_correct_args(client: TestClient) -> None:
    mock = MagicMock(return_value=StoreMemoryResponse(run_number=1, total_runs=1))
    with patch("sandbox.main._analyzer.store_memory", mock):
        client.post("/sandbox/memory", json={
            "job_id": "job1",
            "agent_name": "apollo",
            "output": "enrichment output",
            "temperature": 0.6,
        })
    mock.assert_called_once_with("job1", "apollo", "enrichment output", 0.6)


# --- GET /sandbox/memory/{job_id}/{agent_name} ------------------------------


def test_load_memory_empty(client: TestClient) -> None:
    with patch("sandbox.main._analyzer.load_memory", return_value=[]):
        resp = client.get("/sandbox/memory/unknown/ares")
    assert resp.status_code == 200
    assert resp.json() == []


def test_load_memory_returns_ordered_entries(client: TestClient) -> None:
    entries = [
        MemoryEntry(job_id="abc", agent_name="ares", run_number=1, temperature=0.2, output="run 1"),
        MemoryEntry(job_id="abc", agent_name="ares", run_number=2, temperature=0.6, output="run 2"),
    ]
    with patch("sandbox.main._analyzer.load_memory", return_value=entries):
        resp = client.get("/sandbox/memory/abc/ares")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["run_number"] == 1
    assert data[1]["run_number"] == 2
    assert data[0]["output"] == "run 1"


# --- POST /sandbox/fingerprint/{job_id} ------------------------------------


def test_store_fingerprint_ok(client: TestClient) -> None:
    from sandbox.models import FileIOCs, NetworkIOCs, ThreatReport
    fake_report = ThreatReport(
        job_id="abc123", status="complete",
        malware_type="dropper", obfuscation_technique="junk chars",
        behavior=["drops files", "executes wscript"],
        network_iocs=NetworkIOCs(domains=["evil.com"]),
        file_iocs=FileIOCs(sha256="a" * 64, md5="b" * 32),
        risk_level="high", gemini_summary="bad",
    )
    with patch("sandbox.main._analyzer.get_report", return_value=fake_report), \
         patch("sandbox.main._analyzer.store_fingerprint") as mock_fp:
        resp = client.post("/sandbox/fingerprint/abc123")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    mock_fp.assert_called_once_with("abc123")


def test_store_fingerprint_404_if_job_missing(client: TestClient) -> None:
    with patch("sandbox.main._analyzer.get_report", return_value=None):
        resp = client.post("/sandbox/fingerprint/nonexistent")
    assert resp.status_code == 404


# --- GET /sandbox/similar/{job_id} ------------------------------------------


def test_find_similar_empty(client: TestClient) -> None:
    with patch("sandbox.main._analyzer.find_similar", return_value=[]):
        resp = client.get("/sandbox/similar/abc123")
    assert resp.status_code == 200
    assert resp.json() == []


def test_find_similar_returns_scored_matches(client: TestClient) -> None:
    matches = [
        SimilarJob(
            job_id="other1",
            malware_type="dropper",
            similarity=0.75,
            shared_behaviors=["drops files", "wscript"],
        )
    ]
    with patch("sandbox.main._analyzer.find_similar", return_value=matches):
        resp = client.get("/sandbox/similar/abc123")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["similarity"] == 0.75
    assert "drops files" in data[0]["shared_behaviors"]

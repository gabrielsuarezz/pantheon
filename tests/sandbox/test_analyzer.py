from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch
import pytest
from sandbox.analyzer import Analyzer
from sandbox.models import ThreatReport, IOCReport, NetworkIOCs, FileIOCs


@pytest.fixture()
def fake_threat_report() -> ThreatReport:
    return ThreatReport(
        job_id="test-job",
        status="complete",
        malware_type="WSH dropper",
        obfuscation_technique="_0x",
        behavior=["downloads payload"],
        network_iocs=NetworkIOCs(ips=["1.2.3.4"], domains=["evil.com"]),
        file_iocs=FileIOCs(sha256="a" * 64, md5="b" * 32),
        risk_level="critical",
        affected_systems=["Windows"],
        gemini_summary="drops a payload",
    )


@pytest.mark.asyncio()
async def test_run_returns_stored_report(fake_threat_report: ThreatReport) -> None:
    analyzer = Analyzer(db_path=":memory:")
    js_bytes = b"var _0x1=['WScript'];WScript.Run('cmd');"
    b64 = base64.b64encode(js_bytes).decode()

    with (
        patch.object(analyzer, "_run_static", new_callable=AsyncMock, return_value=fake_threat_report),
        patch.object(analyzer, "_run_dynamic", return_value=[]),
    ):
        job_id = await analyzer.submit(b64, "test.js", "both")
        report = analyzer.get_report(job_id)

    assert report is not None
    assert report.malware_type == "WSH dropper"


@pytest.mark.asyncio()
async def test_get_iocs_from_report(fake_threat_report: ThreatReport) -> None:
    analyzer = Analyzer(db_path=":memory:")
    js_bytes = b"var x=1;"
    b64 = base64.b64encode(js_bytes).decode()

    with (
        patch.object(analyzer, "_run_static", new_callable=AsyncMock, return_value=fake_threat_report),
        patch.object(analyzer, "_run_dynamic", return_value=[]),
    ):
        job_id = await analyzer.submit(b64, "test.js", "static")
        iocs = analyzer.get_iocs(job_id)

    assert iocs is not None
    assert "1.2.3.4" in iocs.ips


def test_get_report_unknown_job() -> None:
    analyzer = Analyzer(db_path=":memory:")
    assert analyzer.get_report("nonexistent") is None


def test_get_iocs_unknown_job() -> None:
    analyzer = Analyzer(db_path=":memory:")
    assert analyzer.get_iocs("nonexistent") is None

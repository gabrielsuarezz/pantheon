"""Tests for the Hades → Apollo → Ares pipeline tool functions.

All sandbox HTTP calls (httpx) and Gemini API calls are mocked — no running
sandbox or valid GOOGLE_API_KEY is required to run these tests.

Coverage:
- Hades tools  : sandbox_tools (submit_sample, get_report, get_iocs, poll_report,
                  check_sandbox_health)
- Apollo tools  : report_tools (format_threat_report, summarise_ioc_report,
                  ioc_report_to_json, enrich_iocs_with_threat_intel)
- Ares tools    : remediation_tools (extract_threat_summary_for_ares,
                  generate_containment_plan, generate_remediation_plan,
                  generate_prevention_plan, build_full_response)
- Integration   : full data-flow from ThreatReport through all three stages
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sandbox.models import (
    AnalyzeResponse,
    FileIOCs,
    HealthResponse,
    IOCReport,
    NetworkIOCs,
    ThreatReport,
)
from agents.tools.sandbox_tools import (
    check_sandbox_health,
    get_iocs,
    get_report,
    poll_report,
    submit_sample,
)
from agents.tools.report_tools import (
    enrich_iocs_with_threat_intel,
    format_threat_report,
    ioc_report_to_json,
    summarise_ioc_report,
)
from agents.tools.remediation_tools import (
    build_full_response,
    extract_threat_summary_for_ares,
    generate_containment_plan,
    generate_prevention_plan,
    generate_remediation_plan,
)

# ---------------------------------------------------------------------------
# Shared test fixtures
# ---------------------------------------------------------------------------

MOCK_JOB_ID = "test-job-dead-beef-1234"

MOCK_THREAT_REPORT = ThreatReport(
    job_id=MOCK_JOB_ID,
    status="complete",
    malware_type="WSH dropper",
    obfuscation_technique="javascript-obfuscator _0x string array",
    behavior=[
        "Decodes obfuscated payload via eval()",
        "Drops svchost32.exe to %TEMP%",
        "Establishes persistence via HKCU Run registry key",
        "Beacons to C2 over HTTPS on port 443",
    ],
    network_iocs=NetworkIOCs(
        ips=["198.51.100.42", "203.0.113.7"],
        domains=["evil-c2.example.com", "update.badactor.net"],
        ports=[443, 8080],
        protocols=["https", "http"],
        urls=["https://evil-c2.example.com/payload.bin"],
    ),
    file_iocs=FileIOCs(
        sha256="a" * 64,
        md5="b" * 32,
        paths=[
            "C:\\Users\\victim\\AppData\\Local\\Temp\\svchost32.exe",
            "C:\\ProgramData\\update\\loader.dll",
        ],
    ),
    registry_iocs=[
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater",
    ],
    risk_level="critical",
    affected_systems=["Windows endpoints", "Active Directory"],
    gemini_summary=(
        "A WSH dropper that decodes an obfuscated JS payload, drops a secondary "
        "executable, establishes persistence, and communicates with a C2 server."
    ),
    remediation_hints=[
        "Block outbound traffic to 198.51.100.42 and 203.0.113.7",
        "Remove HKCU Run registry key used for persistence",
        "Delete dropped files from %TEMP% and %ProgramData%",
    ],
)

MOCK_IOC_REPORT = IOCReport(
    ips=["198.51.100.42", "203.0.113.7"],
    domains=["evil-c2.example.com", "update.badactor.net"],
    file_hashes={"sha256": "a" * 64, "md5": "b" * 32},
    file_paths=[
        "C:\\Users\\victim\\AppData\\Local\\Temp\\svchost32.exe",
        "C:\\ProgramData\\update\\loader.dll",
    ],
    ports=[443, 8080],
    registry_keys=[
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Updater",
    ],
    cve_ids=[],
    urls=["https://evil-c2.example.com/payload.bin"],
)


def _make_httpx_mock(
    response_json: dict[str, Any],  # Any: varied Pydantic model shapes
) -> MagicMock:
    """Return a patched ``httpx.AsyncClient`` class that returns *response_json*.

    Usage::

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", _make_httpx_mock({...})):
            result = await some_tool(...)
    """
    mock_response = MagicMock()
    mock_response.json.return_value = response_json
    mock_response.raise_for_status = MagicMock()

    inner: AsyncMock = AsyncMock()
    inner.get.return_value = mock_response
    inner.post.return_value = mock_response

    outer = MagicMock()
    outer.return_value.__aenter__ = AsyncMock(return_value=inner)
    outer.return_value.__aexit__ = AsyncMock(return_value=False)
    return outer  # type: ignore[return-value]


def _make_gemini_mock(text: str) -> MagicMock:
    """Return a ``get_genai_client()`` mock whose ``aio.models.generate_content``
    resolves to a response with ``.text == text``."""
    mock_response = MagicMock()
    mock_response.text = text

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
    return mock_client  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Hades tools — sandbox_tools
# ---------------------------------------------------------------------------


class TestCheckSandboxHealth:
    async def test_returns_health_dict_when_ok(self) -> None:
        health = HealthResponse(status="ok", docker_available=True, version="0.1.0")
        mock_client = _make_httpx_mock(health.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await check_sandbox_health()

        assert result["status"] == "ok"
        assert result["docker_available"] is True
        assert result["version"] == "0.1.0"

    async def test_returns_degraded_when_docker_unavailable(self) -> None:
        health = HealthResponse(status="degraded", docker_available=False)
        mock_client = _make_httpx_mock(health.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await check_sandbox_health()

        assert result["status"] == "degraded"
        assert result["docker_available"] is False


class TestSubmitSample:
    async def test_returns_job_id_and_status(self) -> None:
        analyze_resp = AnalyzeResponse(job_id=MOCK_JOB_ID, status="queued")
        mock_client = _make_httpx_mock(analyze_resp.model_dump())

        with tempfile.NamedTemporaryFile(suffix=".js", delete=False) as f:
            f.write(b"var x = 1;")
            tmp_path = f.name

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await submit_sample(tmp_path, analysis_type="both")

        assert result["job_id"] == MOCK_JOB_ID
        assert result["status"] == "queued"

    async def test_uses_provided_analysis_type(self) -> None:
        analyze_resp = AnalyzeResponse(job_id=MOCK_JOB_ID, status="queued")

        captured_body: dict[str, Any] = {}

        # Capture the POST body to verify analysis_type is forwarded.
        mock_response = MagicMock()
        mock_response.json.return_value = analyze_resp.model_dump()
        mock_response.raise_for_status = MagicMock()

        async def fake_post(url: str, **kwargs: Any) -> MagicMock:
            captured_body.update(kwargs.get("json", {}))
            return mock_response

        inner: AsyncMock = AsyncMock()
        inner.post.side_effect = fake_post
        outer = MagicMock()
        outer.return_value.__aenter__ = AsyncMock(return_value=inner)
        outer.return_value.__aexit__ = AsyncMock(return_value=False)

        with tempfile.NamedTemporaryFile(suffix=".js", delete=False) as f:
            f.write(b"var x = 1;")
            tmp_path = f.name

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", outer):
            await submit_sample(tmp_path, analysis_type="static")

        assert captured_body.get("analysis_type") == "static"


class TestGetReport:
    async def test_returns_threat_report_dict(self) -> None:
        mock_client = _make_httpx_mock(MOCK_THREAT_REPORT.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await get_report(MOCK_JOB_ID)

        assert result["job_id"] == MOCK_JOB_ID
        assert result["status"] == "complete"
        assert result["malware_type"] == "WSH dropper"
        assert result["risk_level"] == "critical"

    async def test_network_iocs_are_preserved(self) -> None:
        mock_client = _make_httpx_mock(MOCK_THREAT_REPORT.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await get_report(MOCK_JOB_ID)

        assert "198.51.100.42" in result["network_iocs"]["ips"]
        assert "evil-c2.example.com" in result["network_iocs"]["domains"]

    async def test_file_iocs_are_preserved(self) -> None:
        mock_client = _make_httpx_mock(MOCK_THREAT_REPORT.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await get_report(MOCK_JOB_ID)

        assert result["file_iocs"]["sha256"] == "a" * 64
        assert len(result["file_iocs"]["paths"]) == 2


class TestGetIocs:
    async def test_returns_ioc_report_dict(self) -> None:
        mock_client = _make_httpx_mock(MOCK_IOC_REPORT.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await get_iocs(MOCK_JOB_ID)

        assert result["ips"] == ["198.51.100.42", "203.0.113.7"]
        assert result["domains"] == ["evil-c2.example.com", "update.badactor.net"]
        assert result["file_hashes"]["sha256"] == "a" * 64
        assert result["ports"] == [443, 8080]
        assert len(result["registry_keys"]) == 1

    async def test_empty_ioc_report(self) -> None:
        empty = IOCReport()
        mock_client = _make_httpx_mock(empty.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await get_iocs(MOCK_JOB_ID)

        assert result["ips"] == []
        assert result["domains"] == []
        assert result["file_hashes"] == {}


class TestPollReport:
    async def test_returns_immediately_when_complete(self) -> None:
        report_dict = MOCK_THREAT_REPORT.model_dump()
        mock_client = _make_httpx_mock(report_dict)

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_client):
            result = await poll_report(MOCK_JOB_ID)

        assert result["status"] == "complete"
        assert result["job_id"] == MOCK_JOB_ID

    async def test_retries_until_complete(self) -> None:
        running = MOCK_THREAT_REPORT.model_dump()
        running["status"] = "running"
        complete = MOCK_THREAT_REPORT.model_dump()

        call_count = 0

        async def fake_get_report(job_id: str) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            return complete if call_count >= 3 else running

        with patch("agents.tools.sandbox_tools.get_report", side_effect=fake_get_report):
            with patch("agents.tools.sandbox_tools.asyncio.sleep", AsyncMock()):
                result = await poll_report(MOCK_JOB_ID)

        assert result["status"] == "complete"
        assert call_count == 3

    async def test_raises_timeout_if_never_completes(self) -> None:
        running = MOCK_THREAT_REPORT.model_dump()
        running["status"] = "running"

        async def always_running(job_id: str) -> dict[str, Any]:
            return running

        with patch("agents.tools.sandbox_tools.get_report", side_effect=always_running):
            with patch("agents.tools.sandbox_tools.asyncio.sleep", AsyncMock()):
                with patch("agents.tools.sandbox_tools._MAX_POLLS", 3):
                    with pytest.raises(TimeoutError, match=MOCK_JOB_ID):
                        await poll_report(MOCK_JOB_ID)

    async def test_returns_failed_status_without_raising(self) -> None:
        failed = MOCK_THREAT_REPORT.model_dump()
        failed["status"] = "failed"

        async def returns_failed(job_id: str) -> dict[str, Any]:
            return failed

        with patch("agents.tools.sandbox_tools.get_report", side_effect=returns_failed):
            result = await poll_report(MOCK_JOB_ID)

        assert result["status"] == "failed"


# ---------------------------------------------------------------------------
# Apollo tools — report_tools
# ---------------------------------------------------------------------------


class TestFormatThreatReport:
    def test_complete_report_contains_all_sections(self) -> None:
        md = format_threat_report(MOCK_THREAT_REPORT.model_dump())

        assert MOCK_JOB_ID in md
        assert "WSH dropper" in md
        assert "CRITICAL" in md
        assert "javascript-obfuscator" in md
        assert "198.51.100.42" in md
        assert "evil-c2.example.com" in md
        assert "a" * 64 in md
        assert "HKCU" in md
        assert "Block outbound traffic" in md

    def test_failed_report_returns_failure_message(self) -> None:
        failed: dict[str, Any] = {"job_id": MOCK_JOB_ID, "status": "failed"}
        md = format_threat_report(failed)

        assert "failed" in md.lower()
        assert MOCK_JOB_ID in md

    def test_report_contains_gemini_summary(self) -> None:
        md = format_threat_report(MOCK_THREAT_REPORT.model_dump())

        assert "WSH dropper" in md
        assert "C2 server" in md

    def test_network_ioc_section_lists_ports(self) -> None:
        md = format_threat_report(MOCK_THREAT_REPORT.model_dump())

        assert "443" in md
        assert "8080" in md

    def test_empty_network_iocs_omits_network_section(self) -> None:
        report = MOCK_THREAT_REPORT.model_dump()
        report["network_iocs"] = {"ips": [], "domains": [], "urls": [], "ports": [], "protocols": []}
        md = format_threat_report(report)

        assert "### Network IOCs" not in md


class TestSummariseIocReport:
    def test_summarises_all_ioc_types(self) -> None:
        summary = summarise_ioc_report(MOCK_IOC_REPORT.model_dump())

        assert "2 malicious IP(s)" in summary
        assert "198.51.100.42" in summary
        assert "2 domain(s)" in summary
        assert "evil-c2.example.com" in summary
        assert "1 registry key(s)" in summary
        assert "2 file path(s)" in summary

    def test_empty_report_returns_no_iocs_message(self) -> None:
        summary = summarise_ioc_report(IOCReport().model_dump())
        assert summary == "No IOCs extracted from this sample."

    def test_sha256_truncated_in_summary(self) -> None:
        summary = summarise_ioc_report(MOCK_IOC_REPORT.model_dump())
        # Full 64-char hash should NOT appear; only a 16-char prefix + "..."
        assert "a" * 64 not in summary
        assert "a" * 16 + "..." in summary


class TestIocReportToJson:
    def test_returns_valid_json(self) -> None:
        result = ioc_report_to_json(MOCK_IOC_REPORT.model_dump())
        parsed = json.loads(result)

        assert parsed["ips"] == ["198.51.100.42", "203.0.113.7"]
        assert parsed["file_hashes"]["sha256"] == "a" * 64

    def test_output_is_compact(self) -> None:
        result = ioc_report_to_json(MOCK_IOC_REPORT.model_dump())
        # Compact JSON uses "," and ":" with no spaces
        assert ", " not in result
        assert ": " not in result

    def test_roundtrip_preserves_all_fields(self) -> None:
        original = MOCK_IOC_REPORT.model_dump()
        roundtrip = json.loads(ioc_report_to_json(original))

        assert roundtrip["ports"] == original["ports"]
        assert roundtrip["registry_keys"] == original["registry_keys"]
        assert roundtrip["urls"] == original["urls"]


class TestEnrichIocsWithThreatIntel:
    async def test_returns_gemini_enrichment_text(self) -> None:
        enrichment_text = "## IOC Enrichment\n- 198.51.100.42: known Cobalt Strike C2"
        mock_gemini = _make_gemini_mock(enrichment_text)

        with patch("agents.tools.report_tools.get_genai_client", return_value=mock_gemini):
            result = await enrich_iocs_with_threat_intel(
                ioc_report_to_json(MOCK_IOC_REPORT.model_dump())
            )

        assert result == enrichment_text

    async def test_fallback_when_gemini_returns_none_text(self) -> None:
        mock_response = MagicMock()
        mock_response.text = None
        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("agents.tools.report_tools.get_genai_client", return_value=mock_client):
            result = await enrich_iocs_with_threat_intel("{}")

        assert result == "(no enrichment generated)"

    async def test_passes_ioc_json_in_prompt(self) -> None:
        captured_prompt: list[str] = []

        mock_response = MagicMock()
        mock_response.text = "enrichment"

        async def capture_generate(
            model: str,
            contents: str,
            **kwargs: Any,
        ) -> MagicMock:
            captured_prompt.append(contents)
            return mock_response

        mock_client = MagicMock()
        mock_client.aio.models.generate_content = capture_generate

        ioc_json = ioc_report_to_json(MOCK_IOC_REPORT.model_dump())
        with patch("agents.tools.report_tools.get_genai_client", return_value=mock_client):
            await enrich_iocs_with_threat_intel(ioc_json)

        assert ioc_json in captured_prompt[0]


# ---------------------------------------------------------------------------
# Ares tools — remediation_tools
# ---------------------------------------------------------------------------


class TestExtractThreatSummaryForAres:
    def test_contains_malware_type_and_risk(self) -> None:
        summary = extract_threat_summary_for_ares(
            MOCK_THREAT_REPORT.model_dump(), "enrichment context"
        )

        assert "WSH dropper" in summary
        assert "CRITICAL" in summary

    def test_contains_network_iocs(self) -> None:
        summary = extract_threat_summary_for_ares(
            MOCK_THREAT_REPORT.model_dump(), ""
        )

        assert "198.51.100.42" in summary
        assert "evil-c2.example.com" in summary

    def test_contains_file_iocs(self) -> None:
        summary = extract_threat_summary_for_ares(
            MOCK_THREAT_REPORT.model_dump(), ""
        )

        assert "a" * 64 in summary
        assert "svchost32.exe" in summary

    def test_contains_registry_iocs(self) -> None:
        summary = extract_threat_summary_for_ares(
            MOCK_THREAT_REPORT.model_dump(), ""
        )

        assert "HKCU" in summary

    def test_appends_enrichment_text(self) -> None:
        enrichment = "Cobalt Strike C2 infrastructure detected"
        summary = extract_threat_summary_for_ares(
            MOCK_THREAT_REPORT.model_dump(), enrichment
        )

        assert enrichment in summary

    def test_empty_enrichment_omits_section(self) -> None:
        summary = extract_threat_summary_for_ares(
            MOCK_THREAT_REPORT.model_dump(), ""
        )

        assert "Threat Intel Enrichment" not in summary

    def test_contains_remediation_hints(self) -> None:
        summary = extract_threat_summary_for_ares(
            MOCK_THREAT_REPORT.model_dump(), ""
        )

        assert "Block outbound traffic" in summary


class TestGenerateContainmentPlan:
    async def test_returns_gemini_plan_text(self) -> None:
        plan = "1. [CRITICAL] Block 198.51.100.42 at the firewall"
        mock_gemini = _make_gemini_mock(plan)

        with patch("agents.tools.remediation_tools.get_genai_client", return_value=mock_gemini):
            result = await generate_containment_plan("threat summary here")

        assert result == plan

    async def test_fallback_when_gemini_returns_none(self) -> None:
        mock_response = MagicMock()
        mock_response.text = None
        mock_client = MagicMock()
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("agents.tools.remediation_tools.get_genai_client", return_value=mock_client):
            result = await generate_containment_plan("summary")

        assert result == "(no plan generated)"


class TestGenerateRemediationPlan:
    async def test_returns_remediation_text(self) -> None:
        plan = "1. Remove C:\\Temp\\svchost32.exe\n2. Delete registry key"
        mock_gemini = _make_gemini_mock(plan)

        with patch("agents.tools.remediation_tools.get_genai_client", return_value=mock_gemini):
            result = await generate_remediation_plan("threat summary here")

        assert result == plan


class TestGeneratePreventionPlan:
    async def test_returns_prevention_text(self) -> None:
        plan = "1. Enable ASR rules\n2. Deploy YARA rule for _0x obfuscation"
        mock_gemini = _make_gemini_mock(plan)

        with patch("agents.tools.remediation_tools.get_genai_client", return_value=mock_gemini):
            result = await generate_prevention_plan("threat summary here")

        assert result == plan


class TestBuildFullResponse:
    def test_assembles_all_sections(self) -> None:
        doc = build_full_response(
            threat_report_md="## Threat Report",
            enrichment="## Enrichment",
            containment="1. Block IP",
            remediation="1. Delete files",
            prevention="1. Enable EDR",
        )

        assert "# Pantheon Incident Response Report" in doc
        assert "## Threat Intelligence Enrichment" in doc
        assert "## Containment Plan" in doc
        assert "## Remediation Plan" in doc
        assert "## Prevention Recommendations" in doc

    def test_content_is_preserved_verbatim(self) -> None:
        containment = "1. [CRITICAL] Isolate host at 198.51.100.42"
        doc = build_full_response(
            threat_report_md="report",
            enrichment="enrichment",
            containment=containment,
            remediation="remediation",
            prevention="prevention",
        )

        assert containment in doc

    def test_sections_appear_in_pipeline_order(self) -> None:
        doc = build_full_response(
            threat_report_md="THREAT",
            enrichment="ENRICH",
            containment="CONTAIN",
            remediation="REMEDI",
            prevention="PREVENT",
        )

        positions = [doc.index(s) for s in ["THREAT", "ENRICH", "CONTAIN", "REMEDI", "PREVENT"]]
        assert positions == sorted(positions)


# ---------------------------------------------------------------------------
# Integration: full Hades → Apollo → Ares data flow
# ---------------------------------------------------------------------------


class TestPipelineIntegration:
    """Verify that model data flows intact from sandbox through all three agents."""

    async def test_threat_report_fields_survive_to_ares_summary(self) -> None:
        """ThreatReport from sandbox → format_threat_report (Apollo) →
        extract_threat_summary_for_ares (Ares): key IOCs must be present at every stage."""
        # Stage 1 — Hades: sandbox returns a ThreatReport
        mock_http = _make_httpx_mock(MOCK_THREAT_REPORT.model_dump())

        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_http):
            threat_report_dict = await get_report(MOCK_JOB_ID)

        assert threat_report_dict["status"] == "complete"

        # Stage 2a — Apollo: format the report as markdown
        threat_report_md = format_threat_report(threat_report_dict)
        assert "198.51.100.42" in threat_report_md
        assert "CRITICAL" in threat_report_md

        # Stage 2b — Apollo: fetch IOCs and serialise
        mock_http_ioc = _make_httpx_mock(MOCK_IOC_REPORT.model_dump())
        with patch("agents.tools.sandbox_tools.httpx.AsyncClient", mock_http_ioc):
            ioc_dict = await get_iocs(MOCK_JOB_ID)

        ioc_json = ioc_report_to_json(ioc_dict)
        ioc_summary = summarise_ioc_report(ioc_dict)
        assert "evil-c2.example.com" in ioc_summary

        # Stage 2c — Apollo: enrich with threat intel (mocked Gemini)
        enrichment = "Cobalt Strike C2 at 198.51.100.42 — high confidence"
        mock_gemini = _make_gemini_mock(enrichment)
        with patch("agents.tools.report_tools.get_genai_client", return_value=mock_gemini):
            enrichment_result = await enrich_iocs_with_threat_intel(ioc_json)

        assert enrichment_result == enrichment

        # Stage 3a — Ares: extract summary
        ares_summary = extract_threat_summary_for_ares(threat_report_dict, enrichment_result)
        assert "WSH dropper" in ares_summary
        assert "198.51.100.42" in ares_summary
        assert enrichment in ares_summary

        # Stage 3b — Ares: generate all three plans (mocked Gemini)
        containment_text = "1. [CRITICAL] Block 198.51.100.42"
        remediation_text = "1. Delete svchost32.exe from %TEMP%"
        prevention_text = "1. Deploy YARA rule for _0x obfuscation pattern"

        with patch(
            "agents.tools.remediation_tools.get_genai_client",
            return_value=_make_gemini_mock(containment_text),
        ):
            containment = await generate_containment_plan(ares_summary)

        with patch(
            "agents.tools.remediation_tools.get_genai_client",
            return_value=_make_gemini_mock(remediation_text),
        ):
            remediation = await generate_remediation_plan(ares_summary)

        with patch(
            "agents.tools.remediation_tools.get_genai_client",
            return_value=_make_gemini_mock(prevention_text),
        ):
            prevention = await generate_prevention_plan(ares_summary)

        # Stage 3c — Ares: assemble final incident report
        final_report = build_full_response(
            threat_report_md=threat_report_md,
            enrichment=enrichment_result,
            containment=containment,
            remediation=remediation,
            prevention=prevention,
        )

        # Verify the complete document contains key IOCs end-to-end
        assert "198.51.100.42" in final_report
        assert "evil-c2.example.com" in final_report
        assert "WSH dropper" in final_report
        assert containment_text in final_report
        assert remediation_text in final_report
        assert prevention_text in final_report
        assert enrichment in final_report
        assert "# Pantheon Incident Response Report" in final_report

    async def test_poll_then_pipeline_with_retry(self) -> None:
        """poll_report retries twice before completing, then Apollo/Ares tools
        receive the same ThreatReport."""
        call_count = 0
        running = MOCK_THREAT_REPORT.model_dump()
        running["status"] = "running"
        complete = MOCK_THREAT_REPORT.model_dump()

        async def staged_get_report(job_id: str) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            return complete if call_count >= 2 else running

        with patch("agents.tools.sandbox_tools.get_report", side_effect=staged_get_report):
            with patch("agents.tools.sandbox_tools.asyncio.sleep", AsyncMock()):
                result = await poll_report(MOCK_JOB_ID)

        assert result["status"] == "complete"
        assert call_count == 2

        # Downstream tools receive the complete report cleanly
        md = format_threat_report(result)
        assert "WSH dropper" in md

        summary = extract_threat_summary_for_ares(result, "")
        assert "CRITICAL" in summary

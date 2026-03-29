from __future__ import annotations

from unittest.mock import AsyncMock, patch
import pytest
from sandbox.static.gemini_analyst import GeminiAnalyst
from sandbox.models import RiskLevel


@pytest.fixture()
def mock_gemini_response() -> str:
    return """
    {
      "malware_type": "WSH dropper",
      "obfuscation_technique": "javascript-obfuscator _0x string array",
      "behavior": ["downloads payload from C2", "establishes persistence via registry"],
      "risk_level": "critical",
      "affected_systems": ["Windows workstations", "Active Directory"],
      "network_iocs": {"ips": ["1.2.3.4"], "domains": ["evil.com"], "ports": [4444], "protocols": ["TCP"], "urls": []},
      "registry_iocs": ["HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\updater"],
      "remediation_hints": ["Block 1.2.3.4 at firewall", "Remove registry persistence key"]
    }
    """


@pytest.mark.asyncio()
async def test_analyze_returns_threat_report(mock_gemini_response: str) -> None:
    analyst = GeminiAnalyst(api_key="test-key")
    with patch.object(analyst, "_call_gemini", new_callable=AsyncMock, return_value=mock_gemini_response):
        report = await analyst.analyze(summary_text="WScript.Shell http://evil.com/payload.exe")
    assert report.malware_type == "WSH dropper"
    assert report.risk_level == "critical"
    assert "1.2.3.4" in report.network_iocs.ips


@pytest.mark.asyncio()
async def test_analyze_handles_malformed_json(mock_gemini_response: str) -> None:
    analyst = GeminiAnalyst(api_key="test-key")
    with patch.object(analyst, "_call_gemini", new_callable=AsyncMock, return_value="not valid json"):
        report = await analyst.analyze(summary_text="some strings")
    # Should return a default report rather than raising
    assert report.malware_type  # non-empty fallback
    assert report.risk_level in ("low", "medium", "high", "critical")


@pytest.mark.asyncio()
async def test_analyze_sanitizes_bare_backslashes() -> None:
    # Gemini sometimes returns Windows paths with bare backslashes, which are
    # invalid JSON escapes. The sanitizer should recover the structured data.
    raw_with_backslashes = """{
      "malware_type": "WSH dropper",
      "obfuscation_technique": "none",
      "behavior": ["drops payload"],
      "risk_level": "high",
      "affected_systems": ["Windows workstations"],
      "network_iocs": {"ips": [], "domains": [], "ports": [], "protocols": [], "urls": []},
      "registry_iocs": ["HKEY_CURRENT_USER\\Software\\Microsoft\\Run\\updater"],
      "remediation_hints": ["Remove registry key"]
    }"""
    analyst = GeminiAnalyst(api_key="test-key")
    with patch.object(analyst, "_call_gemini", new_callable=AsyncMock, return_value=raw_with_backslashes):
        report = await analyst.analyze(summary_text="WScript.Shell")
    assert report.malware_type == "WSH dropper"
    assert report.risk_level == "high"
    assert report.registry_iocs  # recovered despite bare backslashes

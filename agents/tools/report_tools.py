"""Report formatting and Gemini-powered IOC enrichment tools for Apollo.

These tools turn raw ThreatReport / IOCReport dicts into structured, human-
readable output that the LLM can include in the final incident report.
"""

from __future__ import annotations

import json
import os
from typing import Any

from google import genai
from google.genai import types as genai_types

from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType
_MODEL: str = "gemini-2.5-flash"


def _gemini_client() -> genai.Client:
    """Return an authenticated Gemini client using GEMINI_API."""
    api_key: str = os.environ["GEMINI_API"]
    return genai.Client(api_key=api_key)


async def enrich_iocs_with_threat_intel(ioc_report_json: str) -> str:
    """Use Gemini to enrich a raw IOCReport with threat intelligence context.

    Takes a JSON string of an IOCReport dict and asks Gemini to research each
    indicator, identify known threat actor or malware family associations, and
    summarise the findings in plain language.

    Args:
        ioc_report_json: JSON-encoded IOCReport dict (use ``json.dumps`` on the
            dict returned by :func:`~agents.tools.sandbox_tools.get_iocs`).

    Returns:
        Plain-text threat intelligence enrichment from Gemini (markdown).
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.APOLLO,
        tool="enrich_iocs_with_threat_intel",
        payload={"ioc_report_length": len(ioc_report_json)},
    )
    client = _gemini_client()
    prompt = (
        "You are a threat intelligence analyst. Below is a set of indicators of "
        "compromise (IOCs) extracted from a malware sample.\n\n"
        "For each non-empty IOC category, provide:\n"
        "1. A brief description of what each indicator suggests.\n"
        "2. Any known associations with malware families, threat actors, or campaigns.\n"
        "3. A severity assessment (low/medium/high/critical) for each indicator.\n\n"
        "Be specific, technical, and concise. Format as structured markdown.\n\n"
        f"IOC Report:\n```json\n{ioc_report_json}\n```"
    )
    response = await client.aio.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=2048,
        ),
    )
    result = response.text or "(no enrichment generated)"
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.APOLLO,
        tool="enrich_iocs_with_threat_intel",
        payload={"enrichment_length": len(result)},
    )
    return result


def format_threat_report(report: dict[str, Any]) -> str:  # Any: nested ThreatReport data
    """Format a ThreatReport dict as a concise markdown incident report.

    Suitable for display in Telegram or for passing as context to downstream
    agents (Ares).

    Args:
        report: Dict representation of a :class:`~sandbox.models.ThreatReport`
            with status ``"complete"`` or ``"failed"``.

    Returns:
        Markdown string summarising the threat analysis.
    """
    status = report.get("status", "unknown")
    if status == "failed":
        return f"**Analysis failed** for job `{report.get('job_id', 'N/A')}`."

    malware_type = report.get("malware_type", "Unknown")
    risk = report.get("risk_level", "unknown").upper()
    obfuscation = report.get("obfuscation_technique", "none")
    behaviors: list[str] = report.get("behavior", [])
    affected: list[str] = report.get("affected_systems", [])
    registry: list[str] = report.get("registry_iocs", [])
    hints: list[str] = report.get("remediation_hints", [])
    gemini_summary: str = report.get("gemini_summary", "")

    network: dict[str, Any] = report.get("network_iocs", {})  # Any: nested lists
    file_iocs: dict[str, Any] = report.get("file_iocs", {})  # Any: nested fields

    lines: list[str] = [
        f"## Threat Analysis Report — `{report.get('job_id', 'N/A')}`",
        "",
        f"**Malware Type:** {malware_type}  ",
        f"**Risk Level:** {risk}  ",
        f"**Obfuscation:** {obfuscation}",
        "",
    ]

    if gemini_summary:
        lines += ["### Summary", gemini_summary, ""]

    if behaviors:
        lines += ["### Observed Behaviors"]
        lines += [f"- {b}" for b in behaviors]
        lines.append("")

    if affected:
        lines += ["### Affected Systems"]
        lines += [f"- {s}" for s in affected]
        lines.append("")

    # Network IOCs
    ips: list[str] = network.get("ips", [])
    domains: list[str] = network.get("domains", [])
    urls: list[str] = network.get("urls", [])
    ports: list[int] = network.get("ports", [])
    if ips or domains or urls or ports:
        lines.append("### Network IOCs")
        if ips:
            lines.append(f"- **IPs:** {', '.join(ips)}")
        if domains:
            lines.append(f"- **Domains:** {', '.join(domains)}")
        if urls:
            lines.append(f"- **URLs:** {', '.join(urls)}")
        if ports:
            lines.append(f"- **Ports:** {', '.join(str(p) for p in ports)}")
        lines.append("")

    # File IOCs
    sha256: str = file_iocs.get("sha256", "")
    md5: str = file_iocs.get("md5", "")
    paths: list[str] = file_iocs.get("paths", [])
    if sha256 or md5 or paths:
        lines.append("### File IOCs")
        if sha256:
            lines.append(f"- **SHA-256:** `{sha256}`")
        if md5:
            lines.append(f"- **MD5:** `{md5}`")
        for p in paths:
            lines.append(f"- `{p}`")
        lines.append("")

    if registry:
        lines += ["### Registry IOCs"]
        lines += [f"- `{r}`" for r in registry]
        lines.append("")

    if hints:
        lines += ["### Remediation Hints"]
        lines += [f"- {h}" for h in hints]
        lines.append("")

    return "\n".join(lines)


def summarise_ioc_report(ioc_report: dict[str, Any]) -> str:  # Any: IOCReport fields
    """Produce a compact one-paragraph IOC summary for agent context passing.

    Args:
        ioc_report: Dict representation of an :class:`~sandbox.models.IOCReport`.

    Returns:
        Single paragraph summarising the IOC counts and highlights.
    """
    ips: list[str] = ioc_report.get("ips", [])
    domains: list[str] = ioc_report.get("domains", [])
    urls: list[str] = ioc_report.get("urls", [])
    ports: list[int] = ioc_report.get("ports", [])
    paths: list[str] = ioc_report.get("file_paths", [])
    reg_keys: list[str] = ioc_report.get("registry_keys", [])
    hashes: dict[str, str] = ioc_report.get("file_hashes", {})
    cves: list[str] = ioc_report.get("cve_ids", [])

    parts: list[str] = []
    if ips:
        parts.append(f"{len(ips)} malicious IP(s): {', '.join(ips[:3])}")
    if domains:
        parts.append(f"{len(domains)} domain(s): {', '.join(domains[:3])}")
    if urls:
        parts.append(f"{len(urls)} URL(s) contacted")
    if ports:
        parts.append(f"ports {', '.join(str(p) for p in ports)}")
    if paths:
        parts.append(f"{len(paths)} file path(s) created/modified")
    if reg_keys:
        parts.append(f"{len(reg_keys)} registry key(s) touched")
    if hashes:
        sha = hashes.get("sha256", "")
        parts.append(f"SHA-256 {sha[:16]}..." if sha else "file hashes present")
    if cves:
        parts.append(f"CVEs: {', '.join(cves)}")

    if not parts:
        return "No IOCs extracted from this sample."
    return "IOC summary: " + "; ".join(parts) + "."


def ioc_report_to_json(ioc_report: dict[str, Any]) -> str:  # Any: IOCReport fields
    """Serialise an IOCReport dict to a compact JSON string.

    Used to pass IOC data to :func:`enrich_iocs_with_threat_intel`.

    Args:
        ioc_report: Dict representation of an :class:`~sandbox.models.IOCReport`.

    Returns:
        Compact JSON string.
    """
    return json.dumps(ioc_report, separators=(",", ":"))

"""Gemini-powered containment, remediation, and prevention plan tools for Ares.

Each tool takes a structured threat summary and returns an actionable plan as a
markdown string. These are designed to be called by the Ares ADK agent.
"""

from __future__ import annotations

import os
from typing import Any

from google import genai
from google.genai import types as genai_types

from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType

_MODEL: str = "gemini-2.5-flash"

_CONTAINMENT_PROMPT = """\
You are an incident response engineer. A malware sample has been analysed.
Based on the threat summary below, provide an IMMEDIATE containment plan.

Requirements:
- List concrete, actionable steps numbered 1-10 (use fewer if sufficient).
- Focus on stopping the threat RIGHT NOW: network isolation, process kills,
  account lockouts, firewall rules, EDR quarantine actions.
- Be specific: include exact commands or tool names where possible.
- Mark each step with an urgency label: [CRITICAL], [HIGH], or [MEDIUM].

Threat Summary:
{summary}

Respond in markdown with a numbered list.
"""

_REMEDIATION_PROMPT = """\
You are an incident response engineer. A malware sample has been analysed and
the environment has been contained. Now provide a full REMEDIATION plan.

Requirements:
- List numbered steps to fully eradicate the malware and restore systems.
- Cover: file removal, registry cleanup, credential rotation, patch application,
  re-imaging if necessary, and verification steps.
- Reference specific IOCs from the threat summary where relevant.
- Include roll-back guidance if remediation steps could cause service disruption.

Threat Summary:
{summary}

Respond in markdown with a numbered list.
"""

_PREVENTION_PROMPT = """\
You are a security architect. A malware incident has been fully remediated.
Based on the threat summary below, provide a PREVENTION plan to stop this class
of attack from recurring.

Requirements:
- List numbered long-term prevention recommendations.
- Cover: EDR/AV tuning, network segmentation, patch management, user training,
  detection rules (YARA / Sigma signatures), and monitoring improvements.
- Include at least one concrete YARA or Sigma rule fragment tailored to the IOCs.
- Prioritise recommendations by effort/impact.

Threat Summary:
{summary}

Respond in markdown with a numbered list.
"""


def _gemini_client() -> genai.Client:
    """Return an authenticated Gemini client using GEMINI_API."""
    api_key: str = os.environ["GEMINI_API"]
    return genai.Client(api_key=api_key)


def _workflow_payload(
    *,
    workflow: str | None,
    branch: str | None,
) -> dict[str, str]:
    payload: dict[str, str] = {}
    if workflow is not None:
        payload["workflow"] = workflow
    if branch is not None:
        payload["branch"] = branch
    return payload


async def _generate(prompt: str) -> str:
    """Send *prompt* to Gemini and return the text response."""
    client = _gemini_client()
    response = await client.aio.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=2048,
        ),
    )
    return response.text or "(no plan generated)"


async def generate_containment_plan(
    threat_summary: str,
    *,
    workflow: str | None = None,
    branch: str | None = None,
) -> str:
    """Generate an immediate containment plan for the detected threat.

    Uses Gemini to produce numbered, urgency-labelled containment steps
    (network isolation, process termination, firewall rules, etc.).

    Args:
        threat_summary: Plain-text or markdown description of the threat,
            including malware type, behaviours, risk level, and IOCs.
            Use the output of
            :func:`~agents.tools.report_tools.format_threat_report` or
            the ``gemini_summary`` field from the ThreatReport.

    Returns:
        Markdown numbered list of containment steps.
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.ARES,
        tool="generate_containment_plan",
        payload={
            "summary_length": len(threat_summary),
            **_workflow_payload(workflow=workflow, branch=branch),
        },
    )
    result = await _generate(_CONTAINMENT_PROMPT.format(summary=threat_summary))
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.ARES,
        tool="generate_containment_plan",
        payload={
            "plan_length": len(result),
            **_workflow_payload(workflow=workflow, branch=branch),
        },
    )
    return result


async def generate_remediation_plan(
    threat_summary: str,
    *,
    workflow: str | None = None,
    branch: str | None = None,
) -> str:
    """Generate a full remediation plan to eradicate the malware.

    Uses Gemini to produce numbered steps covering file removal, registry
    cleanup, credential rotation, patching, and verification.

    Args:
        threat_summary: Plain-text or markdown threat description (same format
            as :func:`generate_containment_plan`).

    Returns:
        Markdown numbered list of remediation steps.
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.ARES,
        tool="generate_remediation_plan",
        payload={
            "summary_length": len(threat_summary),
            **_workflow_payload(workflow=workflow, branch=branch),
        },
    )
    result = await _generate(_REMEDIATION_PROMPT.format(summary=threat_summary))
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.ARES,
        tool="generate_remediation_plan",
        payload={
            "plan_length": len(result),
            **_workflow_payload(workflow=workflow, branch=branch),
        },
    )
    return result


async def generate_prevention_plan(
    threat_summary: str,
    *,
    workflow: str | None = None,
    branch: str | None = None,
) -> str:
    """Generate a long-term prevention plan tailored to the threat class.

    Uses Gemini to produce recommendations including EDR tuning, detection
    rules (YARA/Sigma), network segmentation, and monitoring improvements.

    Args:
        threat_summary: Plain-text or markdown threat description (same format
            as :func:`generate_containment_plan`).

    Returns:
        Markdown numbered list of prevention recommendations including at least
        one concrete YARA or Sigma rule fragment.
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.ARES,
        tool="generate_prevention_plan",
        payload={
            "summary_length": len(threat_summary),
            **_workflow_payload(workflow=workflow, branch=branch),
        },
    )
    result = await _generate(_PREVENTION_PROMPT.format(summary=threat_summary))
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.ARES,
        tool="generate_prevention_plan",
        payload={
            "plan_length": len(result),
            **_workflow_payload(workflow=workflow, branch=branch),
        },
    )
    return result


def build_full_response(
    threat_report_md: str,
    enrichment: str,
    containment: str,
    remediation: str,
    prevention: str,
    *,
    impact_analysis: str = "",
) -> str:
    """Assemble the complete Pantheon incident response document.

    Concatenates all agent outputs into a single markdown document that Zeus
    can pass back to Hermes for delivery to the analyst via Telegram/voice.

    Args:
        threat_report_md: Formatted ThreatReport markdown from Apollo.
        enrichment: Threat intel enrichment text from Apollo.
        containment: Containment plan from Ares.
        remediation: Remediation plan from Ares.
        prevention: Prevention plan from Ares.

    Returns:
        Full incident response markdown document.
    """
    sections: list[str] = [
        "# Pantheon Incident Response Report",
        "",
        threat_report_md,
        "---",
        "## Threat Intelligence Enrichment",
        "",
        enrichment,
    ]
    if impact_analysis:
        sections.extend(
            [
                "---",
                "## Critical Infrastructure Impact",
                "",
                impact_analysis,
            ]
        )
    sections.extend(
        [
            "---",
            "## Containment Plan",
            "",
            containment,
            "---",
            "## Remediation Plan",
            "",
            remediation,
            "---",
            "## Prevention Recommendations",
            "",
            prevention,
        ]
    )
    return "\n".join(sections)


def extract_threat_summary_for_ares(
    threat_report: dict[str, Any],  # Any: nested ThreatReport data
    enrichment: str,
) -> str:
    """Produce a compact threat summary string for Ares plan generation tools.

    Combines key ThreatReport fields with Apollo's threat intel enrichment into
    a single text block suitable as the ``threat_summary`` argument for the
    Ares plan tools.

    Args:
        threat_report: Dict representation of a completed ThreatReport.
        enrichment: Plain-text enrichment from
            :func:`~agents.tools.report_tools.enrich_iocs_with_threat_intel`.

    Returns:
        Compact threat summary string.
    """
    malware_type: str = threat_report.get("malware_type", "Unknown malware")
    risk: str = threat_report.get("risk_level", "unknown")
    behaviors: list[str] = threat_report.get("behavior", [])
    affected: list[str] = threat_report.get("affected_systems", [])
    registry: list[str] = threat_report.get("registry_iocs", [])
    hints: list[str] = threat_report.get("remediation_hints", [])
    gemini_summary: str = threat_report.get("gemini_summary", "")

    network: dict[str, Any] = threat_report.get("network_iocs", {})  # Any: nested
    file_iocs: dict[str, Any] = threat_report.get("file_iocs", {})   # Any: nested

    lines: list[str] = [
        f"Malware Type: {malware_type}",
        f"Risk Level: {risk.upper()}",
    ]
    if gemini_summary:
        lines.append(f"Analysis: {gemini_summary}")
    if behaviors:
        lines.append("Behaviors: " + "; ".join(behaviors))
    if affected:
        lines.append("Affected Systems: " + ", ".join(affected))

    ips: list[str] = network.get("ips", [])
    domains: list[str] = network.get("domains", [])
    if ips:
        lines.append(f"Malicious IPs: {', '.join(ips)}")
    if domains:
        lines.append(f"Malicious Domains: {', '.join(domains)}")

    sha256: str = file_iocs.get("sha256", "")
    paths: list[str] = file_iocs.get("paths", [])
    if sha256:
        lines.append(f"Sample SHA-256: {sha256}")
    if paths:
        lines.append("Dropped Files: " + ", ".join(paths))
    if registry:
        lines.append("Registry Keys: " + ", ".join(registry))
    if hints:
        lines.append("Remediation Hints: " + "; ".join(hints))
    if enrichment:
        lines.append(f"\nThreat Intel Enrichment:\n{enrichment}")

    return "\n".join(lines)

"""Agent tools package — exports all callable tools for Hades, Apollo, Ares, and Athena."""

from __future__ import annotations

from agents.tools.triage_tools import classify_threat, create_incident_ticket
from agents.tools.remediation_tools import (
    build_full_response,
    extract_threat_summary_for_ares,
    generate_containment_plan,
    generate_prevention_plan,
    generate_remediation_plan,
)
from agents.tools.report_tools import (
    enrich_iocs_with_threat_intel,
    format_threat_report,
    ioc_report_to_json,
    summarise_ioc_report,
)
from agents.tools.sandbox_tools import (
    check_sandbox_health,
    get_iocs,
    get_report,
    poll_report,
    submit_sample,
)

__all__ = [
    # triage tools (for Athena)
    "classify_threat",
    "create_incident_ticket",
    # sandbox tools
    "submit_sample",
    "get_report",
    "get_iocs",
    "poll_report",
    "check_sandbox_health",
    # report tools
    "enrich_iocs_with_threat_intel",
    "format_threat_report",
    "summarise_ioc_report",
    "ioc_report_to_json",
    # remediation tools
    "generate_containment_plan",
    "generate_remediation_plan",
    "generate_prevention_plan",
    "build_full_response",
    "extract_threat_summary_for_ares",
]

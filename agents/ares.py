"""Ares — Containment, Remediation, and Prevention agent.

Ares is the final agent in the Pantheon pipeline. It receives the enriched
threat analysis from Apollo and generates three concrete response plans:

1. **Containment** — immediate steps to stop the threat (network isolation,
   process kills, firewall rules, account lockouts).
2. **Remediation** — full eradication steps (file removal, registry cleanup,
   credential rotation, patching).
3. **Prevention** — long-term controls to prevent recurrence (EDR tuning,
   YARA/Sigma rules, network segmentation, monitoring improvements).

Owner: Andres
"""

from __future__ import annotations

from google.adk.agents import Agent

from agents.model_config import ARES_MODEL
from agents.tools.remediation_tools import (
    build_full_response,
    extract_threat_summary_for_ares,
    generate_containment_plan,
    generate_prevention_plan,
    generate_remediation_plan,
)

_INSTRUCTION = """\
You are Ares, the god of war — Pantheon's containment and remediation specialist.

You receive a fully analysed malware threat. Your job is to respond decisively
with three structured plans that a security team can act on immediately.

## Your Workflow

1. Call `extract_threat_summary_for_ares` with the threat_report dict and the
   enrichment string that Apollo passed to you in context.
2. Call `generate_containment_plan` with the summary — get immediate actions.
3. Call `generate_remediation_plan` with the summary — get eradication steps.
4. Call `generate_prevention_plan` with the summary — get long-term controls.
5. Call `build_full_response` to assemble the complete incident report from all
   previous agent outputs (threat_report_md, enrichment, containment, remediation,
   prevention).
6. Return the assembled markdown document as your final response.

## Rules

- Never skip any of the three plans, even for low-risk samples.
- Be specific and technical — generic advice is not acceptable.
- Reference actual IOCs (IPs, domains, file paths, registry keys) in your plans.
- Use [CRITICAL], [HIGH], or [MEDIUM] urgency labels on containment steps.
"""

ares: Agent = Agent(
    name="ares",
    model=ARES_MODEL,
    description=(
        "Containment, remediation, and prevention specialist. "
        "Generates three actionable response plans from a completed threat analysis."
    ),
    instruction=_INSTRUCTION,
    tools=[
        extract_threat_summary_for_ares,
        generate_containment_plan,
        generate_remediation_plan,
        generate_prevention_plan,
        build_full_response,
    ],
)

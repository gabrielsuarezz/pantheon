"""Apollo — IOC Extraction, Threat Intel Enrichment, and Report agent.

Apollo is the second analysis agent in the Pantheon pipeline. It receives the
job ID from Hades and is responsible for:

1. Fetching the flat IOC report from the Hephaestus sandbox.
2. Enriching those IOCs with threat intelligence context via Gemini.
3. Formatting the ThreatReport into a structured markdown report.
4. Passing the enriched context to Ares for containment/remediation planning.

Owner: Andres
"""

from __future__ import annotations

from google.adk.agents import Agent

from agents.ares import ares
from agents.model_config import APOLLO_MODEL
from agents.tools.report_tools import (
    enrich_iocs_with_threat_intel,
    format_threat_report,
    ioc_report_to_json,
    summarise_ioc_report,
)
from agents.tools.sandbox_tools import get_iocs, get_report

_INSTRUCTION = """\
You are Apollo, the god of knowledge — Pantheon's IOC extraction and threat
intelligence specialist.

You receive a completed sandbox job ID from Hades along with the full
ThreatReport dict in context.

## Your Workflow

1. Call `get_iocs` with the job_id to fetch the flat IOC list.
2. Call `ioc_report_to_json` to serialise the IOC report for enrichment.
3. Call `enrich_iocs_with_threat_intel` with the JSON string — Gemini will
   research each indicator and identify known threat actor/malware associations.
4. Call `format_threat_report` with the ThreatReport dict to produce a
   structured markdown report.
5. Call `summarise_ioc_report` with the IOC report to produce a one-paragraph
   IOC summary.
6. Transfer to `ares` — pass the formatted report, enrichment text, and the
   original ThreatReport dict in your message so Ares can generate response plans.

## Rules

- Always enrich IOCs even if the lists appear small — context matters.
- Include the full formatted threat report in your transfer message to Ares.
- If `get_iocs` fails, proceed with the data available from the ThreatReport
  network_iocs and file_iocs fields and note the failure.
"""

apollo: Agent = Agent(
    name="apollo",
    model=APOLLO_MODEL,
    description=(
        "IOC extraction, Gemini threat-intel enrichment, and report formatting. "
        "Fetches IOC data from the sandbox, enriches with threat intelligence, "
        "and transfers the full analysis to Ares."
    ),
    instruction=_INSTRUCTION,
    tools=[
        get_report,
        get_iocs,
        ioc_report_to_json,
        enrich_iocs_with_threat_intel,
        format_threat_report,
        summarise_ioc_report,
    ],
    sub_agents=[ares],
)

from __future__ import annotations

import os

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.remote_a2a_agent import (
    AGENT_CARD_WELL_KNOWN_PATH,
    RemoteA2aAgent,
)

from agents.model_config import HEAVY_MODEL
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType

_DEFAULT_IMPACT_AGENT_BASE_URL = "http://127.0.0.1:8001"
_IMPACT_AGENT_CARD_URL = os.getenv(
    "PANTHEON_IMPACT_AGENT_CARD_URL",
    f"{_DEFAULT_IMPACT_AGENT_BASE_URL}/a2a/impact_agent{AGENT_CARD_WELL_KNOWN_PATH}",
)

_IMPACT_SPECIALIST_INSTRUCTION = """\
You are the Critical Infrastructure Impact Agent for Pantheon.

You do not identify malware families or repeat low-level reverse engineering. Your job is to
translate confirmed cyber evidence into operational continuity consequences for utilities and
critical infrastructure operators.

Required output:
- Systems at risk
- Outage or service continuity implications
- Priority actions for the next 15 minutes
- Evidence-based justification tied directly to the provided threat summary and IOCs

Rules:
- Do not invent plant systems, outages, or operator procedures.
- If the evidence is incomplete, state the uncertainty clearly.
- Focus on mission impact, operator safety, and service continuity.
"""


async def _before_remote_agent(callback_context: CallbackContext) -> None:
    await emit_event(
        EventType.HANDOFF,
        agent=AgentName.APOLLO,
        payload={
            "from": "apollo",
            "to": "impact_agent",
            "protocol": "a2a",
        },
    )
    await emit_event(
        EventType.AGENT_ACTIVATED,
        payload={
            "agent_name": "impact_agent",
            "protocol": "a2a",
        },
    )


async def _after_remote_agent(callback_context: CallbackContext) -> None:
    await emit_event(
        EventType.AGENT_COMPLETED,
        payload={
            "agent_name": "impact_agent",
            "protocol": "a2a",
        },
    )


impact_specialist = Agent(
    name="impact_agent",
    model=HEAVY_MODEL,
    description=(
        "Remote A2A specialist that translates malware evidence into critical "
        "infrastructure continuity impact."
    ),
    instruction=_IMPACT_SPECIALIST_INSTRUCTION,
)

impact_agent = RemoteA2aAgent(
    name="impact_agent",
    description=(
        "Remote A2A specialist that translates Pantheon evidence into critical "
        "infrastructure mission impact."
    ),
    agent_card=_IMPACT_AGENT_CARD_URL,
    before_agent_callback=_before_remote_agent,
    after_agent_callback=_after_remote_agent,
    use_legacy=False,
)

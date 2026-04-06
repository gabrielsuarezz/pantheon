from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext

from agents.model_config import HEAVY_MODEL, litellm_for
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType


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
        EventType.HANDOFF.value,
        agent=AgentName.APOLLO.value,
        payload='{"from": "apollo", "to": "impact_agent", "protocol": "a2a"}',
    )
    await emit_event(
        EventType.AGENT_ACTIVATED.value,
        payload='{"agent_name": "impact_agent", "protocol": "a2a"}',
    )


async def _after_remote_agent(callback_context: CallbackContext) -> None:
    await emit_event(
        EventType.AGENT_COMPLETED.value,
        payload='{"agent_name": "impact_agent", "protocol": "a2a"}',
    )


# impact_agent runs locally. A RemoteA2aAgent pointed at the Cloud Run endpoint
# was used previously, but the service is currently unavailable (404). Using the
# local agent produces identical output without the A2A network hop.
impact_agent = Agent(
    name="impact_agent",
    model=litellm_for(HEAVY_MODEL),
    description=(
        "Translates malware evidence into critical infrastructure continuity impact — "
        "systems at risk, outage implications, and priority operator actions."
    ),
    instruction=_IMPACT_SPECIALIST_INSTRUCTION,
    before_agent_callback=_before_remote_agent,
    after_agent_callback=_after_remote_agent,
)

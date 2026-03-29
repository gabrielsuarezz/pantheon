from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.tools.tool_context import ToolContext

from agents.ares_workflow_support import (
    ARES_FINAL_RESPONSE_KEY,
    emit_workflow_event,
    get_active_plan_set,
    get_workflow_context,
)
from agents.model_config import ARES_MODEL
from agents.tools.event_tools import emit_event
from agents.tools.memory_tools import store_agent_output
from agents.tools.remediation_tools import build_full_response
from sandbox.models import AgentName, EventType


async def assemble_ares_response(tool_context: ToolContext) -> str:
    workflow_context = get_workflow_context(tool_context.state)
    plans = get_active_plan_set(tool_context.state)
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.ARES,
        tool="assemble_ares_response",
        job_id=workflow_context.job_id,
        payload={"workflow": "ares", "branch": "assembly"},
    )
    response = build_full_response(
        workflow_context.threat_report_md,
        workflow_context.enrichment,
        plans.containment,
        plans.remediation,
        plans.prevention,
        impact_analysis=workflow_context.impact_analysis,
    )
    await store_agent_output(
        workflow_context.job_id,
        "ares",
        response,
        temperature=0.3,
    )
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.ARES,
        tool="assemble_ares_response",
        job_id=workflow_context.job_id,
        payload={
            "workflow": "ares",
            "branch": "assembly",
            "response_length": len(response),
        },
    )
    return response


async def _before_agent(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_ACTIVATED,
        callback_context,
        workflow="ares",
        step="assemble",
        branch="assembly",
    )


async def _after_agent(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_COMPLETED,
        callback_context,
        workflow="ares",
        step="assemble",
        branch="assembly",
    )


ares_assembler = Agent(
    name="ares_assembler",
    model=ARES_MODEL,
    description="Assembles the full Ares incident response document from state.",
    instruction=(
        "Call `assemble_ares_response` exactly once and return only the report it returns."
    ),
    tools=[assemble_ares_response],
    output_key=ARES_FINAL_RESPONSE_KEY,
    before_agent_callback=_before_agent,
    after_agent_callback=_after_agent,
)

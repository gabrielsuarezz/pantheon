from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.tools.tool_context import ToolContext

from agents.ares_workflow_support import (
    ARES_CONTAINMENT_PLAN_KEY,
    emit_workflow_event,
    get_planning_summary,
    get_workflow_context,
)
from agents.model_config import ARES_MODEL
from agents.tools.remediation_tools import generate_containment_plan
from sandbox.models import EventType


async def run_containment_branch(tool_context: ToolContext) -> str:
    workflow_context = get_workflow_context(tool_context.state)
    return await generate_containment_plan(
        get_planning_summary(workflow_context),
        workflow="ares",
        branch="containment",
    )


async def _before_agent(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_ACTIVATED,
        callback_context,
        workflow="ares",
        step="plan",
        branch="containment",
    )


async def _after_agent(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_COMPLETED,
        callback_context,
        workflow="ares",
        step="plan",
        branch="containment",
    )


ares_containment = Agent(
    name="ares_containment",
    model=ARES_MODEL,
    description="Generates the containment branch of the Ares response plan.",
    instruction=(
        "Call `run_containment_branch` exactly once and return only the plan it returns."
    ),
    tools=[run_containment_branch],
    output_key=ARES_CONTAINMENT_PLAN_KEY,
    before_agent_callback=_before_agent,
    after_agent_callback=_after_agent,
)

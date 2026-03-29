from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext

from agents.ares_workflow_support import (
    ARES_VERIFICATION_RESULT_KEY,
    AresVerificationResult,
    emit_workflow_event,
    get_active_plan_set,
    get_refinement_iteration,
    get_workflow_context,
    increment_refinement_iteration,
)
from agents.model_config import ARES_MODEL
from sandbox.models import EventType


def _verification_instruction(readonly_context: ReadonlyContext) -> str:
    workflow_context = get_workflow_context(readonly_context.state)
    plans = get_active_plan_set(readonly_context.state)
    return f"""\
You are AresVerifier. Review the current containment, remediation, and prevention plans.

Rules:
- Judge the plans only against the evidence below.
- Do not invent malware behavior, IOCs, registry keys, or commands.
- Mark approved=true only if all three sections are specific, operationally useful,
  and supported by the evidence.
- If any claim is unsupported or too generic, set approved=false and explain why.
- Return ONLY JSON matching the output schema.

Evidence:
{workflow_context.threat_summary}

Containment Plan:
{plans.containment}

Remediation Plan:
{plans.remediation}

Prevention Plan:
{plans.prevention}
"""


async def _before_agent(callback_context: CallbackContext) -> None:
    iteration = increment_refinement_iteration(callback_context)
    await emit_workflow_event(
        EventType.AGENT_ACTIVATED,
        callback_context,
        workflow="ares_refinement",
        step="verify",
        branch="verifier",
        extra_payload={"iteration": iteration},
    )


async def _after_agent(callback_context: CallbackContext) -> None:
    result = AresVerificationResult.model_validate(
        callback_context.state[ARES_VERIFICATION_RESULT_KEY]
    )
    if result.approved:
        callback_context.actions.escalate = True
    await emit_workflow_event(
        EventType.AGENT_COMPLETED,
        callback_context,
        workflow="ares_refinement",
        step="verify",
        branch="verifier",
        extra_payload={
            "iteration": get_refinement_iteration(callback_context.state),
            "verdict": "approved" if result.approved else "retry",
            "finding_count": len(result.findings),
        },
    )


ares_verifier = Agent(
    name="ares_verifier",
    model=ARES_MODEL,
    description="Checks whether the Ares plans are specific, complete, and evidence-backed.",
    instruction=_verification_instruction,
    output_schema=AresVerificationResult,
    output_key=ARES_VERIFICATION_RESULT_KEY,
    before_agent_callback=_before_agent,
    after_agent_callback=_after_agent,
)

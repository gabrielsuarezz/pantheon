from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext

from agents.ares_workflow_support import (
    ARES_REVISED_PLAN_KEY,
    ARES_VERIFICATION_RESULT_KEY,
    AresPlanSet,
    AresVerificationResult,
    emit_workflow_event,
    get_active_plan_set,
    get_refinement_iteration,
    get_workflow_context,
)
from agents.model_config import ARES_MODEL
from sandbox.models import EventType


def _revision_instruction(readonly_context: ReadonlyContext) -> str:
    workflow_context = get_workflow_context(readonly_context.state)
    plans = get_active_plan_set(readonly_context.state)
    verification = AresVerificationResult.model_validate(
        readonly_context.state[ARES_VERIFICATION_RESULT_KEY]
    )
    findings = "\n".join(f"- {item}" for item in verification.findings) or "- None"
    missing_evidence = (
        "\n".join(f"- {item}" for item in verification.missing_evidence) or "- None"
    )
    return f"""\
You are AresReviser. Rewrite the current plan sections to resolve the verifier's findings.

Rules:
- Do not invent evidence.
- Keep supported concrete actions and remove or tighten unsupported claims.
- Improve operational specificity where the verifier requested it.
- Return ONLY JSON matching the output schema with containment, remediation,
  and prevention fields.

Evidence:
{workflow_context.threat_summary}

Verifier Findings:
{findings}

Missing Evidence:
{missing_evidence}

Current Containment Plan:
{plans.containment}

Current Remediation Plan:
{plans.remediation}

Current Prevention Plan:
{plans.prevention}
"""


async def _before_agent(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_ACTIVATED,
        callback_context,
        workflow="ares_refinement",
        step="revise",
        branch="reviser",
        extra_payload={"iteration": get_refinement_iteration(callback_context.state)},
    )


async def _after_agent(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_COMPLETED,
        callback_context,
        workflow="ares_refinement",
        step="revise",
        branch="reviser",
        extra_payload={"iteration": get_refinement_iteration(callback_context.state)},
    )


ares_reviser = Agent(
    name="ares_reviser",
    model=ARES_MODEL,
    description="Revises Ares plan sections based on verifier findings.",
    instruction=_revision_instruction,
    output_schema=AresPlanSet,
    output_key=ARES_REVISED_PLAN_KEY,
    before_agent_callback=_before_agent,
    after_agent_callback=_after_agent,
)

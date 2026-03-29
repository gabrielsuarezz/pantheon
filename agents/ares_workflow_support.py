from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

from google.adk.agents.callback_context import CallbackContext
from pydantic import BaseModel, Field

from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType

if TYPE_CHECKING:
    from google.adk.sessions.state import State

ARES_WORKFLOW_CONTEXT_KEY = "ares_workflow_context"
ARES_CONTAINMENT_PLAN_KEY = "ares_containment_plan"
ARES_REMEDIATION_PLAN_KEY = "ares_remediation_plan"
ARES_PREVENTION_PLAN_KEY = "ares_prevention_plan"
ARES_REVISED_PLAN_KEY = "ares_revised_plans"
ARES_VERIFICATION_RESULT_KEY = "ares_verification_result"
ARES_REFINEMENT_ITERATION_KEY = "ares_refinement_iteration"
ARES_FINAL_RESPONSE_KEY = "ares_final_response"

type StateLike = Mapping[str, Any] | State


class AresWorkflowContext(BaseModel):
    job_id: str
    threat_report_md: str
    enrichment: str
    threat_summary: str
    impact_analysis: str = ""
    prior_context: str = ""
    prior_run_count: int = 0


class AresPlanSet(BaseModel):
    containment: str
    remediation: str
    prevention: str


class AresVerificationResult(BaseModel):
    approved: bool
    findings: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)


def _read_model_from_state[T: BaseModel](
    state: StateLike,
    key: str,
    model_type: type[T],
) -> T:
    value = state.get(key)
    if value is None:
        raise ValueError(f"missing workflow state: {key}")
    return model_type.model_validate(value)


def get_workflow_context(state: StateLike) -> AresWorkflowContext:
    return _read_model_from_state(state, ARES_WORKFLOW_CONTEXT_KEY, AresWorkflowContext)


def get_active_plan_set(state: StateLike) -> AresPlanSet:
    revised_plans = state.get(ARES_REVISED_PLAN_KEY)
    if revised_plans is not None:
        return AresPlanSet.model_validate(revised_plans)
    return AresPlanSet(
        containment=str(state[ARES_CONTAINMENT_PLAN_KEY]),
        remediation=str(state[ARES_REMEDIATION_PLAN_KEY]),
        prevention=str(state[ARES_PREVENTION_PLAN_KEY]),
    )


def get_job_id_from_state(state: StateLike) -> str | None:
    workflow_context = state.get(ARES_WORKFLOW_CONTEXT_KEY)
    if workflow_context is None:
        return None
    if isinstance(workflow_context, dict):
        job_id = workflow_context.get("job_id")
        return str(job_id) if job_id is not None else None
    return None


def get_refinement_iteration(state: StateLike) -> int:
    value = state.get(ARES_REFINEMENT_ITERATION_KEY, 0)
    if isinstance(value, int):
        return value
    return int(str(value))


def increment_refinement_iteration(callback_context: CallbackContext) -> int:
    iteration = get_refinement_iteration(callback_context.state) + 1
    callback_context.state[ARES_REFINEMENT_ITERATION_KEY] = iteration
    return iteration


def get_planning_summary(workflow_context: AresWorkflowContext) -> str:
    if not workflow_context.prior_context:
        return workflow_context.threat_summary
    return (
        f"{workflow_context.threat_summary}\n\n"
        "Prior Ares Context:\n"
        f"{workflow_context.prior_context}"
    )


async def emit_workflow_event(
    event_type: EventType,
    callback_context: CallbackContext,
    *,
    workflow: str,
    step: str,
    branch: str | None = None,
    extra_payload: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "workflow": workflow,
        "step": step,
    }
    if branch is not None:
        payload["branch"] = branch
    if extra_payload is not None:
        payload.update(extra_payload)
    await emit_event(
        event_type,
        agent=AgentName.ARES,
        job_id=get_job_id_from_state(callback_context.state),
        payload=payload,
    )

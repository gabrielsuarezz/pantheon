from __future__ import annotations

from google.adk.agents import Agent, LoopAgent, ParallelAgent, SequentialAgent
from google.adk.agents.callback_context import CallbackContext

from agents.ares_assembler import ares_assembler
from agents.ares_containment import ares_containment
from agents.ares_prevention import ares_prevention
from agents.ares_remediation import ares_remediation
from agents.ares_reviser import ares_reviser
from agents.ares_verifier import ares_verifier
from agents.ares_workflow_support import (
    ARES_WORKFLOW_CONTEXT_KEY,
    AresWorkflowContext,
    emit_workflow_event,
)
from agents.model_config import ARES_MODEL
from agents.tools.memory_tools import load_prior_runs, synthesize_prior_runs
from agents.tools.remediation_tools import extract_threat_summary_for_ares
from sandbox.models import EventType

_PREPARER_INSTRUCTION = """\
You prepare the structured workflow context for Ares from Apollo's transfer message.

The incoming message includes the formatted threat report markdown, the enrichment text,
the original ThreatReport dict, and optionally an impact_analysis section returned by the
remote impact specialist. Derive the job_id from the transfer message. If it is not
explicitly present, read it from the ThreatReport dict's job_id field.

Workflow:
1. Call `load_prior_runs` with the job_id and agent_name "ares".
2. If two or more prior runs exist, call `synthesize_prior_runs` and use that result as
   `prior_context`.
3. If exactly one prior run exists, use that run's `output` as `prior_context`.
4. Call `extract_threat_summary_for_ares` with the ThreatReport dict and enrichment text.
5. Return ONLY JSON matching the output schema with:
   - job_id
   - threat_report_md
   - enrichment
   - threat_summary
   - impact_analysis
   - prior_context
   - prior_run_count

Do not omit any required field. Do not include prose outside the JSON object.
"""


async def _before_workflow(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_ACTIVATED,
        callback_context,
        workflow="ares",
        step="workflow",
    )


async def _after_workflow(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_COMPLETED,
        callback_context,
        workflow="ares",
        step="workflow",
    )


async def _before_preparer(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_ACTIVATED,
        callback_context,
        workflow="ares",
        step="prepare_context",
    )


async def _after_preparer(callback_context: CallbackContext) -> None:
    await emit_workflow_event(
        EventType.AGENT_COMPLETED,
        callback_context,
        workflow="ares",
        step="prepare_context",
    )


ares_context_preparer = Agent(
    name="ares_context_preparer",
    model=ARES_MODEL,
    description="Extracts and normalizes Apollo handoff context for the Ares workflow.",
    instruction=_PREPARER_INSTRUCTION,
    tools=[
        load_prior_runs,
        synthesize_prior_runs,
        extract_threat_summary_for_ares,
    ],
    output_schema=AresWorkflowContext,
    output_key=ARES_WORKFLOW_CONTEXT_KEY,
    before_agent_callback=_before_preparer,
    after_agent_callback=_after_preparer,
)

ares_planning_parallel = ParallelAgent(
    name="ares_planning_parallel",
    description="Runs containment, remediation, and prevention planning in parallel.",
    sub_agents=[
        ares_containment,
        ares_remediation,
        ares_prevention,
    ],
)

ares_refinement_loop = LoopAgent(
    name="ares_refinement_loop",
    description="Verifier-driven self-correction loop for Ares plan quality.",
    sub_agents=[
        ares_verifier,
        ares_reviser,
    ],
    max_iterations=2,
)

ares_workflow = SequentialAgent(
    name="ares",
    description="Workflow-backed Ares planning system with parallel planning branches.",
    sub_agents=[
        ares_context_preparer,
        ares_planning_parallel,
        ares_refinement_loop,
        ares_assembler,
    ],
    before_agent_callback=_before_workflow,
    after_agent_callback=_after_workflow,
)

ares = ares_workflow

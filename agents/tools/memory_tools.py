"""KnowledgeStore tools — persistent agent memory and behavioral similarity.

These tools allow agents (Hades, Apollo, Ares) to persist their outputs across
runs and synthesize improvements over time. Each call to the sandbox memory
endpoints appends a new run — nothing is ever overwritten.

The synthesis tool calls Gemini to distill multiple prior runs into a single
consensus output that is stronger than any individual run.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from google.genai import types as genai_types

from agents.model_config import FLASH_MODEL, get_genai_client
from agents.tools.event_tools import emit_event
from sandbox.models import AgentName, EventType

_SANDBOX_URL: str = os.getenv("SANDBOX_API_URL", "http://localhost:9000")
_MODEL: str = FLASH_MODEL

_SYNTHESIS_PROMPT = """\
You are synthesizing {n} analysis runs produced by the "{agent_name}" agent for \
malware job {job_id}.

Each run used a different Gemini temperature for diversity — lower temperatures \
are more conservative and factual, higher temperatures surface edge cases and \
alternative interpretations.

Your task:
1. Combine the strongest, most specific findings from all runs.
2. Resolve contradictions by keeping the claim supported by the most evidence.
3. Fill gaps — if run 2 mentions something run 1 missed, include it.
4. Remove repetition — state each point once, in its strongest form.
5. Preserve all concrete IOCs, file paths, registry keys, and commands verbatim.

Do NOT invent new information. Only synthesize what is already in the runs below.
Format your output in the same style as the individual runs.

{runs_block}
"""


async def store_agent_output(
    job_id: str,
    agent_name: str,
    output: str,
    temperature: float = 0.3,
) -> dict[str, int]:
    """Persist an agent's output for the current analysis run.

    Appends to the KnowledgeStore — never overwrites. Run numbers auto-increment
    per (job_id, agent_name) pair starting at 1.

    Args:
        job_id: Sandbox job identifier from :func:`~agents.tools.sandbox_tools.submit_sample`.
        agent_name: Lowercase agent name, e.g. "hades", "apollo", "ares".
        output: The agent's full text or markdown output to persist.
        temperature: Gemini temperature used during this run (metadata for synthesis).

    Returns:
        Dict with ``run_number`` (int) and ``total_runs`` (int).
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.ARES,
        tool="store_agent_output",
        job_id=job_id,
        payload={"agent_name": agent_name, "temperature": temperature},
    )
    payload = {
        "job_id": job_id,
        "agent_name": agent_name,
        "output": output,
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{_SANDBOX_URL}/sandbox/memory", json=payload)
        resp.raise_for_status()
    result: dict[str, int] = resp.json()
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.ARES,
        tool="store_agent_output",
        job_id=job_id,
        payload=result,
    )
    return result


async def load_prior_runs(
    job_id: str,
    agent_name: str,
) -> list[dict[str, Any]]:  # Any: MemoryEntry fields
    """Load all prior runs stored for this agent on this job.

    Returns an empty list if this is the first encounter.

    Args:
        job_id: Sandbox job identifier.
        agent_name: Lowercase agent name, e.g. "apollo".

    Returns:
        List of MemoryEntry dicts with keys ``job_id``, ``agent_name``,
        ``run_number``, ``temperature``, ``output``, ``created_at``.
        Ordered oldest-first (run_number ascending).
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.APOLLO,
        tool="load_prior_runs",
        job_id=job_id,
        payload={"agent_name": agent_name},
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{_SANDBOX_URL}/sandbox/memory/{job_id}/{agent_name}")
        resp.raise_for_status()
    result: list[dict[str, Any]] = resp.json()
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.APOLLO,
        tool="load_prior_runs",
        job_id=job_id,
        payload={"run_count": len(result)},
    )
    return result


async def synthesize_prior_runs(
    job_id: str,
    agent_name: str,
) -> str:
    """Synthesize all prior runs into a consensus output using Gemini.

    Loads all stored runs for this (job_id, agent_name) pair, builds a
    synthesis prompt, and calls Gemini at temperature=0.0 to distill the
    strongest version. The synthesis is stored as a new run automatically.

    Returns ``"(not enough runs to synthesize)"`` if fewer than 2 runs exist.

    Args:
        job_id: Sandbox job identifier.
        agent_name: Lowercase agent name, e.g. "ares".

    Returns:
        Synthesized markdown output combining the best of all prior runs,
        or a short message if synthesis is not yet possible.
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.APOLLO,
        tool="synthesize_prior_runs",
        job_id=job_id,
        payload={"agent_name": agent_name},
    )
    runs = await load_prior_runs(job_id, agent_name)
    if len(runs) < 2:
        synthesis = "(not enough runs to synthesize — need at least 2)"
        await emit_event(
            EventType.TOOL_RESULT,
            agent=AgentName.APOLLO,
            tool="synthesize_prior_runs",
            job_id=job_id,
            payload={"synthesis_length": len(synthesis)},
        )
        return synthesis

    runs_block_parts: list[str] = []
    for entry in runs:
        truncated = entry["output"][:3000]
        runs_block_parts.append(
            f"--- Run {entry['run_number']} (temperature={entry['temperature']}) ---\n{truncated}"
        )
    runs_block = "\n\n".join(runs_block_parts)

    prompt = _SYNTHESIS_PROMPT.format(
        n=len(runs),
        agent_name=agent_name,
        job_id=job_id,
        runs_block=runs_block,
    )

    client = get_genai_client()
    response = await client.aio.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=4096,
        ),
    )
    synthesis = response.text or "(synthesis produced no output)"

    # Store the synthesis as the next run so it builds on itself over time
    await store_agent_output(job_id, agent_name, synthesis, temperature=0.0)
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.APOLLO,
        tool="synthesize_prior_runs",
        job_id=job_id,
        payload={"synthesis_length": len(synthesis)},
    )
    return synthesis


async def find_similar_jobs(
    job_id: str,
) -> list[dict[str, Any]]:  # Any: SimilarJob fields
    """Find previously analyzed jobs with behavioral similarity to this one.

    Uses Jaccard similarity on behavioral fingerprints. Jobs with similarity
    >= 0.2 are returned. Requires the job to have a stored fingerprint — call
    :func:`store_behavioral_fingerprint` first.

    Args:
        job_id: Sandbox job identifier to compare against.

    Returns:
        List of SimilarJob dicts with keys ``job_id``, ``malware_type``,
        ``similarity`` (0.0-1.0), and ``shared_behaviors`` (list of strings).
        Sorted by similarity descending.
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.HADES,
        tool="find_similar_jobs",
        job_id=job_id,
        payload={"job_id": job_id},
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{_SANDBOX_URL}/sandbox/similar/{job_id}")
        resp.raise_for_status()
    result: list[dict[str, Any]] = resp.json()
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.HADES,
        tool="find_similar_jobs",
        job_id=job_id,
        payload={"match_count": len(result)},
    )
    return result


async def store_behavioral_fingerprint(
    job_id: str,
) -> dict[str, str]:
    """Compute and persist a behavioral fingerprint for a completed job.

    The fingerprint is derived from the job's ThreatReport: behavior strings,
    network domains, IPs, and file paths. It is used by
    :func:`find_similar_jobs` for cross-file similarity detection.

    Call this after Hades has confirmed the job is complete.

    Args:
        job_id: Sandbox job identifier for a completed analysis.

    Returns:
        Dict with ``status`` ("ok") and ``job_id``.
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.HADES,
        tool="store_behavioral_fingerprint",
        job_id=job_id,
        payload={"job_id": job_id},
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{_SANDBOX_URL}/sandbox/fingerprint/{job_id}")
        resp.raise_for_status()
    result: dict[str, str] = resp.json()
    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.HADES,
        tool="store_behavioral_fingerprint",
        job_id=job_id,
        payload=result,
    )
    return result

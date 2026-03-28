"""Triage tools for the Athena agent (owned by Pablo).

Provides threat classification and incident ticket creation utilities.
These tools are called by Athena during initial sample triage.

Owner: Andres (tools directory), consumed by Athena (Pablo).
"""

from __future__ import annotations

import os
import uuid
from typing import Any

from google import genai
from google.genai import types as genai_types

_MODEL: str = "gemini-2.0-flash"

# Threat categories based on NextEra Energy challenge taxonomy
_THREAT_CATEGORIES: list[str] = [
    "ransomware",
    "worm",
    "trojan",
    "dropper",
    "loader",
    "backdoor",
    "rootkit",
    "spyware",
    "adware",
    "coinminer",
    "wiper",
    "unknown",
]

_CLASSIFICATION_PROMPT = """\
You are a malware triage analyst. Classify the following sample based on
its filename, any available metadata, and file content preview.

Respond with a JSON object containing exactly these fields:
- "threat_category": one of {categories}
- "severity": one of "low", "medium", "high", "critical"
- "confidence": float between 0.0 and 1.0
- "reasoning": one sentence explaining the classification
- "requires_sandbox": boolean — true if dynamic analysis is needed

Sample information:
{sample_info}
""".format(categories=str(_THREAT_CATEGORIES), sample_info="{sample_info}")


def _gemini_client() -> genai.Client:
    """Return an authenticated Gemini client using GOOGLE_API_KEY."""
    api_key: str = os.environ["GOOGLE_API_KEY"]
    return genai.Client(api_key=api_key)


async def classify_threat(
    filename: str,
    file_size_bytes: int,
    content_preview: str = "",
) -> dict[str, Any]:  # Any: mixed types in classification result
    """Classify a suspicious file to determine threat category and severity.

    Uses Gemini to classify the sample based on filename, size, and optional
    content preview. This is a fast pre-sandbox triage step run by Athena.

    Args:
        filename: Original filename of the suspicious sample.
        file_size_bytes: File size in bytes.
        content_preview: Optional first 500 characters of file content
            (printable strings only — do NOT pass raw binary).

    Returns:
        Dict with keys:
        - ``threat_category`` (str): One of the known threat categories.
        - ``severity`` (str): "low", "medium", "high", or "critical".
        - ``confidence`` (float): Classification confidence 0.0–1.0.
        - ``reasoning`` (str): One-sentence explanation.
        - ``requires_sandbox`` (bool): Whether dynamic analysis is needed.
    """
    import json

    sample_info = (
        f"Filename: {filename}\n"
        f"File size: {file_size_bytes} bytes\n"
    )
    if content_preview:
        sample_info += f"Content preview:\n{content_preview[:500]}"

    prompt = _CLASSIFICATION_PROMPT.format(sample_info=sample_info)
    client = _gemini_client()
    response = await client.aio.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=256,
            response_mime_type="application/json",
        ),
    )

    raw = response.text or "{}"
    try:
        result: dict[str, Any] = json.loads(raw)  # Any: Gemini JSON response
    except json.JSONDecodeError:
        result = {
            "threat_category": "unknown",
            "severity": "medium",
            "confidence": 0.5,
            "reasoning": "Classification failed — proceeding with sandbox analysis.",
            "requires_sandbox": True,
        }
    return result


def create_incident_ticket(
    filename: str,
    threat_category: str,
    severity: str,
    job_id: str | None = None,
    analyst_notes: str = "",
) -> dict[str, str]:
    """Create a structured incident ticket for tracking purposes.

    Args:
        filename: Name of the malware sample.
        threat_category: Threat category from :func:`classify_threat`.
        severity: Severity level ("low", "medium", "high", "critical").
        job_id: Optional sandbox job ID to link to the analysis.
        analyst_notes: Optional free-text notes from the analyst.

    Returns:
        Dict with ticket fields: ``ticket_id``, ``title``, ``severity``,
        ``status``, ``filename``, ``job_id``, and ``notes``.
    """
    ticket_id = f"INC-{uuid.uuid4().hex[:8].upper()}"
    title = f"[{severity.upper()}] {threat_category.capitalize()} detected: {filename}"
    return {
        "ticket_id": ticket_id,
        "title": title,
        "severity": severity,
        "status": "open",
        "filename": filename,
        "threat_category": threat_category,
        "job_id": job_id or "",
        "notes": analyst_notes,
    }

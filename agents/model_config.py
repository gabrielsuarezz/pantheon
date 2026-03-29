"""Gemini model assignments and cost guardrails for each Pantheon agent.

Model tier rationale (heaviest → lightest):

  gemini-3.1-pro-preview  — Reserved for final-output agents where reasoning
      quality directly determines the deliverable a judge or analyst reads:
      Ares (incident response plan, parallel planners) and Apollo (IOC
      enrichment + threat-intel synthesis + full markdown report).

  gemini-3-flash-preview  — Agents that do substantive analysis but produce
      intermediate results consumed by higher-tier agents:
      Hades (sandbox result interpretation, memory synthesis),
      Zeus (orchestration routing + verbal briefing compilation),
      GeminiAnalyst (Hephaestus static behavioural inference).

  gemini-3.1-flash-lite-preview — Agents with structured, low-entropy tasks
      that do not benefit from deeper reasoning:
      Athena (keyword-based threat classification, ~100-token ticket output),
      Muse STT fallback (transcription).

Cost guardrails
---------------
  MAX_OUTPUT_TOKENS_PRO    — caps each Pro LLM response (reports are long but
                             bounded; prevents runaway recursive generation).
  MAX_OUTPUT_TOKENS_FLASH  — caps Flash responses (summaries, analysis).
  MAX_OUTPUT_TOKENS_LITE   — caps Lite responses (classifications, tickets).

  These constants are imported by individual agents and passed as
  generate_content_config=types.GenerateContentConfig(max_output_tokens=...).

  Additionally, set a GCP budget alert in the console:
    console.cloud.google.com → Billing → Budgets & alerts → Create budget
  Recommended: $20 alert at 50%, 90%, 100% for the hackathon.
"""

from __future__ import annotations

import os
from itertools import cycle
from threading import Lock

from google import genai

# ---------------------------------------------------------------------------
# Model names — overridable via environment for quick switching
# ---------------------------------------------------------------------------

# Highest reasoning quality: final deliverables (Ares, Apollo)
PRO_MODEL = os.getenv("PANTHEON_PRO_MODEL", "gemini-3.1-pro-preview")

# Strong analysis, fast: intermediate agents (Hades, Zeus, GeminiAnalyst)
FLASH_MODEL = os.getenv("PANTHEON_FLASH_MODEL", "gemini-3-flash-preview")

# Fast, cheap: structured low-complexity tasks (Athena, Muse STT)
LITE_MODEL = os.getenv("PANTHEON_LITE_MODEL", "gemini-3.1-flash-lite-preview")

# ---------------------------------------------------------------------------
# Agent → model assignments
# ---------------------------------------------------------------------------

# Zeus: orchestration routing + final verbal briefing compilation
ZEUS_MODEL = FLASH_MODEL

# Athena: keyword-based threat classification + ticket creation (formulaic)
ATHENA_MODEL = LITE_MODEL

# Hades: malware sandbox result interpretation + memory synthesis
HADES_MODEL = FLASH_MODEL

# Apollo: IOC extraction + Gemini-powered threat-intel enrichment + full report
APOLLO_MODEL = PRO_MODEL

# Ares: parallel containment/remediation/prevention planners + verifier loop
ARES_MODEL = PRO_MODEL

# Muse: ElevenLabs STT fallback transcription
MUSE_STT_MODEL = LITE_MODEL

# GeminiAnalyst: Hephaestus static-analysis behavioural inference
GEMINI_ANALYST_MODEL = LITE_MODEL

# ---------------------------------------------------------------------------
# Output token caps — cost guardrails (imported by agent definitions)
# ---------------------------------------------------------------------------

# Pro agents produce long-form reports; cap prevents unbounded generation
MAX_OUTPUT_TOKENS_PRO: int = int(os.getenv("PANTHEON_MAX_TOKENS_PRO", "4096"))

# Flash agents produce analysis summaries and briefings
MAX_OUTPUT_TOKENS_FLASH: int = int(os.getenv("PANTHEON_MAX_TOKENS_FLASH", "2048"))

# Lite agents produce short structured outputs (classifications, tickets)
MAX_OUTPUT_TOKENS_LITE: int = int(os.getenv("PANTHEON_MAX_TOKENS_LITE", "1024"))

# ---------------------------------------------------------------------------
# Backward-compatibility aliases (used by impact_agent.py and any legacy code)
# ---------------------------------------------------------------------------

HEAVY_MODEL = PRO_MODEL
MEDIUM_MODEL = FLASH_MODEL
# LITE_MODEL already defined above

# ---------------------------------------------------------------------------
# Vertex AI (GCP) vs Gemini Developer API (AI Studio API keys)
# ---------------------------------------------------------------------------


def _env_truthy(name: str) -> bool:
    v = os.getenv(name, "").strip().lower()
    return v in ("1", "true", "yes", "on")


def resolve_gcp_project_id() -> str:
    """Return GCP project ID for Vertex AI (GOOGLE_CLOUD_PROJECT or GCP_PROJECT_ID)."""
    for key in ("GOOGLE_CLOUD_PROJECT", "GCP_PROJECT_ID"):
        value = os.getenv(key, "").strip()
        if value:
            return value
    return ""


def resolve_vertex_location() -> str:
    """Vertex region; defaults to us-central1 if unset."""
    return os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1").strip() or "us-central1"


# True when using billable Vertex AI with ADC (or GOOGLE_APPLICATION_CREDENTIALS)
USE_VERTEX_AI: bool = _env_truthy("GOOGLE_GENAI_USE_VERTEXAI")


def get_genai_client() -> genai.Client:
    """Return a google-genai client: Vertex (ADC) or AI Studio (rotating API keys)."""
    if USE_VERTEX_AI:
        project = resolve_gcp_project_id()
        if not project:
            raise RuntimeError(
                "Vertex AI is enabled (GOOGLE_GENAI_USE_VERTEXAI) but no project ID is set. "
                "Set GOOGLE_CLOUD_PROJECT or GCP_PROJECT_ID, and GOOGLE_CLOUD_LOCATION "
                "(optional, default us-central1). Use Application Default Credentials "
                "(gcloud auth application-default login) or GOOGLE_APPLICATION_CREDENTIALS."
            )
        location = resolve_vertex_location()
        return genai.Client(vertexai=True, project=project, location=location)
    api_key = get_next_gemini_api_key()
    return genai.Client(api_key=api_key)


# ---------------------------------------------------------------------------
# API key rotation — distributes load across team keys to avoid 429s
# ---------------------------------------------------------------------------


def _load_gemini_api_keys() -> list[str]:
    """Load Gemini API keys in configured priority order.

    Preferred order is GEMINI_API1, GEMINI_API2, GEMINI_API3 so calls rotate
    across the team's keys. Falls back to GEMINI_API and then GOOGLE_API_KEY
    for backward compatibility.
    """
    candidates = [
        os.getenv("GEMINI_API1", ""),
        os.getenv("GEMINI_API2", ""),
        os.getenv("GEMINI_API3", ""),
        os.getenv("GEMINI_API", ""),
        os.getenv("GOOGLE_API_KEY", ""),
    ]

    keys: list[str] = []
    for key in candidates:
        if key and key not in keys:
            keys.append(key)
    return keys


_GEMINI_API_KEYS: list[str] = _load_gemini_api_keys()
_GEMINI_KEY_CYCLE = cycle(_GEMINI_API_KEYS) if _GEMINI_API_KEYS else None
_GEMINI_KEY_LOCK = Lock()


def get_next_gemini_api_key() -> str:
    """Return the next Gemini API key in round-robin order.

    Rotation order is 1 -> 2 -> 3 -> repeat when GEMINI_API1..3 are set.
    """
    if _GEMINI_KEY_CYCLE is None:
        raise RuntimeError(
            "No Gemini API key configured. For AI Studio, set GEMINI_API1..3, GEMINI_API, "
            "or GOOGLE_API_KEY. For Vertex AI, set GOOGLE_GENAI_USE_VERTEXAI=TRUE and "
            "GOOGLE_CLOUD_PROJECT (or GCP_PROJECT_ID) and use ADC."
        )

    with _GEMINI_KEY_LOCK:
        return next(_GEMINI_KEY_CYCLE)

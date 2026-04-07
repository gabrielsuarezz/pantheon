"""LLM model assignments and cost guardrails for each Pantheon agent.

All inference goes through `OpenRouter <https://openrouter.ai>`_ using the
OpenAI-compatible API (see ``agents/openrouter_client.py``). ADK agents use
``LiteLlm`` (LiteLLM) with the ``openrouter/<provider>/<model>`` id form.

Cost guardrails
---------------
  MAX_OUTPUT_TOKENS_PRO    — caps each Pro LLM response
  MAX_OUTPUT_TOKENS_FLASH  — caps Flash-tier responses
  MAX_OUTPUT_TOKENS_LITE   — caps Lite-tier responses

  Set a budget alert on your OpenRouter account for the hackathon.
"""

from __future__ import annotations

import os
from functools import lru_cache

from google.adk.models import LiteLlm

# ---------------------------------------------------------------------------
# Model names — OpenRouter ids (provider/model), aligned with the pre-OpenRouter
# Gemini tiering: Pro / Flash / Flash-Lite (see openrouter.ai for availability).
# ---------------------------------------------------------------------------

# Highest reasoning quality: final deliverables (Ares, Apollo)
# Was: gemini-3.1-pro-preview (AI Studio / Vertex)
PRO_MODEL = os.getenv("PANTHEON_PRO_MODEL", "google/gemini-3.1-pro-preview")

# Strong analysis, fast: intermediate agents (Hades, Zeus, static analyst)
# Was: gemini-3-flash-preview
FLASH_MODEL = os.getenv("PANTHEON_FLASH_MODEL", "google/gemini-3-flash-preview")

# Fast, cheap: structured low-complexity tasks (Athena, Muse STT fallback)
# Was: gemini-3.1-flash-lite-preview
LITE_MODEL = os.getenv("PANTHEON_LITE_MODEL", "google/gemini-3.1-flash-lite-preview")

# ---------------------------------------------------------------------------
# Agent → model assignments
# ---------------------------------------------------------------------------

ZEUS_MODEL = FLASH_MODEL
ATHENA_MODEL = LITE_MODEL
HADES_MODEL = FLASH_MODEL
APOLLO_MODEL = PRO_MODEL
ARES_MODEL = PRO_MODEL

# Muse: ElevenLabs STT fallback — same tier as before (LITE); needs audio-capable model
MUSE_STT_MODEL = os.getenv("PANTHEON_MUSE_STT_MODEL", LITE_MODEL)

# Static analyst (Hephaestus): behavioural inference from deobfuscated strings
GEMINI_ANALYST_MODEL = os.getenv("PANTHEON_ANALYST_MODEL", LITE_MODEL)

# ---------------------------------------------------------------------------
# Output token caps — cost guardrails (imported by agent definitions)
# ---------------------------------------------------------------------------

MAX_OUTPUT_TOKENS_PRO: int = int(os.getenv("PANTHEON_MAX_TOKENS_PRO", "4096"))
MAX_OUTPUT_TOKENS_FLASH: int = int(os.getenv("PANTHEON_MAX_TOKENS_FLASH", "2048"))
MAX_OUTPUT_TOKENS_LITE: int = int(os.getenv("PANTHEON_MAX_TOKENS_LITE", "1024"))

# ---------------------------------------------------------------------------
# Backward-compatibility aliases (used by impact_agent.py and legacy code)
# ---------------------------------------------------------------------------

HEAVY_MODEL = PRO_MODEL
MEDIUM_MODEL = FLASH_MODEL

# ---------------------------------------------------------------------------
# ADK — LiteLLM + OpenRouter
# ---------------------------------------------------------------------------


def _openrouter_litellm_model_id(model: str) -> str:
    """LiteLLM OpenRouter id, e.g. ``openrouter/google/gemini-3-flash-preview``."""
    if model.startswith("openrouter/"):
        return model
    return f"openrouter/{model}"


def _max_tokens_for(model_id: str) -> int:
    """Return the output token cap for the given model tier."""
    if model_id == PRO_MODEL:
        return MAX_OUTPUT_TOKENS_PRO
    if model_id == FLASH_MODEL:
        return MAX_OUTPUT_TOKENS_FLASH
    return MAX_OUTPUT_TOKENS_LITE


@lru_cache(maxsize=32)
def litellm_for(model_id: str) -> LiteLlm:
    """Build a :class:`LiteLlm` instance configured for OpenRouter.

    ``model_id`` is typically ``PANTHEON_*`` env content like ``google/gemini-3-flash-preview``.
    Authentication uses ``OPENROUTER_API_KEY`` at request time (LiteLLM reads the env var).
    """
    mid = _openrouter_litellm_model_id(model_id)
    return LiteLlm(
        model=mid,
        max_tokens=_max_tokens_for(model_id),
    )

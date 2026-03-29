"""Gemini and Nova model assignments for each Pantheon agent.

This file is the single source of truth for all AI models used in the system.
You can override these defaults via environment variables in your .env file.
"""
from __future__ import annotations

import os

# --- Model Categories ---

# Lightweight: Routing, classification, simple STT fallback.
LITE_MODEL = os.getenv("PANTHEON_LITE_MODEL", "gemini-2.5-flash")

# Medium: Correlating analysis results, IOC enrichment.
MEDIUM_MODEL = os.getenv("PANTHEON_MEDIUM_MODEL", "gemini-2.5-flash")

# Heavy: Final synthesis, high-stakes remediation planning, complex reasoning.
HEAVY_MODEL = os.getenv("PANTHEON_HEAVY_MODEL", "gemini-2.5-flash")


# --- Agent Assignments ---

# Zeus: Root orchestrator. Primary task is routing and compilation.
ZEUS_MODEL = LITE_MODEL

# Athena: Threat classification and ticket creation. Structured and fast.
ATHENA_MODEL = LITE_MODEL

# Hades: Malware analysis. Requires correlating sandbox results.
HADES_MODEL = MEDIUM_MODEL

# Apollo: IOC extraction and threat intelligence enrichment.
APOLLO_MODEL = MEDIUM_MODEL

# Ares: Final containment, remediation, and prevention planning.
ARES_MODEL = HEAVY_MODEL

# Muse (Voice): STT fallback model.
MUSE_STT_MODEL = LITE_MODEL

# GeminiAnalyst (Hephaestus static pipeline): Behavioral inference.
GEMINI_ANALYST_MODEL = LITE_MODEL

"""Gemini model assignments for each Pantheon agent.

Routing strategy:
- Routing / classification tasks  -> gemini-2.5-flash, thinking off
- Multi-indicator analysis tasks   -> gemini-2.5-flash, thinking on (budget 1024)
- Final synthesis / planning tasks -> gemini-2.5-pro   (Ares only)

Import the constant for your agent instead of hardcoding a model string.
"""
from __future__ import annotations

# Athena: threat classification is structured and binary — thinking adds no value.
ATHENA_MODEL = "gemini-2.5-flash"

# Hades: must correlate sandbox results, deobfuscated strings, and behavioral
# indicators into a coherent narrative. Moderate thinking budget.
HADES_MODEL = "gemini-2.5-flash"

# Apollo: IOC enrichment requires reasoning across multiple data sources.
APOLLO_MODEL = "gemini-2.5-flash"

# Ares: generates the final containment + remediation + prevention plan —
# the output the judges will hear. Highest-stakes response, use Pro.
ARES_MODEL = "gemini-2.5-pro"

# GeminiAnalyst (Hephaestus static pipeline): behavioral inference from
# deobfuscated strings. Thinking on — see sandbox/static/gemini_analyst.py.
GEMINI_ANALYST_MODEL = "gemini-2.5-flash"

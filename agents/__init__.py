"""Agents package exports for Pantheon's analysis pipeline.

Import order matters: ares -> apollo -> hades (dependency chain).
"""

from __future__ import annotations

from typing import Any

__all__ = ["apollo", "ares", "hades"]


def __getattr__(name: str) -> Any:
    if name == "apollo":
        from agents.apollo import apollo

        return apollo
    if name == "ares":
        from agents.ares_workflow import ares

        return ares
    if name == "hades":
        from agents.hades import hades

        return hades
    raise AttributeError(f"module 'agents' has no attribute {name!r}")

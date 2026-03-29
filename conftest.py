"""Root conftest — stubs unavailable third-party packages for the test suite.

google-adk and google-genai are expensive runtime dependencies that are not
required for unit-testing the tool functions. We inject MagicMock stubs into
sys.modules here, at the earliest possible import point, before pytest starts
collecting any test files or importing any agents/* modules.
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock


def _stub(name: str) -> MagicMock:
    # No spec: allow free attribute creation so code like
    # genai_types.GenerateContentConfig(...) works without errors.
    mock: MagicMock = MagicMock()
    mock.__name__ = name
    sys.modules[name] = mock  # type: ignore[assignment]
    return mock


# Stub the google namespace and all sub-packages used by agents/ code.
# Parent stubs must be created before children so attribute chains work.
google_stub = _stub("google")
adk_stub = _stub("google.adk")
adk_agents_stub = _stub("google.adk.agents")
genai_stub = _stub("google.genai")
genai_types_stub = _stub("google.genai.types")

google_stub.adk = adk_stub
google_stub.genai = genai_stub
adk_stub.agents = adk_agents_stub
genai_stub.types = genai_types_stub

# Agent(...) is called at module level in hades.py / apollo.py / ares.py.
adk_agents_stub.Agent = MagicMock()

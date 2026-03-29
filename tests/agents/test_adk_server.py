from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


def test_adk_server_bootstraps_pantheon_agent_app() -> None:
    result = subprocess.run(
        [
            "uv",
            "run",
            "python",
            "-c",
            (
                "import json; "
                "from agents.server import AGENTS_DIR, app; "
                "print(json.dumps({"
                "'agents_dir': AGENTS_DIR, "
                "'routes': [route.path for route in app.routes]"
                "}))"
            ),
        ],
        capture_output=True,
        check=False,
        cwd=Path(__file__).resolve().parents[2],
        env={**os.environ, "UV_CACHE_DIR": "/tmp/uv-cache"},
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    assert Path(payload["agents_dir"], "pantheon_agent", "agent.py").is_file()
    assert Path(payload["agents_dir"], "impact_agent", "agent.json").is_file()
    assert "/list-apps" in payload["routes"]
    assert "/dev-ui" in payload["routes"]
    assert "/a2a/impact_agent/.well-known/agent-card.json" in payload["routes"]

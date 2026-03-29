from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


def test_ares_workflow_wraps_parallel_and_loop_planning_for_apollo() -> None:
    result = subprocess.run(
        [
            "uv",
            "run",
            "python",
            "-c",
            (
                "import json; "
                "from agents.apollo import apollo; "
                "from agents.ares_workflow import "
                "ares, ares_planning_parallel, ares_refinement_loop; "
                "print(json.dumps({"
                "'ares_type': type(ares).__name__, "
                "'ares_name': ares.name, "
                "'apollo_sub_agents': [agent.name for agent in apollo.sub_agents], "
                "'apollo_sub_agent_types': [type(agent).__name__ for agent in apollo.sub_agents], "
                "'parallel_type': type(ares_planning_parallel).__name__, "
                "'parallel_branches': [agent.name for agent in ares_planning_parallel.sub_agents], "
                "'loop_type': type(ares_refinement_loop).__name__, "
                "'loop_iterations': ares_refinement_loop.max_iterations, "
                "'loop_agents': [agent.name for agent in ares_refinement_loop.sub_agents]"
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
    assert payload["ares_type"] == "SequentialAgent"
    assert payload["ares_name"] == "ares"
    assert payload["apollo_sub_agents"] == ["impact_agent", "ares"]
    assert payload["apollo_sub_agent_types"] == ["RemoteA2aAgent", "SequentialAgent"]
    assert payload["parallel_type"] == "ParallelAgent"
    assert payload["parallel_branches"] == [
        "ares_containment",
        "ares_remediation",
        "ares_prevention",
    ]
    assert payload["loop_type"] == "LoopAgent"
    assert payload["loop_iterations"] == 2
    assert payload["loop_agents"] == ["ares_verifier", "ares_reviser"]

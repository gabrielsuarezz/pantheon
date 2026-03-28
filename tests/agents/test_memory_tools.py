"""Tests for KnowledgeStore agent tool functions in agents/tools/memory_tools.py."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# --- store_agent_output -----------------------------------------------------


@pytest.mark.asyncio
async def test_store_agent_output_posts_correct_payload() -> None:
    from agents.tools.memory_tools import store_agent_output

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"run_number": 1, "total_runs": 1}
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("agents.tools.memory_tools.httpx.AsyncClient", return_value=mock_client):
        result = await store_agent_output("job1", "ares", "my plan", 0.3)

    mock_client.post.assert_called_once()
    call_kwargs = mock_client.post.call_args
    assert "/sandbox/memory" in call_kwargs[0][0]
    payload = call_kwargs[1]["json"]
    assert payload["job_id"] == "job1"
    assert payload["agent_name"] == "ares"
    assert payload["output"] == "my plan"
    assert payload["temperature"] == 0.3
    assert result == {"run_number": 1, "total_runs": 1}


# --- load_prior_runs --------------------------------------------------------


@pytest.mark.asyncio
async def test_load_prior_runs_returns_list() -> None:
    from agents.tools.memory_tools import load_prior_runs

    fake_entries = [
        {"job_id": "job1", "agent_name": "apollo", "run_number": 1,
         "temperature": 0.2, "output": "enrichment", "created_at": ""},
    ]
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_entries
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("agents.tools.memory_tools.httpx.AsyncClient", return_value=mock_client):
        result = await load_prior_runs("job1", "apollo")

    assert result == fake_entries
    mock_client.get.assert_called_once()
    url = mock_client.get.call_args[0][0]
    assert "/sandbox/memory/job1/apollo" in url


@pytest.mark.asyncio
async def test_load_prior_runs_empty_list() -> None:
    from agents.tools.memory_tools import load_prior_runs

    mock_resp = MagicMock()
    mock_resp.json.return_value = []
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("agents.tools.memory_tools.httpx.AsyncClient", return_value=mock_client):
        result = await load_prior_runs("new_job", "ares")

    assert result == []


# --- synthesize_prior_runs --------------------------------------------------


@pytest.mark.asyncio
async def test_synthesize_returns_not_enough_if_one_run() -> None:
    from agents.tools.memory_tools import synthesize_prior_runs

    one_run = [{"run_number": 1, "temperature": 0.2, "output": "run 1"}]
    with patch("agents.tools.memory_tools.load_prior_runs", AsyncMock(return_value=one_run)):
        result = await synthesize_prior_runs("job1", "ares")

    assert "not enough runs" in result


@pytest.mark.asyncio
async def test_synthesize_calls_gemini_and_stores_result() -> None:
    from agents.tools.memory_tools import synthesize_prior_runs

    two_runs = [
        {"run_number": 1, "temperature": 0.2, "output": "containment plan v1"},
        {"run_number": 2, "temperature": 0.6, "output": "containment plan v2 with extras"},
    ]

    mock_gemini_response = MagicMock()
    mock_gemini_response.text = "synthesized consensus plan"

    mock_client_instance = MagicMock()
    mock_client_instance.aio.models.generate_content = AsyncMock(
        return_value=mock_gemini_response
    )

    with patch("agents.tools.memory_tools.load_prior_runs", AsyncMock(return_value=two_runs)), \
         patch("agents.tools.memory_tools.store_agent_output", AsyncMock(return_value={"run_number": 3, "total_runs": 3})), \
         patch("agents.tools.memory_tools._gemini_client", return_value=mock_client_instance):
        result = await synthesize_prior_runs("job1", "ares")

    assert result == "synthesized consensus plan"
    mock_client_instance.aio.models.generate_content.assert_called_once()


# --- find_similar_jobs ------------------------------------------------------


@pytest.mark.asyncio
async def test_find_similar_jobs_returns_matches() -> None:
    from agents.tools.memory_tools import find_similar_jobs

    fake_matches = [
        {"job_id": "other1", "malware_type": "dropper",
         "similarity": 0.75, "shared_behaviors": ["drops files"]},
    ]
    mock_resp = MagicMock()
    mock_resp.json.return_value = fake_matches
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("agents.tools.memory_tools.httpx.AsyncClient", return_value=mock_client):
        result = await find_similar_jobs("job1")

    assert result == fake_matches
    url = mock_client.get.call_args[0][0]
    assert "/sandbox/similar/job1" in url


# --- store_behavioral_fingerprint -------------------------------------------


@pytest.mark.asyncio
async def test_store_behavioral_fingerprint_posts_to_endpoint() -> None:
    from agents.tools.memory_tools import store_behavioral_fingerprint

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"status": "ok", "job_id": "job1"}
    mock_resp.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("agents.tools.memory_tools.httpx.AsyncClient", return_value=mock_client):
        result = await store_behavioral_fingerprint("job1")

    mock_client.post.assert_called_once()
    url = mock_client.post.call_args[0][0]
    assert "/sandbox/fingerprint/job1" in url
    assert result["status"] == "ok"

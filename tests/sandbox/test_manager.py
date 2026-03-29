from __future__ import annotations

from unittest.mock import MagicMock, patch
import pytest
from sandbox.dynamic.manager import SandboxManager


@pytest.fixture()
def mock_docker_client() -> MagicMock:
    client = MagicMock()
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = b'[{"api":"WScript","method":"Run","args":["cmd.exe"],"timestamp":"2026-01-01T00:00:00Z"}]'
    client.containers.create.return_value = container
    client.images.get.return_value = MagicMock()
    return client


def test_analyze_returns_intercept_log(mock_docker_client: MagicMock) -> None:
    with patch("sandbox.dynamic.manager.docker.from_env", return_value=mock_docker_client):
        manager = SandboxManager()
        result = manager.run(b"var x = 1;")
    assert isinstance(result, list)
    assert result[0]["api"] == "WScript"


def test_container_uses_security_flags(mock_docker_client: MagicMock) -> None:
    with patch("sandbox.dynamic.manager.docker.from_env", return_value=mock_docker_client):
        manager = SandboxManager()
        manager.run(b"var x = 1;")

    create_kwargs = mock_docker_client.containers.create.call_args.kwargs
    assert create_kwargs.get("network_disabled") is True
    assert create_kwargs.get("mem_limit") == "256m"
    assert "no-new-privileges" in create_kwargs.get("security_opt", [])
    assert "ALL" in create_kwargs.get("cap_drop", [])


def test_container_removed_on_success(mock_docker_client: MagicMock) -> None:
    with patch("sandbox.dynamic.manager.docker.from_env", return_value=mock_docker_client):
        manager = SandboxManager()
        manager.run(b"var x = 1;")
    mock_docker_client.containers.create.return_value.remove.assert_called_once_with(force=True)


def test_container_removed_on_error(mock_docker_client: MagicMock) -> None:
    mock_docker_client.containers.create.return_value.start.side_effect = RuntimeError("fail")
    with patch("sandbox.dynamic.manager.docker.from_env", return_value=mock_docker_client):
        manager = SandboxManager()
        result = manager.run(b"var x = 1;")
    # Should return empty list, not raise, and still remove
    assert result == []
    mock_docker_client.containers.create.return_value.remove.assert_called_once_with(force=True)

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sandbox.models import DetonationResult


@pytest.mark.asyncio
async def test_detonate_sample_returns_detonation_result() -> None:
    from agents.tools.vps_tools import detonate_sample

    mock_ssh = MagicMock()
    mock_sftp = MagicMock()
    mock_sftp.open.return_value.__enter__ = MagicMock(return_value=MagicMock(read=MagicMock(return_value=b"")))
    mock_sftp.open.return_value.__exit__ = MagicMock(return_value=False)
    mock_stdin = MagicMock()
    mock_stdout = MagicMock()
    mock_stdout.read.return_value = b""
    mock_stderr = MagicMock()
    mock_stderr.read.return_value = b""
    mock_ssh.exec_command.return_value = (mock_stdin, mock_stdout, mock_stderr)
    mock_ssh.open_sftp.return_value = mock_sftp

    with patch("agents.tools.vps_tools.paramiko.SSHClient", return_value=mock_ssh):
        with patch("agents.tools.vps_tools.emit_event", new_callable=AsyncMock):
            with patch("agents.tools.vps_tools._VPS_IP", "192.168.1.1"):
                with patch("agents.tools.vps_tools.time.sleep"):
                    result = await detonate_sample("/tmp/sample.js")

    assert isinstance(result, dict)
    assert "process_events" in result
    assert "network_events" in result


def test_parse_procmon_csv_extracts_file_writes() -> None:
    from agents.tools.vps_tools import _parse_procmon_csv

    csv_content = (
        '"Time of Day","Process Name","PID","Operation","Path","Result","Detail"\n'
        '"12:00:00.000","wscript.exe","1234","WriteFile","C:\\\\Users\\\\Public\\\\Mands.png","SUCCESS",""\n'
        '"12:00:01.000","wscript.exe","1234","RegSetValue",'
        '"HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run\\\\Updater","SUCCESS",""\n'
    )
    events = _parse_procmon_csv(csv_content)
    assert len(events) == 2
    assert events[0].event_type == "file_write"
    assert events[0].path == "C:\\Users\\Public\\Mands.png"
    assert events[1].event_type == "registry_write"
    assert "Run" in events[1].path


def test_parse_fakenet_log_extracts_dns_queries() -> None:
    from agents.tools.vps_tools import _parse_fakenet_log

    log_content = (
        "Listener DNS: Received A query for evil.example.com from 127.0.0.1\n"
        "Listener HTTP: GET /payload.bin HTTP/1.1 Host: evil.example.com\n"
    )
    events = _parse_fakenet_log(log_content)
    assert any(e.event_type == "dns_query" and "evil.example.com" in e.host for e in events)

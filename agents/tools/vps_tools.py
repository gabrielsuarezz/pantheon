"""Windows VPS monitoring tools — live detonation with Procmon and FakeNet-NG.

These tools SSH into the sacrificial Windows VPS, execute the malware sample
under Procmon and FakeNet-NG monitoring, retrieve the logs, and parse them
into structured ProcessEvent and NetworkEvent objects.

SAFETY: The VPS must have all outbound network blocked at the cloud provider
security group level before calling detonate_sample(). FakeNet-NG intercepts
all local network calls. After detonation, restore the VPS snapshot.

NOTE: Log parsing logic is marked with # VALIDATE comments — verify against
actual tool output on the real VPS before the demo.
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import os
import re
from typing import Any

import paramiko

from agents.tools.event_tools import emit_event
from sandbox.models import (
    AgentName,
    DetonationResult,
    EventType,
    NetworkEvent,
    ProcessEvent,
)

logger = logging.getLogger("pantheon.vps")

_VPS_IP: str = os.getenv("WINDOWS_VPS_IP", "")
_VPS_USER: str = os.getenv("WINDOWS_VPS_USER", "Administrator")
_VPS_PASSWORD: str = os.getenv("WINDOWS_VPS_PASSWORD", "")

# Paths on the Windows VPS — adjust after setup
_PROCMON_PATH: str = r"C:\tools\Procmon.exe"
_FAKENET_PATH: str = r"C:\tools\fakenet\fakenet.py"
_SAMPLE_DIR: str = r"C:\work"
_CAPTURE_PML: str = r"C:\work\capture.pml"
_CAPTURE_CSV: str = r"C:\work\capture.csv"
_FAKENET_LOG: str = r"C:\work\fakenet.log"
_DETONATION_TIMEOUT: int = int(os.getenv("DETONATION_TIMEOUT", "30"))


def _ssh_connect() -> paramiko.SSHClient:
    """Open an SSH connection to the Windows VPS."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())  # noqa: S507
    client.connect(_VPS_IP, username=_VPS_USER, password=_VPS_PASSWORD, timeout=15)
    return client


async def _exec(ssh: paramiko.SSHClient, command: str, timeout: int = 60) -> tuple[str, str]:
    """Run a command over SSH and return (stdout, stderr)."""
    # Emit telemetry event
    await emit_event(
        EventType.TELEMETRY,
        agent=AgentName.HADES,
        payload={"command": command, "stream": "stdin"},
    )
    
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    
    if out:
        await emit_event(
            EventType.TELEMETRY,
            agent=AgentName.HADES,
            payload={"output": out, "stream": "stdout"},
        )
    if err:
        await emit_event(
            EventType.TELEMETRY,
            agent=AgentName.HADES,
            payload={"output": err, "stream": "stderr"},
        )
        
    return out, err


def _parse_procmon_csv(csv_content: str) -> list[ProcessEvent]:
    """Parse a Procmon CSV export into ProcessEvent objects.

    # VALIDATE: check column names against actual Procmon CSV output on the VPS.
    Expected columns: Time of Day, Process Name, PID, Operation, Path, Result, Detail
    """
    events: list[ProcessEvent] = []
    reader = csv.DictReader(io.StringIO(csv_content))
    for row in reader:
        operation = row.get("Operation", "").lower()
        # Procmon CSV sometimes double-escapes backslashes; normalize to single backslash.
        path = row.get("Path", "").replace("\\\\", "\\")
        process = row.get("Process Name", "unknown")
        pid_str = row.get("PID", "0")
        try:
            pid = int(pid_str)
        except ValueError:
            pid = 0

        if "writefile" in operation or "createfile" in operation:
            events.append(ProcessEvent(
                event_type="file_write",
                path=path,
                process=process,
                pid=pid,
            ))
        elif "regsetvalue" in operation or "regcreatekey" in operation:
            events.append(ProcessEvent(
                event_type="registry_write",
                path=path,
                process=process,
                pid=pid,
            ))
        elif "process create" in operation:
            events.append(ProcessEvent(
                event_type="process_spawn",
                path=path,
                process=process,
                pid=pid,
            ))
    return events


def _parse_fakenet_log(log_content: str) -> list[NetworkEvent]:
    """Parse FakeNet-NG log output into NetworkEvent objects.

    # VALIDATE: check log format against actual FakeNet-NG output on the VPS.
    FakeNet-NG log lines typically start with 'Listener <name>: <detail>'
    """
    events: list[NetworkEvent] = []
    for line in log_content.splitlines():
        # DNS queries: "Listener DNS: Received A query for <host> from ..."
        dns_match = re.search(r"Received [A-Z]+ query for ([^\s]+)", line)
        if dns_match:
            events.append(NetworkEvent(
                event_type="dns_query",
                host=dns_match.group(1),
            ))
            continue

        # HTTP requests: "Listener HTTP: GET /path HTTP/1.1 Host: <host>"
        http_match = re.search(r"(GET|POST|PUT|HEAD) (/[^\s]*)[^H]*Host: ([^\s]+)", line)
        if http_match:
            events.append(NetworkEvent(
                event_type="http_request",
                host=http_match.group(3),
                path=http_match.group(2),
                payload_preview=line[:120],
            ))
            continue

        # TCP connections: "Listener TCP: Handling TCP connection from <host>:<port>"
        tcp_match = re.search(r"Handling TCP connection[^f]+from ([^\s:]+)", line)
        if tcp_match:
            events.append(NetworkEvent(
                event_type="tcp_connect",
                host=tcp_match.group(1),
            ))
    return events


async def detonate_sample(sample_path: str) -> dict[str, Any]:  # Any: DetonationResult fields
    """Copy sample to Windows VPS, run under Procmon + FakeNet-NG, return structured results.

    Args:
        sample_path: Local path to the malware sample.

    Returns:
        DetonationResult serialized as dict (for ADK compatibility).
    """
    await emit_event(
        EventType.TOOL_CALLED,
        agent=AgentName.HADES,
        tool="detonate_sample",
        payload={"sample_path": sample_path},
    )

    if not _VPS_IP:
        logger.warning("WINDOWS_VPS_IP not set — skipping live detonation")
        result = DetonationResult(error="WINDOWS_VPS_IP not configured")
        await emit_event(
            EventType.TOOL_RESULT,
            agent=AgentName.HADES,
            tool="detonate_sample",
            payload={"error": result.error},
        )
        return result.model_dump()

    ssh = _ssh_connect()
    try:
        sftp = ssh.open_sftp()
        remote_sample = f"{_SAMPLE_DIR}\\sample.js"
        sftp.put(sample_path, remote_sample)
        sftp.close()

        # Start FakeNet-NG in a background process
        await _exec(ssh, f"start /B python {_FAKENET_PATH} -l {_FAKENET_LOG}", timeout=5)
        await asyncio.sleep(2)

        # Start Procmon capture
        await _exec(ssh, f"{_PROCMON_PATH} /AcceptEula /Quiet /Minimized /BackingFile {_CAPTURE_PML}")
        await asyncio.sleep(1)

        # Detonate
        await _exec(ssh, f"wscript.exe {remote_sample}", timeout=_DETONATION_TIMEOUT + 5)
        await asyncio.sleep(5)

        # Stop Procmon and export CSV
        await _exec(ssh, f"{_PROCMON_PATH} /Terminate")
        await asyncio.sleep(2)
        await _exec(ssh, f"{_PROCMON_PATH} /OpenLog {_CAPTURE_PML} /SaveAs {_CAPTURE_CSV}")
        await asyncio.sleep(3)

        sftp = ssh.open_sftp()
        with sftp.open(_CAPTURE_CSV, "r") as f:
            procmon_csv = f.read().decode(errors="replace")

        try:
            with sftp.open(_FAKENET_LOG, "r") as f:
                fakenet_log = f.read().decode(errors="replace")
        except OSError:
            fakenet_log = ""
        sftp.close()

    finally:
        ssh.close()

    process_events = _parse_procmon_csv(procmon_csv)
    network_events = _parse_fakenet_log(fakenet_log)

    for pe in process_events:
        await emit_event(
            EventType.PROCESS_EVENT,
            agent=AgentName.HADES,
            tool="detonate_sample",
            payload=pe.model_dump(),
        )
    for ne in network_events:
        await emit_event(
            EventType.NETWORK_EVENT,
            agent=AgentName.HADES,
            tool="detonate_sample",
            payload=ne.model_dump(),
        )

    result = DetonationResult(
        process_events=process_events,
        network_events=network_events,
    )

    await emit_event(
        EventType.TOOL_RESULT,
        agent=AgentName.HADES,
        tool="detonate_sample",
        payload={
            "process_event_count": len(process_events),
            "network_event_count": len(network_events),
        },
    )

    return result.model_dump()

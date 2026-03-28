"""Docker-based dynamic malware analysis — runs sample in an isolated container."""
from __future__ import annotations

import io
import json
import logging
import tarfile
from pathlib import Path
from typing import Any

import docker
import docker.errors
from docker.models.containers import Container

logger = logging.getLogger(__name__)

_HARNESS_PATH = Path(__file__).parent / "harness.js"
_IMAGE = "node:18-alpine"
_TIMEOUT_SECONDS = 35


class SandboxManager:
    def __init__(self) -> None:
        self._client = docker.from_env()

    def run(self, file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
        """
        Execute the sample inside a hardened Docker container.

        Returns a list of intercepted API call records. Returns [] on any error.
        The container is always removed, even on failure.
        """
        container: Container | None = None
        try:
            container = self._create_container()
            self._copy_files_to_container(container, file_bytes, filename)
            container.start()
            container.wait(timeout=_TIMEOUT_SECONDS)
            raw_logs = container.logs(stdout=True, stderr=False)
            return self._parse_logs(raw_logs)
        except Exception as exc:
            logger.error("Dynamic analysis failed: %s", exc)
            return []
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except docker.errors.APIError:
                    pass

    def _create_container(self) -> Container:
        return self._client.containers.create(  # type: ignore[return-value]
            image=_IMAGE,
            command="node /tmp/work/harness.js /tmp/work/sample.js",
            detach=True,
            network_disabled=True,
            mem_limit="256m",
            cpu_quota=25000,  # 0.25 CPUs (100000 = 1 full CPU)
            read_only=True,
            tmpfs={"/tmp/work": "size=64m,mode=1777"},
            security_opt=["no-new-privileges"],
            cap_drop=["ALL"],
            stdin_open=False,
            tty=False,
        )

    def _copy_files_to_container(
        self, container: Container, file_bytes: bytes, filename: str
    ) -> None:
        """Copy harness.js and the sample into /tmp/work/ via tar archive."""
        harness_bytes = _HARNESS_PATH.read_bytes()

        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as tar:
            _add_bytes_to_tar(tar, "harness.js", harness_bytes)
            _add_bytes_to_tar(tar, "sample.js", file_bytes)
        buf.seek(0)

        container.put_archive("/tmp/work", buf.getvalue())

    def _parse_logs(self, raw: bytes) -> list[dict[str, Any]]:
        text = raw.decode("utf-8", errors="replace").strip()
        if not text:
            return []
        try:
            result: list[dict[str, Any]] = json.loads(text)
            return result
        except json.JSONDecodeError as exc:
            logger.warning("Could not parse harness output: %s", exc)
            return []


def _add_bytes_to_tar(tar: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name=name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))

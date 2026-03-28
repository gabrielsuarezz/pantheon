"""Converts harness.js JSON intercept log to structured behavioral indicators."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DynamicBehavior:
    commands_executed: list[str] = field(default_factory=list)
    network_calls: list[str] = field(default_factory=list)
    files_written: list[str] = field(default_factory=list)
    registry_writes: list[str] = field(default_factory=list)
    raw_apis: list[str] = field(default_factory=list)

    def to_behavior_strings(self) -> list[str]:
        """Convert to plain-language behavioral indicators."""
        out: list[str] = []
        for cmd in self.commands_executed:
            out.append(f"Executed command: {cmd}")
        for url in self.network_calls:
            out.append(f"Network call: {url}")
        for f in self.files_written:
            out.append(f"Wrote file: {f}")
        for r in self.registry_writes:
            out.append(f"Registry write: {r}")
        return out


_URL_RE = re.compile(r'https?://[^\s\'"]+')


def parse_intercept_log(log: list[dict[str, Any]]) -> DynamicBehavior:
    """Parse the JSON intercept log from harness.js into structured behaviors."""
    behavior = DynamicBehavior()

    for entry in log:
        api: str = entry.get("api", "")
        method: str = entry.get("method", "")
        args: list[str] = entry.get("args", [])
        args_joined = " ".join(args)

        behavior.raw_apis.append(f"{api}.{method}")

        # Command execution
        if method in ("Run", "Exec", "ShellExecute") or "cmd.exe" in args_joined or "powershell" in args_joined.lower():
            cmd = _first_arg(args)
            if cmd:
                behavior.commands_executed.append(cmd.strip('"\''))

        # Network calls — prefer full URLs from args, fall back to API name for
        # requests where the URL was already consumed in a prior open() call
        urls = _URL_RE.findall(args_joined)
        if urls:
            behavior.network_calls.extend(u.strip('"\'') for u in urls)
        elif any(kw in api for kw in ("XMLHTTP", "WinHttp", "XMLHttpRequest")):
            behavior.network_calls.append(f"{api}.{method}({_first_arg(args)})")

        # File writes
        if api == "fs" and "write" in method.lower():
            path = _first_arg(args)
            if path:
                behavior.files_written.append(path.strip('"\''))

        # Registry
        if "RegWrite" in method or "HKEY_" in args_joined:
            behavior.registry_writes.append(f"{method}({_first_arg(args)})")

    return behavior


def _first_arg(args: list[str]) -> str:
    return args[0].strip('"\'') if args else ""

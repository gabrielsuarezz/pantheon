from __future__ import annotations

from sandbox.static.extractor import extract_iocs, compute_hashes


def test_extract_ip() -> None:
    source = "connect to 203.0.113.1 on port 4444"
    result = extract_iocs(source, b"")
    assert "203.0.113.1" in result.ips


def test_extract_url() -> None:
    source = "download from http://evil.example.com/payload.exe"
    result = extract_iocs(source, b"")
    assert any("evil.example.com" in u for u in result.urls)


def test_extract_domain() -> None:
    source = "WScript.Shell.Run('curl update-service.evil-example.com')"
    result = extract_iocs(source, b"")
    assert any("evil-example.com" in d for d in result.domains)


def test_extract_windows_api() -> None:
    source = "new ActiveXObject('WScript.Shell'); var x = CreateObject('ADODB.Stream');"
    result = extract_iocs(source, b"")
    assert result.windows_apis
    assert "ActiveXObject" in result.windows_apis or "WScript.Shell" in result.windows_apis


def test_extract_registry() -> None:
    source = "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
    result = extract_iocs(source, b"")
    assert result.registry_keys


def test_compute_hashes() -> None:
    data = b"test content"
    hashes = compute_hashes(data)
    assert len(hashes["sha256"]) == 64
    assert len(hashes["md5"]) == 32


def test_extract_ports() -> None:
    source = "TCP/4444 and port 8443 for C2"
    result = extract_iocs(source, b"")
    assert 4444 in result.ports or 8443 in result.ports

"""Static IOC extraction from malware source text."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

# --- Compiled patterns -------------------------------------------------------

_IP_RE = re.compile(r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b')
_URL_RE = re.compile(r'https?://[^\s\'"<>\]]+[^\s\'"<>\].,;]')
_DOMAIN_RE = re.compile(
    r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)'
    r'+(?:com|net|org|io|ru|cn|tk|xyz|top|info|biz|co|me|cc|pw)\b'
)
_REGISTRY_RE = re.compile(r'HKEY_[A-Z_]+(?:\\[^\s\'"\\]+)+')
_FILE_PATH_RE = re.compile(r'(?:[A-Za-z]:\\|%\w+%\\|/tmp/|/var/|/etc/)[^\s\'"<>]+')
_PORT_RE = re.compile(r'\b(?:TCP|UDP|port)[/\s]+(\d{2,5})\b', re.IGNORECASE)

_WINDOWS_APIS = [
    "WScript.Shell", "WScript.Run", "WScript.Exec",
    "ActiveXObject", "CreateObject",
    "ADODB.Stream", "Scripting.FileSystemObject",
    "XMLHttpRequest", "WinHttp.WinHttpRequest",
    "Microsoft.XMLHTTP", "Shell.Application",
    "WMI", "GetObject",
]

_DANGEROUS_PATTERNS = [
    "eval(", "Function(", "unescape(", "fromCharCode",
    "WScript.Run", "cmd.exe", "powershell",
    "base64_decode", "exec(",
]

_KNOWN_MALICIOUS_PORTS = {4444, 8443, 1337, 31337, 9090, 8888, 2222}


@dataclass
class ExtractedIOCs:
    ips: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)
    ports: list[int] = field(default_factory=list)
    registry_keys: list[str] = field(default_factory=list)
    file_paths: list[str] = field(default_factory=list)
    windows_apis: list[str] = field(default_factory=list)
    dangerous_patterns: list[str] = field(default_factory=list)


def extract_iocs(source: str, _file_bytes: bytes) -> ExtractedIOCs:
    """Extract all indicators of compromise from malware source text."""
    iocs = ExtractedIOCs()

    iocs.ips = list(dict.fromkeys(
        ip for ip in _IP_RE.findall(source) if not _is_private_ip(ip)
    ))

    iocs.urls = list(dict.fromkeys(_URL_RE.findall(source)))

    url_domains = [d for u in iocs.urls if (d := _extract_domain(u))]
    standalone = _DOMAIN_RE.findall(source)
    iocs.domains = list(dict.fromkeys(url_domains + standalone))

    iocs.registry_keys = list(dict.fromkeys(_REGISTRY_RE.findall(source)))
    iocs.file_paths = list(dict.fromkeys(_FILE_PATH_RE.findall(source)))
    iocs.windows_apis = [api for api in _WINDOWS_APIS if api in source]
    iocs.dangerous_patterns = [p for p in _DANGEROUS_PATTERNS if p in source]

    explicit = [int(m.group(1)) for m in _PORT_RE.finditer(source)]
    direct = [int(m.group(1)) for m in re.finditer(r'\b(\d{4,5})\b', source)
              if int(m.group(1)) in _KNOWN_MALICIOUS_PORTS]
    iocs.ports = list(dict.fromkeys(explicit + direct))

    return iocs


def compute_hashes(data: bytes) -> dict[str, str]:
    """Compute MD5 and SHA256 hashes of the given bytes."""
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "md5": hashlib.md5(data).hexdigest(),
    }


def _is_private_ip(ip: str) -> bool:
    parts = ip.split(".")
    if len(parts) != 4:
        return False
    first, second = int(parts[0]), int(parts[1])
    return (
        first == 10
        or (first == 172 and 16 <= second <= 31)
        or (first == 192 and second == 168)
        or first == 127
    )


def _extract_domain(url: str) -> str | None:
    match = re.match(r'https?://([^/\s:]+)', url)
    return match.group(1) if match else None

# Pablo — Sandbox, Agents, Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Hephaestus sandbox FastAPI service (static + dynamic malware analysis), Zeus/Athena/Artemis ADK agents, and Docker Compose infra for the full Pantheon stack.

**Architecture:** Hephaestus is a standalone FastAPI service on port 9000 that accepts a base64-encoded malware sample, runs static analysis (string extraction, _0x deobfuscation, Gemini inference) and dynamic analysis (isolated Docker container with a JS instrumentation harness), and returns structured ThreatReport/IOCReport responses. Zeus and Athena are Google ADK agents that orchestrate the downstream analysis pipeline. Artemis is an asyncio daemon that watches for new samples and auto-triggers Zeus.

**Tech Stack:** Python 3.12, uv, FastAPI, uvicorn, docker SDK, google-adk, google-genai, pydantic v2, pytest, pytest-asyncio

---

## File Map

```
sandbox/
  __init__.py                  create — package marker
  main.py                      create — FastAPI app, 4 endpoints
  analyzer.py                  create — orchestrates static + dynamic, in-memory job store
  static/
    __init__.py                create
    extractor.py               create — regex IOC extraction, hash computation, Windows API detection
    deobfuscator.py            create — _0x string array extraction + partial resolution
    gemini_analyst.py          create — sends deobfuscated chunks to Gemini, parses ThreatReport fields
  dynamic/
    __init__.py                create
    harness.js                 create — Node.js instrumentation harness (mocks WScript/ActiveX/Shell)
    manager.py                 create — Docker SDK container lifecycle
    parser.py                  create — converts harness JSON intercept log to behavioral indicators
agents/
  __init__.py                  create
  zeus.py                      create — root ADK orchestrator
  athena.py                    create — triage agent + classify_threat / create_ticket tools
  artemis.py                   create — asyncio file-watcher daemon
tests/
  __init__.py                  create
  conftest.py                  create — shared fixtures
  sandbox/
    __init__.py                create
    test_extractor.py          create
    test_deobfuscator.py       create
    test_gemini_analyst.py     create
    test_manager.py            create
    test_parser.py             create
    test_analyzer.py           create
    test_main.py               create
  agents/
    __init__.py                create
    test_athena.py             create
infra/
  docker-compose.yml           create
  Dockerfile.sandbox           create
  Dockerfile.agents            create
  Dockerfile.gateway           create
  nginx.conf                   create
run.py                         create — entry point
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `sandbox/__init__.py`, `sandbox/static/__init__.py`, `sandbox/dynamic/__init__.py`
- Create: `agents/__init__.py`
- Create: `tests/__init__.py`, `tests/conftest.py`, `tests/sandbox/__init__.py`, `tests/agents/__init__.py`
- Create: `run.py`

- [x] **Step 1: Create all `__init__.py` files**

```bash
touch sandbox/__init__.py sandbox/static/__init__.py sandbox/dynamic/__init__.py
touch agents/__init__.py
touch tests/__init__.py tests/sandbox/__init__.py tests/agents/__init__.py
```

- [x] **Step 2: Create `tests/conftest.py`**

```python
"""Shared pytest fixtures for Pantheon tests."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def sample_js_bytes() -> bytes:
    """Minimal obfuscated JS bytes for testing — NOT the real malware."""
    return b"var _0x1a2b=['hello','world'];function _0x3c4d(i){return _0x1a2b[i];}console.log(_0x3c4d(0));"


@pytest.fixture()
def sample_js_b64(sample_js_bytes: bytes) -> str:
    import base64
    return base64.b64encode(sample_js_bytes).decode()
```

- [x] **Step 3: Create `run.py`**

```python
"""Pantheon entry point — starts all services."""
from __future__ import annotations

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()


def _check_env() -> None:
    required = ["GOOGLE_API_KEY", "TELEGRAM_BOT_TOKEN", "ELEVENLABS_API_KEY"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        print(f"Missing environment variables: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in values.")
        sys.exit(1)


def main() -> None:
    _check_env()
    import uvicorn
    from sandbox.main import app
    uvicorn.run(app, host="0.0.0.0", port=9000, log_level="info")


if __name__ == "__main__":
    main()
```

- [x] **Step 4: Install dependencies and verify**

```bash
uv sync
uv run python -c "import fastapi, docker, pydantic; print('deps ok')"
```

Expected output: `deps ok`

- [x] **Step 5: Commit**

```bash
git add sandbox/__init__.py sandbox/static/__init__.py sandbox/dynamic/__init__.py \
  agents/__init__.py tests/__init__.py tests/conftest.py tests/sandbox/__init__.py \
  tests/agents/__init__.py run.py
git commit -m "chore: project scaffolding and entry point"
```

---

## Task 2: Static extractor

**Files:**
- Create: `sandbox/static/extractor.py`
- Create: `tests/sandbox/test_extractor.py`

- [x] **Step 1: Write failing tests**

```python
# tests/sandbox/test_extractor.py
from __future__ import annotations

import pytest
from sandbox.static.extractor import extract_iocs, compute_hashes
from sandbox.models import NetworkIOCs, FileIOCs, IOCReport


def test_extract_ip() -> None:
    source = "connect to 192.168.1.1 on port 4444"
    result = extract_iocs(source, b"")
    assert "192.168.1.1" in result.ips


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
```

- [x] **Step 2: Run tests — verify they fail**

```bash
uv run pytest tests/sandbox/test_extractor.py -v
```

Expected: all tests fail with `ModuleNotFoundError` or `ImportError`.

- [x] **Step 3: Implement `sandbox/static/extractor.py`**

```python
"""Static IOC extraction from malware source text."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

# --- Compiled patterns -------------------------------------------------------

_IP_RE = re.compile(r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b')
_URL_RE = re.compile(r'https?://[^\s\'"<>\]]+')
_DOMAIN_RE = re.compile(
    r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)'
    r'+(?:com|net|org|io|ru|cn|tk|xyz|top|info|biz|co|me|cc|pw)\b'
)
_REGISTRY_RE = re.compile(r'HKEY_[A-Z_]+(?:\\[^\s\'"\\]+)+')
_FILE_PATH_RE = re.compile(r'(?:[A-Za-z]:\\|%\w+%\\|/tmp/|/var/|/etc/)[^\s\'"<>]+')
_PORT_RE = re.compile(r'\b(?:TCP|UDP|port)[/\s]+(\d{2,5})\b', re.IGNORECASE)
_PORT_DIRECT_RE = re.compile(r'\b(\d{4,5})\b')

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

    # IPs — deduplicate, exclude private ranges for main list
    all_ips = list(dict.fromkeys(_IP_RE.findall(source)))
    iocs.ips = [ip for ip in all_ips if not _is_private_ip(ip)]

    # URLs
    iocs.urls = list(dict.fromkeys(_URL_RE.findall(source)))

    # Domains — from URLs and standalone
    url_domains = [_extract_domain(u) for u in iocs.urls if _extract_domain(u)]
    standalone = _DOMAIN_RE.findall(source)
    iocs.domains = list(dict.fromkeys(url_domains + standalone))

    # Registry keys
    iocs.registry_keys = list(dict.fromkeys(_REGISTRY_RE.findall(source)))

    # File paths
    iocs.file_paths = list(dict.fromkeys(_FILE_PATH_RE.findall(source)))

    # Windows APIs
    iocs.windows_apis = [api for api in _WINDOWS_APIS if api in source]

    # Dangerous patterns
    iocs.dangerous_patterns = [p for p in _DANGEROUS_PATTERNS if p in source]

    # Ports — explicit mentions + well-known malicious ports found in source
    explicit = [int(m.group(1)) for m in _PORT_RE.finditer(source)]
    direct = [int(m.group(1)) for m in _PORT_DIRECT_RE.finditer(source)
              if int(m.group(1)) in _KNOWN_MALICIOUS_PORTS]
    iocs.ports = list(dict.fromkeys(explicit + direct))

    return iocs


def compute_hashes(data: bytes) -> dict[str, str]:
    """Compute MD5 and SHA256 hashes of the given bytes."""
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "md5": hashlib.md5(data).hexdigest(),  # noqa: S324
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
```

- [x] **Step 4: Run tests — verify they pass**

```bash
uv run pytest tests/sandbox/test_extractor.py -v
```

Expected: all 7 tests pass.

- [x] **Step 5: Commit**

```bash
git add sandbox/static/extractor.py tests/sandbox/test_extractor.py
git commit -m "feat(sandbox): static IOC extractor with regex patterns"
```

---

## Task 3: JS deobfuscator

**Files:**
- Create: `sandbox/static/deobfuscator.py`
- Create: `tests/sandbox/test_deobfuscator.py`

- [x] **Step 1: Write failing tests**

```python
# tests/sandbox/test_deobfuscator.py
from __future__ import annotations

from sandbox.static.deobfuscator import extract_string_array, extract_readable_strings, DeobfuscationResult


def test_extract_string_array_single_quoted() -> None:
    source = "var _0x1a2b=['WScript.Shell','powershell','eval'];"
    strings = extract_string_array(source)
    assert "WScript.Shell" in strings
    assert "powershell" in strings


def test_extract_string_array_double_quoted() -> None:
    source = 'var _0xabcd=["ActiveXObject","ADODB.Stream","http://evil.com"];'
    strings = extract_string_array(source)
    assert "ActiveXObject" in strings
    assert "http://evil.com" in strings


def test_extract_string_array_empty_when_none() -> None:
    source = "function foo() { return 1 + 2; }"
    strings = extract_string_array(source)
    assert strings == []


def test_extract_readable_strings() -> None:
    source = b"WScript.Shell\x00\xff\xfe\x00CreateObject\x00junk\x01\x02\x03"
    strings = extract_readable_strings(source, min_length=6)
    assert "WScript.Shell" in strings
    assert "CreateObject" in strings


def test_deobfuscation_result_summary() -> None:
    source = "var _0x1a2b=['WScript.Shell','http://evil.com'];"
    result = DeobfuscationResult.from_source(source, source.encode())
    assert len(result.string_array) == 2
    assert result.summary_text  # non-empty
```

- [x] **Step 2: Run to verify failures**

```bash
uv run pytest tests/sandbox/test_deobfuscator.py -v
```

Expected: all fail with `ModuleNotFoundError`.

- [x] **Step 3: Implement `sandbox/static/deobfuscator.py`**

```python
"""JS deobfuscation utilities — extracts strings from _0x-obfuscated source."""
from __future__ import annotations

import re
import json
from dataclasses import dataclass, field


# Matches: var _0xABCD = ['str1', 'str2', ...] or var _0xABCD=['str1',...]
_STRING_ARRAY_RE = re.compile(
    r'var\s+_0x[a-fA-F0-9]+\s*=\s*(\[(?:[\'"][^\'"]*[\'"](?:,\s*[\'"][^\'"]*[\'"])*)\])'
)

# Matches printable ASCII runs of min_length characters
_PRINTABLE_RE = re.compile(r'[ -~]{%d,}')


@dataclass
class DeobfuscationResult:
    string_array: list[str] = field(default_factory=list)
    readable_strings: list[str] = field(default_factory=list)
    summary_text: str = ""

    @classmethod
    def from_source(cls, source_text: str, source_bytes: bytes) -> DeobfuscationResult:
        string_array = extract_string_array(source_text)
        readable = extract_readable_strings(source_bytes, min_length=8)

        # Build a compact summary for Gemini — avoid sending 4MB of raw obfuscated JS
        interesting = [s for s in (string_array + readable)
                       if len(s) > 4 and not s.startswith("0x")]
        deduped = list(dict.fromkeys(interesting))[:500]  # cap at 500 strings

        summary = "\n".join([
            "=== Extracted string array ===",
            "\n".join(string_array[:200]),
            "",
            "=== Additional readable strings ===",
            "\n".join(deduped),
        ])

        return cls(
            string_array=string_array,
            readable_strings=readable,
            summary_text=summary,
        )


def extract_string_array(source: str) -> list[str]:
    """Extract the main _0x string literal array from obfuscated JS source."""
    match = _STRING_ARRAY_RE.search(source)
    if not match:
        return []
    raw = match.group(1)
    # Normalize quotes for JSON parsing
    normalized = re.sub(r"'([^']*)'", lambda m: '"' + m.group(1).replace('"', '\\"') + '"', raw)
    try:
        result: list[str] = json.loads(normalized)
        return result
    except (json.JSONDecodeError, ValueError):
        # Fallback: manual extraction
        return re.findall(r"['\"]([^'\"]{2,})['\"]", raw)


def extract_readable_strings(data: bytes, min_length: int = 8) -> list[str]:
    """Extract printable ASCII strings from raw bytes (like Unix `strings`)."""
    text = data.decode("ascii", errors="replace")
    pattern = _PRINTABLE_RE.pattern % min_length
    matches = re.findall(pattern, text)
    return list(dict.fromkeys(matches))
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_deobfuscator.py -v
```

Expected: all 5 tests pass.

- [x] **Step 5: Commit**

```bash
git add sandbox/static/deobfuscator.py tests/sandbox/test_deobfuscator.py
git commit -m "feat(sandbox): JS deobfuscator — string array extraction and readable string dump"
```

---

## Task 4: Gemini analyst

**Files:**
- Create: `sandbox/static/gemini_analyst.py`
- Create: `tests/sandbox/test_gemini_analyst.py`

- [x] **Step 1: Write failing tests**

```python
# tests/sandbox/test_gemini_analyst.py
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from sandbox.static.gemini_analyst import GeminiAnalyst
from sandbox.models import RiskLevel


@pytest.fixture()
def mock_gemini_response() -> str:
    return """
    {
      "malware_type": "WSH dropper",
      "obfuscation_technique": "javascript-obfuscator _0x string array",
      "behavior": ["downloads payload from C2", "establishes persistence via registry"],
      "risk_level": "critical",
      "affected_systems": ["Windows workstations", "Active Directory"],
      "network_iocs": {"ips": ["1.2.3.4"], "domains": ["evil.com"], "ports": [4444], "protocols": ["TCP"], "urls": []},
      "registry_iocs": ["HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\updater"],
      "remediation_hints": ["Block 1.2.3.4 at firewall", "Remove registry persistence key"]
    }
    """


@pytest.mark.asyncio()
async def test_analyze_returns_threat_report(mock_gemini_response: str) -> None:
    analyst = GeminiAnalyst(api_key="test-key")
    with patch.object(analyst, "_call_gemini", new_callable=AsyncMock, return_value=mock_gemini_response):
        report = await analyst.analyze(summary_text="WScript.Shell http://evil.com/payload.exe")
    assert report.malware_type == "WSH dropper"
    assert report.risk_level == "critical"
    assert "1.2.3.4" in report.network_iocs.ips


@pytest.mark.asyncio()
async def test_analyze_handles_malformed_json(mock_gemini_response: str) -> None:
    analyst = GeminiAnalyst(api_key="test-key")
    with patch.object(analyst, "_call_gemini", new_callable=AsyncMock, return_value="not valid json"):
        report = await analyst.analyze(summary_text="some strings")
    # Should return a default report rather than raising
    assert report.malware_type  # non-empty fallback
    assert report.risk_level in ("low", "medium", "high", "critical")
```

- [x] **Step 2: Verify failures**

```bash
uv run pytest tests/sandbox/test_gemini_analyst.py -v
```

- [x] **Step 3: Implement `sandbox/static/gemini_analyst.py`**

```python
"""Gemini-powered malware analysis — sends deobfuscated content for behavioral inference."""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from google import genai
from google.genai import types

from sandbox.models import NetworkIOCs, ThreatReport, RiskLevel

logger = logging.getLogger(__name__)

_ANALYSIS_PROMPT = """\
You are a malware analyst. The following are strings and patterns extracted from an obfuscated JavaScript malware sample.

Analyze this content and respond ONLY with a JSON object matching this exact schema:
{
  "malware_type": "string — e.g. WSH dropper, ransomware loader, keylogger",
  "obfuscation_technique": "string — describe the obfuscation method",
  "behavior": ["array of strings — observed or inferred behaviors"],
  "risk_level": "critical | high | medium | low",
  "affected_systems": ["array — Windows workstations, servers, browsers, etc."],
  "network_iocs": {
    "ips": ["list of malicious IPs"],
    "domains": ["list of malicious domains"],
    "ports": [list of integer ports],
    "protocols": ["list of protocols"],
    "urls": ["list of full URLs"]
  },
  "registry_iocs": ["list of registry keys"],
  "remediation_hints": ["list of concrete remediation steps"]
}

Extracted content:
"""


class GeminiAnalyst:
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ["GOOGLE_API_KEY"]
        self._client = genai.Client(api_key=self._api_key)

    async def analyze(self, summary_text: str) -> ThreatReport:
        """Send extracted strings to Gemini and parse the response into a ThreatReport."""
        prompt = _ANALYSIS_PROMPT + summary_text[:12000]  # cap context
        try:
            raw = await self._call_gemini(prompt)
            return self._parse_response(raw)
        except Exception as exc:
            logger.warning("Gemini analysis failed: %s", exc)
            return self._fallback_report(str(exc))

    async def _call_gemini(self, prompt: str) -> str:
        response = await self._client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        return response.text

    def _parse_response(self, raw: str) -> ThreatReport:
        # Strip markdown code fences if present
        text = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data: dict[str, Any] = json.loads(text)

        net = data.get("network_iocs", {})
        return ThreatReport(
            job_id="",  # filled in by analyzer.py
            status="complete",
            malware_type=data.get("malware_type", "unknown"),
            obfuscation_technique=data.get("obfuscation_technique", "unknown"),
            behavior=data.get("behavior", []),
            network_iocs=NetworkIOCs(
                ips=net.get("ips", []),
                domains=net.get("domains", []),
                ports=net.get("ports", []),
                protocols=net.get("protocols", []),
                urls=net.get("urls", []),
            ),
            file_iocs=_default_file_iocs(),
            registry_iocs=data.get("registry_iocs", []),
            risk_level=_safe_risk(data.get("risk_level", "medium")),
            affected_systems=data.get("affected_systems", []),
            gemini_summary=raw[:2000],
            remediation_hints=data.get("remediation_hints", []),
        )

    def _fallback_report(self, error: str) -> ThreatReport:
        return ThreatReport(
            job_id="",
            status="complete",
            malware_type="unknown — Gemini analysis failed",
            obfuscation_technique="unknown",
            behavior=[f"Gemini error: {error}"],
            network_iocs=NetworkIOCs(),
            file_iocs=_default_file_iocs(),
            registry_iocs=[],
            risk_level="high",
            affected_systems=["unknown"],
            gemini_summary=error,
            remediation_hints=["Manual analysis required"],
        )


def _default_file_iocs() -> Any:
    from sandbox.models import FileIOCs
    return FileIOCs()


def _safe_risk(value: str) -> RiskLevel:  # type: ignore[return]
    if value in ("low", "medium", "high", "critical"):
        return value  # type: ignore[return-value]
    return "high"
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_gemini_analyst.py -v
```

Expected: both tests pass.

- [x] **Step 5: Commit**

```bash
git add sandbox/static/gemini_analyst.py tests/sandbox/test_gemini_analyst.py
git commit -m "feat(sandbox): Gemini analyst — deobfuscated JS to ThreatReport"
```

---

## Task 5: Dynamic harness (Node.js)

**Files:**
- Create: `sandbox/dynamic/harness.js`

No Python tests for this file — it runs inside Docker. Verified manually in Task 6.

- [x] **Step 1: Create `sandbox/dynamic/harness.js`**

```javascript
/**
 * Pantheon malware instrumentation harness.
 * Stubs dangerous APIs, intercepts all calls, outputs JSON log.
 * Run as: node harness.js <sample_path>
 *
 * SAFETY: This file is designed to run ONLY inside a hardened Docker container.
 * --network none --read-only --cap-drop ALL --security-opt no-new-privileges
 * Never run this on a host machine with the actual malware sample.
 */

'use strict';

const path = require('path');
const interceptLog = [];

function ts() {
  return new Date().toISOString();
}

function makeProxy(apiName) {
  const handler = {
    get(target, prop) {
      if (prop === 'then') return undefined; // prevent Promise confusion
      return new Proxy(function () {}, {
        apply(_t, _this, args) {
          interceptLog.push({
            api: apiName,
            method: String(prop),
            args: args.map(a => {
              try { return JSON.stringify(a); } catch (_) { return String(a); }
            }),
            timestamp: ts(),
          });
          return '';
        },
        get(_t2, prop2) {
          return makeProxy(`${apiName}.${String(prop)}`).get(null, prop2);
        },
      });
    },
    construct(_t, args) {
      interceptLog.push({ api: apiName, method: 'new', args: args.map(String), timestamp: ts() });
      return makeProxy(`${apiName}#instance`);
    },
  };
  return new Proxy({}, handler);
}

// --- Stub globals -----------------------------------------------------------

global.WScript = makeProxy('WScript');
global.WSH = makeProxy('WSH');
global.ActiveXObject = function ActiveXObject(name) {
  interceptLog.push({ api: 'ActiveXObject', method: 'constructor', args: [String(name)], timestamp: ts() });
  return makeProxy(`ActiveX(${name})`);
};
global.GetObject = function GetObject(arg) {
  interceptLog.push({ api: 'GetObject', method: 'call', args: [String(arg)], timestamp: ts() });
  return makeProxy('GetObject#result');
};

// Intercept require for dangerous modules
const _origRequire = require;
function safeRequire(id) {
  const blocked = ['child_process', 'net', 'http', 'https', 'dgram', 'tls', 'cluster'];
  if (blocked.includes(id)) {
    interceptLog.push({ api: 'require', method: id, args: [], timestamp: ts() });
    return makeProxy(`module:${id}`);
  }
  if (id === 'fs') {
    const realFs = _origRequire('fs');
    const fsProxy = Object.assign({}, realFs);
    ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'unlink', 'unlinkSync'].forEach(fn => {
      fsProxy[fn] = function (...args) {
        interceptLog.push({ api: 'fs', method: fn, args: args.map(a => String(a).slice(0, 200)), timestamp: ts() });
      };
    });
    return fsProxy;
  }
  return _origRequire(id);
}
// Override require in global scope for eval'd code
global.require = safeRequire;

// Collapse time-based evasion
global.setTimeout = function (fn) { try { if (typeof fn === 'function') fn(); } catch (_) {} };
global.setInterval = function (fn) { try { if (typeof fn === 'function') fn(); } catch (_) {} };
global.clearTimeout = function () {};
global.clearInterval = function () {};

// --- Load sample ------------------------------------------------------------

const samplePath = process.argv[2];
if (!samplePath) {
  process.stderr.write('Usage: node harness.js <sample_path>\n');
  process.exit(1);
}

try {
  const abs = path.resolve(samplePath);
  _origRequire(abs);
} catch (e) {
  interceptLog.push({ api: 'runtime', method: 'error', args: [String(e.message)], timestamp: ts() });
}

process.stdout.write(JSON.stringify(interceptLog));
```

- [x] **Step 2: Commit**

```bash
git add sandbox/dynamic/harness.js
git commit -m "feat(sandbox): Node.js instrumentation harness for dynamic analysis"
```

---

## Task 6: Docker sandbox manager

**Files:**
- Create: `sandbox/dynamic/manager.py`
- Create: `tests/sandbox/test_manager.py`

- [x] **Step 1: Write failing tests**

```python
# tests/sandbox/test_manager.py
from __future__ import annotations

from unittest.mock import MagicMock, patch, call
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
        result = manager.run(b"var x = 1;", "test.js")
    assert isinstance(result, list)
    assert result[0]["api"] == "WScript"


def test_container_uses_security_flags(mock_docker_client: MagicMock) -> None:
    with patch("sandbox.dynamic.manager.docker.from_env", return_value=mock_docker_client):
        manager = SandboxManager()
        manager.run(b"var x = 1;", "test.js")

    create_kwargs = mock_docker_client.containers.create.call_args.kwargs
    assert create_kwargs.get("network_disabled") is True
    assert create_kwargs.get("mem_limit") == "256m"
    assert "no-new-privileges" in create_kwargs.get("security_opt", [])
    assert "ALL" in create_kwargs.get("cap_drop", [])


def test_container_removed_on_success(mock_docker_client: MagicMock) -> None:
    with patch("sandbox.dynamic.manager.docker.from_env", return_value=mock_docker_client):
        manager = SandboxManager()
        manager.run(b"var x = 1;", "test.js")
    mock_docker_client.containers.create.return_value.remove.assert_called_once_with(force=True)


def test_container_removed_on_error(mock_docker_client: MagicMock) -> None:
    mock_docker_client.containers.create.return_value.start.side_effect = RuntimeError("fail")
    with patch("sandbox.dynamic.manager.docker.from_env", return_value=mock_docker_client):
        manager = SandboxManager()
        result = manager.run(b"var x = 1;", "test.js")
    # Should return empty list, not raise, and still remove
    assert result == []
    mock_docker_client.containers.create.return_value.remove.assert_called_once_with(force=True)
```

- [x] **Step 2: Verify failures**

```bash
uv run pytest tests/sandbox/test_manager.py -v
```

- [x] **Step 3: Implement `sandbox/dynamic/manager.py`**

```python
"""Docker-based dynamic malware analysis — runs sample in an isolated container."""
from __future__ import annotations

import io
import json
import logging
import tarfile
import tempfile
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
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_manager.py -v
```

Expected: all 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add sandbox/dynamic/manager.py tests/sandbox/test_manager.py
git commit -m "feat(sandbox): Docker sandbox manager with hardened container flags"
```

---

## Task 7: Harness output parser

**Files:**
- Create: `sandbox/dynamic/parser.py`
- Create: `tests/sandbox/test_parser.py`

- [x] **Step 1: Write failing tests**

```python
# tests/sandbox/test_parser.py
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
```

- [x] **Step 2: Verify failures**

```bash
uv run pytest tests/sandbox/test_parser.py -v
```

- [x] **Step 3: Implement `sandbox/dynamic/parser.py`**

```python
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

        # Network calls
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
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_parser.py -v
```

Expected: all 5 tests pass.

- [x] **Step 5: Commit**

```bash
git add sandbox/dynamic/parser.py tests/sandbox/test_parser.py
git commit -m "feat(sandbox): dynamic analysis output parser"
```

---

## Task 8: Analyzer orchestrator

**Files:**
- Create: `sandbox/analyzer.py`
- Create: `tests/sandbox/test_analyzer.py`

- [x] **Step 1: Write failing tests**

```python
# tests/sandbox/test_analyzer.py
from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from sandbox.analyzer import Analyzer
from sandbox.models import ThreatReport, IOCReport, NetworkIOCs, FileIOCs


@pytest.fixture()
def fake_threat_report() -> ThreatReport:
    return ThreatReport(
        job_id="test-job",
        status="complete",
        malware_type="WSH dropper",
        obfuscation_technique="_0x",
        behavior=["downloads payload"],
        network_iocs=NetworkIOCs(ips=["1.2.3.4"], domains=["evil.com"]),
        file_iocs=FileIOCs(sha256="a" * 64, md5="b" * 32),
        risk_level="critical",
        affected_systems=["Windows"],
        gemini_summary="drops a payload",
    )


@pytest.mark.asyncio()
async def test_run_returns_stored_report(fake_threat_report: ThreatReport) -> None:
    analyzer = Analyzer()
    js_bytes = b"var _0x1=['WScript'];WScript.Run('cmd');"
    b64 = base64.b64encode(js_bytes).decode()

    with (
        patch.object(analyzer, "_run_static", new_callable=AsyncMock, return_value=fake_threat_report),
        patch.object(analyzer, "_run_dynamic", return_value=[]),
    ):
        job_id = await analyzer.submit(b64, "test.js", "both")
        report = analyzer.get_report(job_id)

    assert report is not None
    assert report.malware_type == "WSH dropper"


@pytest.mark.asyncio()
async def test_get_iocs_from_report(fake_threat_report: ThreatReport) -> None:
    analyzer = Analyzer()
    js_bytes = b"var x=1;"
    b64 = base64.b64encode(js_bytes).decode()

    with (
        patch.object(analyzer, "_run_static", new_callable=AsyncMock, return_value=fake_threat_report),
        patch.object(analyzer, "_run_dynamic", return_value=[]),
    ):
        job_id = await analyzer.submit(b64, "test.js", "static")
        iocs = analyzer.get_iocs(job_id)

    assert iocs is not None
    assert "1.2.3.4" in iocs.ips


def test_get_report_unknown_job() -> None:
    analyzer = Analyzer()
    assert analyzer.get_report("nonexistent") is None


def test_get_iocs_unknown_job() -> None:
    analyzer = Analyzer()
    assert analyzer.get_iocs("nonexistent") is None
```

- [x] **Step 2: Verify failures**

```bash
uv run pytest tests/sandbox/test_analyzer.py -v
```

- [x] **Step 3: Implement `sandbox/analyzer.py`**

```python
"""Hephaestus analysis orchestrator — runs static + dynamic pipelines, stores results."""
from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

from sandbox.dynamic.manager import SandboxManager
from sandbox.dynamic.parser import parse_intercept_log
from sandbox.models import (
    AnalysisType,
    FileIOCs,
    IOCReport,
    JobStatus,
    NetworkIOCs,
    ThreatReport,
)
from sandbox.static.deobfuscator import DeobfuscationResult
from sandbox.static.extractor import ExtractedIOCs, compute_hashes, extract_iocs
from sandbox.static.gemini_analyst import GeminiAnalyst

logger = logging.getLogger(__name__)


class Analyzer:
    def __init__(self) -> None:
        self._jobs: dict[str, ThreatReport] = {}
        self._iocs: dict[str, IOCReport] = {}
        self._gemini = GeminiAnalyst()
        self._docker = SandboxManager()

    async def submit(
        self, file_content_b64: str, filename: str, analysis_type: AnalysisType  # type: ignore[valid-type]
    ) -> str:
        """Decode, analyze, store results. Returns job_id."""
        file_bytes = base64.b64decode(file_content_b64)
        job_id = _make_job_id(filename, file_bytes)

        # Store pending immediately so callers can poll
        self._jobs[job_id] = _pending_report(job_id)

        asyncio.create_task(self._run(job_id, file_bytes, filename, analysis_type))
        return job_id

    async def _run(
        self, job_id: str, file_bytes: bytes, filename: str, analysis_type: str
    ) -> None:
        try:
            static_report = await self._run_static(file_bytes, job_id)

            dynamic_log: list[dict[str, Any]] = []
            if analysis_type in ("dynamic", "both"):
                dynamic_log = self._run_dynamic(file_bytes, filename)

            report = self._merge(job_id, static_report, dynamic_log, file_bytes)
            self._jobs[job_id] = report
            self._iocs[job_id] = _iocs_from_report(report)

        except Exception as exc:
            logger.exception("Analysis job %s failed: %s", job_id, exc)
            self._jobs[job_id] = _error_report(job_id, str(exc))

    async def _run_static(self, file_bytes: bytes, job_id: str) -> ThreatReport:
        source = file_bytes.decode("utf-8", errors="replace")
        deob = DeobfuscationResult.from_source(source, file_bytes)
        extracted = extract_iocs(deob.summary_text, file_bytes)
        hashes = compute_hashes(file_bytes)
        gemini_report = await self._gemini.analyze(deob.summary_text)
        gemini_report.job_id = job_id
        gemini_report.file_iocs = FileIOCs(
            sha256=hashes["sha256"],
            md5=hashes["md5"],
            paths=extracted.file_paths,
        )
        # Merge extractor IPs/domains that Gemini may have missed
        gemini_report.network_iocs.ips = list(
            dict.fromkeys(gemini_report.network_iocs.ips + extracted.ips)
        )
        gemini_report.network_iocs.domains = list(
            dict.fromkeys(gemini_report.network_iocs.domains + extracted.domains)
        )
        return gemini_report

    def _run_dynamic(self, file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
        return self._docker.run(file_bytes, filename)

    def _merge(
        self,
        job_id: str,
        static: ThreatReport,
        dynamic_log: list[dict[str, Any]],
        file_bytes: bytes,
    ) -> ThreatReport:
        if not dynamic_log:
            return static
        behavior = parse_intercept_log(dynamic_log)
        static.behavior = list(dict.fromkeys(static.behavior + behavior.to_behavior_strings()))
        static.network_iocs.urls = list(
            dict.fromkeys(static.network_iocs.urls + behavior.network_calls)
        )
        return static

    def get_report(self, job_id: str) -> ThreatReport | None:
        return self._jobs.get(job_id)

    def get_iocs(self, job_id: str) -> IOCReport | None:
        return self._iocs.get(job_id)


def _make_job_id(filename: str, data: bytes) -> str:
    import hashlib
    return hashlib.sha256(filename.encode() + data[:512]).hexdigest()[:16]


def _pending_report(job_id: str) -> ThreatReport:
    return ThreatReport(
        job_id=job_id, status="running",
        malware_type="", obfuscation_technique="",
        network_iocs=NetworkIOCs(), file_iocs=FileIOCs(),
        risk_level="medium", affected_systems=[], gemini_summary="",
    )


def _error_report(job_id: str, error: str) -> ThreatReport:
    return ThreatReport(
        job_id=job_id, status="failed",
        malware_type="analysis failed", obfuscation_technique="",
        behavior=[f"error: {error}"],
        network_iocs=NetworkIOCs(), file_iocs=FileIOCs(),
        risk_level="high", affected_systems=[], gemini_summary=error,
    )


def _iocs_from_report(report: ThreatReport) -> IOCReport:
    return IOCReport(
        ips=report.network_iocs.ips,
        domains=report.network_iocs.domains,
        file_hashes={"sha256": report.file_iocs.sha256, "md5": report.file_iocs.md5},
        file_paths=report.file_iocs.paths,
        ports=report.network_iocs.ports,
        registry_keys=report.registry_iocs,
        urls=report.network_iocs.urls,
    )
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_analyzer.py -v
```

Expected: all 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add sandbox/analyzer.py tests/sandbox/test_analyzer.py
git commit -m "feat(sandbox): analysis orchestrator — merges static + dynamic results"
```

---

## Task 9: FastAPI sandbox service (Hephaestus)

**Files:**
- Create: `sandbox/main.py`
- Create: `tests/sandbox/test_main.py`

This is the moment Andres can start calling the API.

- [x] **Step 1: Write failing tests**

```python
# tests/sandbox/test_main.py
from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sandbox.models import ThreatReport, IOCReport, NetworkIOCs, FileIOCs


@pytest.fixture()
def client() -> TestClient:
    from sandbox.main import app
    return TestClient(app)


@pytest.fixture()
def sample_b64() -> str:
    return base64.b64encode(b"var x = WScript.Run('cmd');").decode()


def test_health(client: TestClient) -> None:
    resp = client.get("/sandbox/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")


def test_analyze_returns_job_id(client: TestClient, sample_b64: str) -> None:
    fake_job_id = "abc123"
    with patch("sandbox.main._analyzer.submit", new_callable=AsyncMock, return_value=fake_job_id):
        resp = client.post("/sandbox/analyze", json={
            "job_id": "caller-id",
            "file_content_b64": sample_b64,
            "filename": "test.js",
            "analysis_type": "static",
        })
    assert resp.status_code == 200
    assert resp.json()["job_id"] == fake_job_id


def test_get_report_not_found(client: TestClient) -> None:
    with patch("sandbox.main._analyzer.get_report", return_value=None):
        resp = client.get("/sandbox/report/nonexistent")
    assert resp.status_code == 404


def test_get_report_found(client: TestClient) -> None:
    fake = ThreatReport(
        job_id="abc123", status="complete",
        malware_type="dropper", obfuscation_technique="_0x",
        network_iocs=NetworkIOCs(ips=["1.2.3.4"]),
        file_iocs=FileIOCs(sha256="a"*64, md5="b"*32),
        risk_level="critical", affected_systems=["Windows"],
        gemini_summary="bad stuff",
    )
    with patch("sandbox.main._analyzer.get_report", return_value=fake):
        resp = client.get("/sandbox/report/abc123")
    assert resp.status_code == 200
    assert resp.json()["malware_type"] == "dropper"


def test_get_iocs_found(client: TestClient) -> None:
    fake = IOCReport(ips=["1.2.3.4"], domains=["evil.com"])
    with patch("sandbox.main._analyzer.get_iocs", return_value=fake):
        resp = client.get("/sandbox/iocs/abc123")
    assert resp.status_code == 200
    assert "1.2.3.4" in resp.json()["ips"]
```

- [x] **Step 2: Verify failures**

```bash
uv run pytest tests/sandbox/test_main.py -v
```

- [x] **Step 3: Implement `sandbox/main.py`**

```python
"""Hephaestus — FastAPI sandbox service."""
from __future__ import annotations

import logging

import docker
import docker.errors
from fastapi import FastAPI, HTTPException

from sandbox.analyzer import Analyzer
from sandbox.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    IOCReport,
    ThreatReport,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("hephaestus")

app = FastAPI(title="Hephaestus", description="Pantheon malware sandbox service", version="0.1.0")

_analyzer = Analyzer()


@app.get("/sandbox/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        client = docker.from_env()
        client.ping()
        docker_ok = True
    except Exception:
        docker_ok = False
    return HealthResponse(status="ok" if docker_ok else "degraded", docker_available=docker_ok)


@app.post("/sandbox/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    job_id = await _analyzer.submit(
        request.file_content_b64,
        request.filename,
        request.analysis_type,
    )
    return AnalyzeResponse(job_id=job_id, status="queued")


@app.get("/sandbox/report/{job_id}", response_model=ThreatReport)
def get_report(job_id: str) -> ThreatReport:
    report = _analyzer.get_report(job_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return report


@app.get("/sandbox/iocs/{job_id}", response_model=IOCReport)
def get_iocs(job_id: str) -> IOCReport:
    iocs = _analyzer.get_iocs(job_id)
    if iocs is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found or still running")
    return iocs
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/sandbox/test_main.py -v
```

Expected: all 5 tests pass.

- [x] **Step 5: Run the service locally to verify it starts**

```bash
uv run uvicorn sandbox.main:app --port 9000 --reload
```

In a second terminal:
```bash
curl http://localhost:9000/sandbox/health
```

Expected: `{"status":"ok","docker_available":true,"version":"0.1.0"}` (or degraded if Docker isn't running)

- [x] **Step 6: Commit**

```bash
git add sandbox/main.py tests/sandbox/test_main.py
git commit -m "feat(sandbox): Hephaestus FastAPI service — analyze, report, iocs endpoints"
```

**At this point Andres can start building against the API. Share the commit hash.**

---

## Task 10: Athena triage agent

**Files:**
- Create: `agents/athena.py`
- Create: `tests/agents/test_athena.py`

- [x] **Step 1: Write failing tests**

```python
# tests/agents/test_athena.py
from __future__ import annotations

from agents.athena import classify_threat, create_incident_ticket, ThreatClassification


def test_classify_malware_as_critical() -> None:
    result = classify_threat("suspicious process connecting to C2 server via reverse shell")
    assert result.severity == "critical"
    assert result.category == "security/malware"


def test_classify_infrastructure() -> None:
    result = classify_threat("production database is down, OOM killer running")
    assert result.severity in ("critical", "high")
    assert result.category == "infrastructure"


def test_classify_generic_as_medium() -> None:
    result = classify_threat("user cannot log in")
    assert result.severity in ("medium", "low")


def test_create_ticket_returns_id() -> None:
    ticket = create_incident_ticket(
        title="Malware detected on prod-db-01",
        severity="critical",
        category="security/malware",
        description="Reverse shell trojan found",
    )
    assert ticket.id.startswith("INC-")
    assert ticket.status == "open"
    assert ticket.severity == "critical"
```

- [x] **Step 2: Verify failures**

```bash
uv run pytest tests/agents/test_athena.py -v
```

- [x] **Step 3: Implement `agents/athena.py`**

```python
"""Athena — triage agent. Classifies threats and opens incident tickets."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone

from google.adk.agents import Agent

_MALWARE_SIGNALS = [
    "malware", "trojan", "ransomware", "reverse shell", "backdoor",
    "c2", "command and control", "exfiltration", "suspicious process",
    "payload", "dropper", "keylogger",
]
_CRITICAL_SIGNALS = [
    "production", "prod", "database", "customer data", "payment",
    "outage", "down", "unresponsive", "breach", "data leak",
]
_INFRA_SIGNALS = [
    "cpu", "memory", "disk", "latency", "timeout", "oom",
    "crash", "restart", "deployment", "rollback",
]

_ticket_counter = 1001


@dataclass
class ThreatClassification:
    severity: str
    category: str
    requires_escalation: bool


@dataclass
class IncidentTicket:
    id: str
    title: str
    severity: str
    category: str
    status: str
    created_at: str


def classify_threat(description: str) -> ThreatClassification:
    """Classify severity and category from a plain-language incident description."""
    lower = description.lower()
    category = "general"
    severity = "medium"

    if any(s in lower for s in _MALWARE_SIGNALS):
        category = "security/malware"
        severity = "critical"
    elif any(s in lower for s in _INFRA_SIGNALS):
        category = "infrastructure"
        severity = "high"

    if any(s in lower for s in _CRITICAL_SIGNALS):
        severity = "critical"

    return ThreatClassification(
        severity=severity,
        category=category,
        requires_escalation=severity == "critical",
    )


def create_incident_ticket(
    title: str,
    severity: str,
    category: str,
    description: str,
) -> IncidentTicket:
    """Create and store an incident ticket."""
    global _ticket_counter
    ticket = IncidentTicket(
        id=f"INC-{_ticket_counter}",
        title=title,
        severity=severity,
        category=category,
        status="open",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _ticket_counter += 1
    return ticket


# --- ADK agent definition ---------------------------------------------------

athena = Agent(
    name="athena",
    model="gemini-2.0-flash",
    instruction="""You are Athena, the triage specialist in the Pantheon incident response system.

YOUR JOB:
1. Call classify_threat with the description of the incident
2. Call create_incident_ticket to open a tracking record
3. Report severity and category in one sentence
4. Transfer to hades for malware analysis

RULES:
- Be direct and decisive — one sentence per action
- Always create a ticket before transferring
- If severity is critical, say "CRITICAL" explicitly
""",
    description="Triages incidents — classifies severity and category, opens an incident ticket.",
    tools=[classify_threat, create_incident_ticket],
)
```

- [x] **Step 4: Run tests**

```bash
uv run pytest tests/agents/test_athena.py -v
```

Expected: all 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add agents/athena.py tests/agents/test_athena.py
git commit -m "feat(agents): Athena triage agent — classify threat + create ticket"
```

---

## Task 11: Zeus root orchestrator

**Files:**
- Create: `agents/zeus.py`

No unit tests for Zeus — it requires the full ADK runtime and depends on Andres's agents being present. Integration tested at run time.

- [x] **Step 1: Create `agents/zeus.py`**

```python
"""Zeus — root ADK orchestrator for Pantheon."""
from __future__ import annotations

from google.adk.agents import Agent
from agents.athena import athena

# NOTE: hades, apollo, ares are imported here once Andres's agents are ready.
# Until then, Zeus routes everything through Athena.
# When Andres pushes his agents:
#   from agents.hades import hades
#   from agents.apollo import apollo
#   from agents.ares import ares
# and add them to sub_agents below.

zeus = Agent(
    name="zeus",
    model="gemini-2.0-flash",
    instruction="""You are Zeus, the orchestrator of Pantheon — an AI-driven malware analysis system.

A security analyst is communicating with you via Telegram, using voice or text.

YOUR TEAM:
- athena: First contact for any new incident or sample. Classifies severity and opens a ticket.
- hades: Malware analysis. Calls the sandbox, interprets behavioral results.
- apollo: IOC extraction and threat intelligence report.
- ares: Containment plan, remediation steps, future prevention hardening.

WORKFLOW for a new malware sample:
1. Analyst submits sample → transfer to athena
2. Athena classifies → transfers to hades
3. Hades analyzes → transfers to apollo
4. Apollo extracts IOCs → transfers to ares
5. Ares generates response plan → returns to you
6. You compile the final response for the analyst

COMMUNICATION:
- The analyst is on Telegram. Responses will be read aloud via ElevenLabs.
- Be calm and authoritative. No markdown. No bullet points in verbal responses.
- Maximum 3 sentences before taking action.
- If the analyst says "handle it" or "analyze it" — act immediately, no questions.

FIRST RESPONSE to a new sample:
"Copy. Routing to Athena for triage."
Then immediately transfer to athena.
""",
    description="Root orchestrator — receives analyst requests and coordinates the Pantheon agent pipeline.",
    sub_agents=[athena],  # add hades, apollo, ares when Andres pushes
)
```

- [x] **Step 2: Verify import works**

```bash
uv run python -c "from agents.zeus import zeus; print(zeus.name)"
```

Expected: `zeus`

- [x] **Step 3: Commit**

```bash
git add agents/zeus.py
git commit -m "feat(agents): Zeus root orchestrator — routes to Athena (Andres agents wired in next)"
```

---

## Task 12: Artemis sentinel daemon

**Files:**
- Create: `agents/artemis.py`

- [x] **Step 1: Create `agents/artemis.py`**

```python
"""Artemis — idle sentinel daemon. Watches for new malware samples and auto-triggers analysis."""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

logger = logging.getLogger("artemis")

_WATCH_DIR = Path(os.getenv("SAMPLES_DIR", "/tmp/samples"))
_POLL_INTERVAL = 5.0  # seconds


class Artemis:
    """
    File-watcher daemon. Polls SAMPLES_DIR for new files.
    When a new file appears, triggers the Zeus pipeline and notifies via Telegram.

    Usage:
        artemis = Artemis(on_new_sample=handler)
        await artemis.run()
    """

    def __init__(
        self,
        on_new_sample: "Callable[[Path], Coroutine[Any, Any, None]]",  # type: ignore[type-arg]
        watch_dir: Path = _WATCH_DIR,
        poll_interval: float = _POLL_INTERVAL,
    ) -> None:
        from collections.abc import Callable, Coroutine
        from typing import Any
        self._on_new_sample = on_new_sample
        self._watch_dir = watch_dir
        self._poll_interval = poll_interval
        self._seen: set[Path] = set()

    async def run(self) -> None:
        """Run forever — poll for new files and trigger the handler."""
        self._watch_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Artemis watching %s every %.1fs", self._watch_dir, self._poll_interval)

        # Seed seen set with existing files (don't re-analyze on restart)
        self._seen = set(self._watch_dir.rglob("*"))

        while True:
            await asyncio.sleep(self._poll_interval)
            try:
                current = set(self._watch_dir.rglob("*"))
                new_files = current - self._seen
                for path in sorted(new_files):
                    if path.is_file():
                        logger.info("Artemis: new sample detected: %s", path)
                        try:
                            await self._on_new_sample(path)
                        except Exception as exc:
                            logger.error("Handler failed for %s: %s", path, exc)
                self._seen = current
            except Exception as exc:
                logger.error("Artemis poll error: %s", exc)
```

- [x] **Step 2: Verify import**

```bash
uv run python -c "from agents.artemis import Artemis; print('ok')"
```

Expected: `ok`

- [x] **Step 3: Commit**

```bash
git add agents/artemis.py
git commit -m "feat(agents): Artemis file-watcher sentinel daemon"
```

---

## Task 13: Docker Compose and Dockerfiles

**Files:**
- Create: `infra/docker-compose.yml`
- Create: `infra/Dockerfile.sandbox`
- Create: `infra/Dockerfile.agents`
- Create: `infra/Dockerfile.gateway`
- Create: `infra/nginx.conf`
- Create: `infra/deploy.sh`

- [x] **Step 1: Create `infra/Dockerfile.sandbox`**

```dockerfile
FROM python:3.12-slim

# Docker CLI needed to spawn analysis containers
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml .
RUN uv sync --no-dev --frozen

COPY sandbox/ ./sandbox/

EXPOSE 9000
CMD ["uv", "run", "uvicorn", "sandbox.main:app", "--host", "0.0.0.0", "--port", "9000"]
```

- [x] **Step 2: Create `infra/Dockerfile.agents`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml .
RUN uv sync --no-dev --frozen

COPY agents/ ./agents/
COPY sandbox/models.py ./sandbox/models.py
COPY sandbox/__init__.py ./sandbox/__init__.py

EXPOSE 8001
CMD ["uv", "run", "uvicorn", "agents.server:app", "--host", "0.0.0.0", "--port", "8001"]
```

- [x] **Step 3: Create `infra/Dockerfile.gateway`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml .
RUN uv sync --no-dev --frozen

COPY gateway/ ./gateway/
COPY voice/ ./voice/
COPY agents/ ./agents/
COPY sandbox/models.py ./sandbox/models.py
COPY sandbox/__init__.py ./sandbox/__init__.py

EXPOSE 8000
CMD ["uv", "run", "python", "-m", "gateway.bot"]
```

- [x] **Step 4: Create `infra/docker-compose.yml`**

```yaml
services:
  sandbox:
    build:
      context: ..
      dockerfile: infra/Dockerfile.sandbox
    ports:
      - "9000:9000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - samples:/tmp/samples
    networks:
      - internal
    env_file: ../.env
    restart: unless-stopped

  agents:
    build:
      context: ..
      dockerfile: infra/Dockerfile.agents
    ports:
      - "8001:8001"
    depends_on:
      - sandbox
    networks:
      - internal
    env_file: ../.env
    restart: unless-stopped

  gateway:
    build:
      context: ..
      dockerfile: infra/Dockerfile.gateway
    ports:
      - "8000:8000"
    depends_on:
      - agents
      - sandbox
    volumes:
      - samples:/tmp/samples
    networks:
      - internal
      - public
    env_file: ../.env
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - gateway
    networks:
      - public
    restart: unless-stopped

volumes:
  samples:

networks:
  internal:
    driver: bridge
  public:
    driver: bridge
```

- [x] **Step 5: Create `infra/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location /telegram {
        proxy_pass http://gateway:8000/telegram;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    location /health {
        proxy_pass http://gateway:8000/health;
    }
}
```

- [x] **Step 6: Commit**

```bash
git add infra/
git commit -m "feat(infra): Docker Compose, Dockerfiles, nginx config"
```

---

## Task 14: Full test suite pass

- [ ] **Step 1: Run all tests**

```bash
uv run pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 2: Type check**

```bash
uv run mypy sandbox/ agents/ --strict
```

Fix any errors before proceeding.

- [ ] **Step 3: Lint**

```bash
uv run ruff check sandbox/ agents/
```

Fix any errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: all tests passing, mypy clean"
git push origin master
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| POST /sandbox/analyze | Task 9 |
| GET /sandbox/report/{job_id} | Task 9 |
| GET /sandbox/iocs/{job_id} | Task 9 |
| GET /sandbox/health | Task 9 |
| Static: hash, string extraction, deobfuscation | Tasks 2, 3 |
| Static: Gemini analysis | Task 4 |
| Dynamic: Docker with all security flags | Task 6 |
| harness.js mocks WScript/ActiveX/Shell | Task 5 |
| Dynamic output parsing | Task 7 |
| Analyzer orchestrates both pipelines | Task 8 |
| Zeus root orchestrator | Task 11 |
| Athena triage + tools | Task 10 |
| Artemis file-watcher daemon | Task 12 |
| Docker Compose + Dockerfiles | Task 13 |

No gaps found.

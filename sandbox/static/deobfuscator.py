"""JS deobfuscation utilities — extracts strings from _0x-obfuscated source."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

# Matches: var _0xABCD = ['str1', 'str2', ...] (single or double quoted)
# NOTE: [^\'"]*  matches unescaped content only. Strings containing escaped
# quotes (e.g. 'it\'s') cause the outer regex to fail and return [].
# The fallback in extract_string_array() handles those via manual extraction.
_STRING_ARRAY_RE = re.compile(
    r'var\s+_0x[a-fA-F0-9]+\s*=\s*(\[(?:[\'"][^\'"]*[\'"](?:,\s*[\'"][^\'"]*[\'"])*)\])'
)

# Matches printable ASCII runs of min_length+ characters
_PRINTABLE_TEMPLATE = r'[ -~]{%d,}'


@dataclass
class DeobfuscationResult:
    string_array: list[str] = field(default_factory=list)
    readable_strings: list[str] = field(default_factory=list)
    summary_text: str = ""

    @classmethod
    def from_source(cls, source_text: str, source_bytes: bytes) -> DeobfuscationResult:
        """Build a compact analysis summary from obfuscated JS source."""
        string_array = extract_string_array(source_text)
        readable = extract_readable_strings(source_bytes, min_length=8)

        # Show up to 200 array strings; second section is byte-scan results
        # that are NOT already shown above, to avoid duplication in Gemini context.
        shown_array = string_array[:200]
        shown_set = set(shown_array)
        extra = [
            s for s in readable
            if s not in shown_set and len(s) > 4 and not s.startswith("0x")
        ]
        deduped_extra = list(dict.fromkeys(extra))[:300]

        summary = "\n".join([
            "=== Extracted string array ===",
            "\n".join(shown_array),
            "",
            "=== Additional readable strings (byte scan, not in string array) ===",
            "\n".join(deduped_extra),
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
    # Normalize to double quotes for JSON parsing
    normalized = re.sub(
        r"'([^']*)'",
        lambda m: '"' + m.group(1).replace('"', '\\"') + '"',
        raw,
    )
    try:
        result: list[str] = json.loads(normalized)
        return result
    except (json.JSONDecodeError, ValueError):
        # Fallback: manual extraction
        return re.findall(r"['\"]([^'\"]{2,})['\"]", raw)


def extract_readable_strings(data: bytes, min_length: int = 8) -> list[str]:
    """Extract printable ASCII strings from raw bytes (equivalent to Unix `strings`)."""
    text = data.decode("ascii", errors="replace")
    pattern = _PRINTABLE_TEMPLATE % min_length
    matches = re.findall(pattern, text)
    return list(dict.fromkeys(matches))

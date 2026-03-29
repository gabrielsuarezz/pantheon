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
    source_text = "var _0x1a2b=['WScript.Shell','http://evil.com'];"
    # Bytes that contain a distinct printable string not in the string array,
    # plus non-printable bytes separating them (realistic for binary analysis).
    source_bytes = b"\xff\xfeCreateObject\x00drop_payload.exe\x00\xde\xad\xbe\xef"
    result = DeobfuscationResult.from_source(source_text, source_bytes)
    assert len(result.string_array) == 2
    assert "=== Extracted string array ===" in result.summary_text
    second_header = "=== Additional readable strings (byte scan, not in string array) ==="
    assert second_header in result.summary_text
    # String array items appear in the first section
    assert "WScript.Shell" in result.summary_text
    assert "http://evil.com" in result.summary_text
    # Byte-scan-only string appears in the second section
    second_section = result.summary_text[result.summary_text.index(second_header):]
    assert "CreateObject" in second_section
    # String array items must not be duplicated in the second section (dedup guard)
    assert "WScript.Shell" not in second_section
    assert "http://evil.com" not in second_section

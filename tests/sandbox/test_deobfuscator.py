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

"""Shared pytest fixtures for Pantheon tests."""
from __future__ import annotations

import base64

import pytest


@pytest.fixture()
def sample_js_bytes() -> bytes:
    """Minimal obfuscated JS bytes for testing — NOT the real malware."""
    return b"var _0x1a2b=['hello','world'];function _0x3c4d(i){return _0x1a2b[i];}console.log(_0x3c4d(0));"


@pytest.fixture()
def sample_js_b64(sample_js_bytes: bytes) -> str:
    """Base64-encoded version of sample_js_bytes for use in API request bodies."""
    return base64.b64encode(sample_js_bytes).decode()

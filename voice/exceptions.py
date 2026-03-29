"""Voice module exceptions."""

from __future__ import annotations


class TranscriptionError(RuntimeError):
    """Raised when speech-to-text fails after all fallback attempts."""


class SpeechError(RuntimeError):
    """Raised when text-to-speech synthesis fails."""

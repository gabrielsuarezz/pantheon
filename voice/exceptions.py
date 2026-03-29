from __future__ import annotations


class TranscriptionError(RuntimeError):
    """Raised when speech-to-text fails across all providers."""


class SpeechError(RuntimeError):
    """Raised when text-to-speech fails."""

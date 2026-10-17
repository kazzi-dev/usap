from __future__ import annotations

from dataclasses import dataclass

# Whisper sometimes reports languages by name ("english"); we use ISO codes.
_LANGUAGE_NAMES = {
    "english": "en",
    "tagalog": "tl",
    "filipino": "tl",
    "japanese": "ja",
    "cebuano": "ceb",
}


def normalize_language(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip().lower()
    return _LANGUAGE_NAMES.get(value, value)


@dataclass(frozen=True)
class Transcription:
    text: str
    language: str | None
    engine: str  # "groq" or "local"
    # Whisper's own estimate that the audio contained no speech (0..1), if available.
    no_speech_prob: float | None = None


class SttUnavailable(Exception):
    """The engine can't handle this request right now (rate limit, outage, busy)."""

    def __init__(self, reason: str, retry_after: float | None = None) -> None:
        super().__init__(reason)
        self.retry_after = retry_after

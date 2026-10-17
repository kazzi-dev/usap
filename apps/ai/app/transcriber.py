"""Picks the speech-to-text engine for each segment: Groq first, local fallback."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass

from .audio import decode_wav
from .rate_limiter import GroqRateLimiter
from .stt.base import SttUnavailable, Transcription
from .stt.groq import GroqStt
from .stt.local import LocalWhisperStt

log = logging.getLogger("usap.transcriber")

# Whisper was trained on lots of YouTube subtitles, so on noise or near-silence
# it sometimes "hears" these. Nobody says them during a call.
_HALLUCINATIONS = {
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "subtitles by the amaraorg community",
    "ご視聴ありがとうございました",
    "チャンネル登録をお願いします",
}
_NO_SPEECH_THRESHOLD = 0.7


def _normalize(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def is_probably_hallucination(t: Transcription) -> bool:
    if not t.text:
        return True
    if t.no_speech_prob is not None and t.no_speech_prob > _NO_SPEECH_THRESHOLD:
        return True
    return _normalize(t.text) in _HALLUCINATIONS


@dataclass(frozen=True)
class SegmentResult:
    text: str  # "" if nothing worth showing was said
    language: str | None
    engine: str
    audio_seconds: float
    processing_ms: int


class Transcriber:
    def __init__(self, groq: GroqStt | None, local: LocalWhisperStt, limiter: GroqRateLimiter) -> None:
        self.groq = groq
        self.local = local
        self.limiter = limiter

    async def transcribe(self, wav: bytes, segment_id: str, language: str | None = None) -> SegmentResult:
        audio = decode_wav(wav)  # raises InvalidAudio
        started = time.perf_counter()

        result: Transcription | None = None
        fallback_reason = ""
        if self.groq is None:
            fallback_reason = "no GROQ_API_KEY"
        elif not self.limiter.try_acquire(audio.seconds):
            fallback_reason = "free-tier limit reached"
        else:
            try:
                result = await self.groq.transcribe(wav, language)
            except SttUnavailable as err:
                fallback_reason = str(err)
                if err.retry_after:
                    self.limiter.cool_down(err.retry_after)

        if result is None:
            result = await self.local.transcribe(audio.samples, language)  # may raise SttUnavailable

        processing_ms = int((time.perf_counter() - started) * 1000)
        dropped = is_probably_hallucination(result)
        log.info(
            "segment=%s engine=%s%s audio=%.1fs took=%dms lang=%s%s text=%r",
            segment_id,
            result.engine,
            f" (fallback: {fallback_reason})" if fallback_reason else "",
            audio.seconds,
            processing_ms,
            result.language,
            " DROPPED" if dropped else "",
            result.text[:80],
        )
        return SegmentResult(
            text="" if dropped else result.text,
            language=result.language,
            engine=result.engine,
            audio_seconds=round(audio.seconds, 2),
            processing_ms=processing_ms,
        )

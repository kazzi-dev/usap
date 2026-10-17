"""Decoding the WAV segments the browser sends (16 kHz, mono, 16-bit PCM)."""

from __future__ import annotations

import io
import wave
from dataclasses import dataclass

import numpy as np

SAMPLE_RATE = 16_000
MAX_SECONDS = 30.0


class InvalidAudio(ValueError):
    pass


@dataclass(frozen=True)
class DecodedAudio:
    samples: np.ndarray  # float32 in [-1, 1], what Whisper expects
    seconds: float


def decode_wav(data: bytes) -> DecodedAudio:
    try:
        with wave.open(io.BytesIO(data), "rb") as wav:
            if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != SAMPLE_RATE:
                raise InvalidAudio("expected 16 kHz mono 16-bit WAV")
            frames = wav.readframes(wav.getnframes())
    except (wave.Error, EOFError) as err:
        raise InvalidAudio(f"not a valid WAV file: {err}") from err

    pcm = np.frombuffer(frames, dtype="<i2")
    seconds = len(pcm) / SAMPLE_RATE
    if seconds == 0:
        raise InvalidAudio("empty audio")
    if seconds > MAX_SECONDS:
        raise InvalidAudio(f"segment too long ({seconds:.1f}s > {MAX_SECONDS:.0f}s)")
    return DecodedAudio(samples=pcm.astype(np.float32) / 32768.0, seconds=seconds)

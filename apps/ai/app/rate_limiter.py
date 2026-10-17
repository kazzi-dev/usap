"""Token-bucket rate limiting for Groq's free tier.

A token bucket is a jar that holds at most `capacity` tokens and refills at a
steady rate. Each request takes tokens out; if the jar doesn't have enough,
the request is refused (here: it goes to the local model instead).

Why a bucket and not "count requests per minute"? A fixed per-minute counter
allows bursts at the edges (20 requests at 12:00:59 + 20 at 12:01:00 = 40 in
two seconds). The bucket refills continuously, so the long-run rate can never
exceed the limit, while short bursts up to `capacity` are still allowed.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass


class TokenBucket:
    def __init__(
        self,
        capacity: float,
        refill_per_second: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if capacity <= 0 or refill_per_second <= 0:
            raise ValueError("capacity and refill_per_second must be positive")
        self.capacity = capacity
        self.refill_per_second = refill_per_second
        self._clock = clock
        self._tokens = capacity  # start full
        self._updated_at = clock()

    def _refill(self) -> None:
        now = self._clock()
        elapsed = max(0.0, now - self._updated_at)
        self._tokens = min(self.capacity, self._tokens + elapsed * self.refill_per_second)
        self._updated_at = now

    @property
    def available(self) -> float:
        self._refill()
        return self._tokens

    def can_afford(self, cost: float = 1.0) -> bool:
        return self.available >= cost

    def consume(self, cost: float = 1.0) -> None:
        """Take tokens unconditionally (call can_afford first)."""
        self._refill()
        self._tokens -= cost

    def try_acquire(self, cost: float = 1.0) -> bool:
        if not self.can_afford(cost):
            return False
        self.consume(cost)
        return True


@dataclass(frozen=True)
class GroqLimits:
    requests_per_minute: int = 20
    requests_per_day: int = 2_000
    audio_seconds_per_hour: int = 7_200
    audio_seconds_per_day: int = 28_800
    # Groq bills every transcription request as at least this many seconds of audio.
    min_billed_seconds: float = 10.0


class GroqRateLimiter:
    """All of Groq's speech-to-text limits combined.

    A request is allowed only if EVERY bucket can afford it; then all of them
    are charged together (so a refusal never half-spends tokens). Groq can
    still answer 429 (e.g. after a restart, since these buckets live in memory),
    so `cool_down` lets the caller pause Groq for the time Groq asked for.
    """

    def __init__(self, limits: GroqLimits, clock: Callable[[], float] = time.monotonic) -> None:
        self.limits = limits
        self._clock = clock
        self._lock = threading.Lock()
        self._cooldown_until = 0.0
        self.requests_minute = TokenBucket(limits.requests_per_minute, limits.requests_per_minute / 60, clock)
        self.requests_day = TokenBucket(limits.requests_per_day, limits.requests_per_day / 86_400, clock)
        self.audio_hour = TokenBucket(limits.audio_seconds_per_hour, limits.audio_seconds_per_hour / 3_600, clock)
        self.audio_day = TokenBucket(limits.audio_seconds_per_day, limits.audio_seconds_per_day / 86_400, clock)

    def billed_seconds(self, audio_seconds: float) -> float:
        return max(audio_seconds, self.limits.min_billed_seconds)

    def try_acquire(self, audio_seconds: float) -> bool:
        billed = self.billed_seconds(audio_seconds)
        charges = (
            (self.requests_minute, 1.0),
            (self.requests_day, 1.0),
            (self.audio_hour, billed),
            (self.audio_day, billed),
        )
        with self._lock:
            if self._clock() < self._cooldown_until:
                return False
            if not all(bucket.can_afford(cost) for bucket, cost in charges):
                return False
            for bucket, cost in charges:
                bucket.consume(cost)
            return True

    def cool_down(self, seconds: float) -> None:
        """Stop using Groq for `seconds` (after a 429 Too Many Requests)."""
        with self._lock:
            self._cooldown_until = max(self._cooldown_until, self._clock() + seconds)

    def snapshot(self) -> dict[str, float]:
        """Remaining capacity, for the /health endpoint and logs."""
        with self._lock:
            return {
                "requests_this_minute": round(self.requests_minute.available, 1),
                "requests_today": round(self.requests_day.available, 1),
                "audio_seconds_this_hour": round(self.audio_hour.available, 1),
                "audio_seconds_today": round(self.audio_day.available, 1),
                "cooldown_seconds": round(max(0.0, self._cooldown_until - self._clock()), 1),
            }

from app.rate_limiter import GroqLimits, GroqRateLimiter, TokenBucket


class FakeClock:
    """Lets tests move time forward instantly instead of sleeping."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_bucket_allows_burst_up_to_capacity_then_refuses():
    clock = FakeClock()
    bucket = TokenBucket(capacity=3, refill_per_second=1, clock=clock)
    assert [bucket.try_acquire() for _ in range(4)] == [True, True, True, False]


def test_bucket_refills_over_time_but_never_above_capacity():
    clock = FakeClock()
    bucket = TokenBucket(capacity=2, refill_per_second=0.5, clock=clock)
    bucket.try_acquire()
    bucket.try_acquire()
    clock.now = 2.0  # 2s * 0.5/s = 1 token back
    assert bucket.try_acquire()
    assert not bucket.try_acquire()
    clock.now = 1_000.0
    assert bucket.available == 2


def test_groq_limiter_enforces_requests_per_minute():
    clock = FakeClock()
    limiter = GroqRateLimiter(GroqLimits(requests_per_minute=20), clock=clock)
    allowed = sum(limiter.try_acquire(audio_seconds=2) for _ in range(25))
    assert allowed == 20
    clock.now = 3.0  # 20/min = one request back every 3 seconds
    assert limiter.try_acquire(audio_seconds=2)
    assert not limiter.try_acquire(audio_seconds=2)


def test_groq_limiter_charges_minimum_billed_audio():
    clock = FakeClock()
    limits = GroqLimits(requests_per_minute=1_000, audio_seconds_per_hour=30, min_billed_seconds=10)
    limiter = GroqRateLimiter(limits, clock=clock)
    # Three 1-second segments are billed as 10s each, filling the 30s hourly budget.
    assert [limiter.try_acquire(1) for _ in range(4)] == [True, True, True, False]


def test_refusal_does_not_spend_tokens_from_other_buckets():
    clock = FakeClock()
    limits = GroqLimits(requests_per_minute=10, audio_seconds_per_hour=15, min_billed_seconds=10)
    limiter = GroqRateLimiter(limits, clock=clock)
    assert limiter.try_acquire(10)
    assert not limiter.try_acquire(10)  # audio budget too low
    assert limiter.requests_minute.available == 9  # the refused call took nothing


def test_cooldown_after_429_blocks_until_it_expires():
    clock = FakeClock()
    limiter = GroqRateLimiter(GroqLimits(), clock=clock)
    limiter.cool_down(30)
    assert not limiter.try_acquire(1)
    clock.now = 31.0
    assert limiter.try_acquire(1)

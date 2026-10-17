"""Settings for the AI service, read from environment variables / the repo-root .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .rate_limiter import GroqLimits

AI_ROOT = Path(__file__).resolve().parents[1]  # apps/ai
REPO_ROOT = AI_ROOT.parents[1]
# Real environment variables win over .env (that's what production wants).
load_dotenv(REPO_ROOT / ".env", override=False)


def _env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, "").strip()
    return value or default


def _int(name: str, default: int) -> int:
    return int(_env(name, str(default)))  # type: ignore[arg-type]


def _bool(name: str, default: bool) -> bool:
    return (_env(name, str(default)) or "").lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    port: int
    # Shared secret the signal server sends; empty = no check (local dev).
    internal_token: str | None

    groq_api_key: str | None
    groq_stt_model: str
    groq_limits: GroqLimits

    local_model: str  # faster-whisper size: tiny, base, small, medium, large-v3-turbo...
    local_device: str  # "cpu" or "cuda"
    local_compute_type: str  # "int8" is fastest on CPU
    local_preload: bool  # load the model at startup so the first fallback isn't slow
    local_max_queue: int  # refuse new work if this many segments are already waiting

    nllb_model_dir: Path  # CTranslate2 model created by prepare_models.py
    nllb_device: str
    nllb_compute_type: str
    nllb_beam_size: int  # 1 = fastest; higher = slightly better, slower
    nllb_preload: bool


def load_settings() -> Settings:
    return Settings(
        port=_int("AI_PORT", 8000),
        internal_token=_env("AI_SERVICE_TOKEN"),
        groq_api_key=_env("GROQ_API_KEY"),
        groq_stt_model=_env("GROQ_STT_MODEL", "whisper-large-v3-turbo"),  # type: ignore[arg-type]
        groq_limits=GroqLimits(
            requests_per_minute=_int("GROQ_STT_RPM", 20),
            requests_per_day=_int("GROQ_STT_RPD", 2_000),
            audio_seconds_per_hour=_int("GROQ_STT_AUDIO_SECONDS_PER_HOUR", 7_200),
            audio_seconds_per_day=_int("GROQ_STT_AUDIO_SECONDS_PER_DAY", 28_800),
        ),
        local_model=_env("LOCAL_WHISPER_MODEL", "small"),  # type: ignore[arg-type]
        local_device=_env("LOCAL_WHISPER_DEVICE", "cpu"),  # type: ignore[arg-type]
        local_compute_type=_env("LOCAL_WHISPER_COMPUTE_TYPE", "int8"),  # type: ignore[arg-type]
        local_preload=_bool("LOCAL_WHISPER_PRELOAD", True),
        local_max_queue=_int("LOCAL_WHISPER_MAX_QUEUE", 4),
        nllb_model_dir=Path(_env("NLLB_MODEL_DIR", str(AI_ROOT / "models" / "nllb-200-distilled-600M-ct2-int8"))),  # type: ignore[arg-type]
        nllb_device=_env("NLLB_DEVICE", "cpu"),  # type: ignore[arg-type]
        nllb_compute_type=_env("NLLB_COMPUTE_TYPE", "int8"),  # type: ignore[arg-type]
        nllb_beam_size=_int("NLLB_BEAM_SIZE", 2),
        nllb_preload=_bool("NLLB_PRELOAD", True),
    )

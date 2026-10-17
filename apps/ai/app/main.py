"""Usap AI service: turns speech segments into subtitles.

Only the signal server talks to this service (it listens on 127.0.0.1), so
browsers never see the Groq key.

Run: npm run dev (from the repo root), or
     .venv/Scripts/python -m uvicorn app.main:app --port 8000   (inside apps/ai)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel

from .audio import InvalidAudio
from .config import load_settings
from .rate_limiter import GroqRateLimiter
from .stt.base import SttUnavailable
from .stt.groq import GroqStt
from .stt.local import LocalWhisperStt
from .transcriber import Transcriber

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("usap.ai")
# Third-party HTTP clients log every request at INFO; keep our logs readable.
for noisy in ("httpx", "httpx2", "huggingface_hub"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

settings = load_settings()
MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # ~60s of 16 kHz 16-bit audio; segments are far shorter


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = httpx.AsyncClient()
    groq = GroqStt(settings.groq_api_key, settings.groq_stt_model, client) if settings.groq_api_key else None
    local = LocalWhisperStt(
        settings.local_model, settings.local_device, settings.local_compute_type, settings.local_max_queue
    )
    if settings.local_preload:
        local.preload_in_background()
    if groq is None:
        log.warning("GROQ_API_KEY is not set: every segment will use the local model.")
    app.state.transcriber = Transcriber(groq, local, GroqRateLimiter(settings.groq_limits))
    yield
    local.shutdown()
    await client.aclose()


app = FastAPI(title="Usap AI service", lifespan=lifespan)


def require_internal_token(x_internal_token: Annotated[str | None, Header()] = None) -> None:
    if settings.internal_token and x_internal_token != settings.internal_token:
        raise HTTPException(status_code=401, detail="invalid internal token")


def get_transcriber(request: Request) -> Transcriber:
    return request.app.state.transcriber


class SubtitleOut(BaseModel):
    # camelCase on purpose: this JSON goes straight to the TypeScript side.
    segmentId: str
    speakerId: str
    originalText: str
    translatedText: str
    lang: str | None
    timestamp: int
    engine: str
    audioSeconds: float
    processingMs: int


@app.get("/health")
def health(transcriber: Annotated[Transcriber, Depends(get_transcriber)]) -> dict:
    return {
        "ok": True,
        "groq": {"configured": transcriber.groq is not None, **transcriber.limiter.snapshot()},
        "local": {"model": transcriber.local.model_size, "loaded": transcriber.local.loaded},
    }


@app.post("/segments", dependencies=[Depends(require_internal_token)])
async def process_segment(
    transcriber: Annotated[Transcriber, Depends(get_transcriber)],
    audio: Annotated[UploadFile, File(description="16 kHz mono 16-bit WAV")],
    segment_id: Annotated[str, Form()],
    speaker_id: Annotated[str, Form()],
    timestamp: Annotated[int, Form(description="When the speech started (ms since epoch)")],
    language: Annotated[str | None, Form(description="Speaker's language hint, e.g. 'en'")] = None,
) -> SubtitleOut:
    wav = await audio.read(MAX_UPLOAD_BYTES + 1)
    if len(wav) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="audio segment too large")
    try:
        result = await transcriber.transcribe(wav, segment_id, language)
    except InvalidAudio as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except SttUnavailable as err:
        log.warning("segment=%s could not be transcribed: %s", segment_id, err)
        raise HTTPException(status_code=503, detail=str(err)) from err

    return SubtitleOut(
        segmentId=segment_id,
        speakerId=speaker_id,
        originalText=result.text,
        translatedText=result.text,  # Stage 3 adds translation; for now it's the same text
        lang=result.language,
        timestamp=timestamp,
        engine=result.engine,
        audioSeconds=result.audio_seconds,
        processingMs=result.processing_ms,
    )

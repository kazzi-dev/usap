"""Usap AI service: turns speech segments into subtitles.

Only the signal server talks to this service (it listens on 127.0.0.1), so
browsers never see the Groq key.

Run: npm run dev (from the repo root), or
     .venv/Scripts/python -m uvicorn app.main:app --port 8000   (inside apps/ai)
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel

from .audio import InvalidAudio
from .config import load_settings
from .languages import LANGUAGES, Language, get_language
from .rate_limiter import GroqRateLimiter
from .stt.base import SttUnavailable
from .stt.groq import GroqStt
from .stt.local import LocalWhisperStt
from .summarizer import LlmRateLimiter, Summarizer, SummaryUnavailable, TranscriptLine
from .transcriber import Transcriber
from .translator import NllbTranslator

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
    translator = NllbTranslator(
        settings.nllb_model_dir, settings.nllb_device, settings.nllb_compute_type, settings.nllb_beam_size
    )
    if settings.local_preload:
        local.preload_in_background()
    if settings.nllb_preload:
        translator.preload_in_background()
    if groq is None:
        log.warning("GROQ_API_KEY is not set: every segment will use the local model.")
    app.state.transcriber = Transcriber(groq, local, GroqRateLimiter(settings.groq_limits))
    app.state.translator = translator
    app.state.summarizer = Summarizer(
        client,
        settings.groq_api_key,
        settings.groq_llm_model,
        LlmRateLimiter(settings.groq_llm_rpm, settings.groq_llm_rpd, settings.groq_llm_tpm),
        translator,
    )
    yield
    local.shutdown()
    translator.shutdown()
    await client.aclose()


app = FastAPI(title="Usap AI service", lifespan=lifespan)


def require_internal_token(x_internal_token: Annotated[str | None, Header()] = None) -> None:
    if settings.internal_token and x_internal_token != settings.internal_token:
        raise HTTPException(status_code=401, detail="invalid internal token")


def get_transcriber(request: Request) -> Transcriber:
    return request.app.state.transcriber


def get_translator(request: Request) -> NllbTranslator:
    return request.app.state.translator


def get_summarizer(request: Request) -> Summarizer:
    return request.app.state.summarizer


def parse_language(code: str | None, field: str) -> Language | None:
    if not code:
        return None
    language = get_language(code)
    if language is None:
        raise HTTPException(status_code=422, detail=f"{field}: unsupported language {code!r} (use one of {list(LANGUAGES)})")
    return language


async def translate_or_original(
    translator: NllbTranslator, text: str, source: Language | None, target: Language | None, segment_id: str
) -> tuple[str, int, bool]:
    """Translate if we can. Returns (text, milliseconds, whether it was translated).
    If translation fails, the original text is still better than nothing."""
    if not text or source is None or target is None or source.code == target.code:
        return text, 0, False
    started = time.perf_counter()
    try:
        translated = await translator.translate(text, source, target)
    except Exception as err:  # noqa: BLE001 - any failure falls back to showing the original
        log.warning("segment=%s translation %s->%s failed: %s", segment_id, source.code, target.code, err)
        return text, 0, False
    ms = int((time.perf_counter() - started) * 1000)
    log.info("segment=%s translated %s->%s in %dms: %r", segment_id, source.code, target.code, ms, translated[:80])
    return translated, ms, True


class SubtitleOut(BaseModel):
    # camelCase on purpose: this JSON goes straight to the TypeScript side.
    segmentId: str
    speakerId: str
    originalText: str
    translatedText: str
    lang: str | None  # language of originalText (the speaker's chosen language)
    targetLang: str | None  # language of translatedText (the listener's)
    timestamp: int
    engine: str
    audioSeconds: float
    sttMs: int
    translateMs: int


@app.get("/health")
def health(
    transcriber: Annotated[Transcriber, Depends(get_transcriber)],
    translator: Annotated[NllbTranslator, Depends(get_translator)],
) -> dict:
    return {
        "ok": True,
        "groq": {"configured": transcriber.groq is not None, **transcriber.limiter.snapshot()},
        "local": {"model": transcriber.local.model_size, "loaded": transcriber.local.loaded},
        "translation": {"available": translator.available, "loaded": translator.loaded},
    }


@app.post("/segments", dependencies=[Depends(require_internal_token)])
async def process_segment(
    transcriber: Annotated[Transcriber, Depends(get_transcriber)],
    translator: Annotated[NllbTranslator, Depends(get_translator)],
    audio: Annotated[UploadFile, File(description="16 kHz mono 16-bit WAV")],
    segment_id: Annotated[str, Form()],
    speaker_id: Annotated[str, Form()],
    timestamp: Annotated[int, Form(description="When the speech started (ms since epoch)")],
    language: Annotated[str | None, Form(description="Speaker's language: en, tl, ceb, ja")] = None,
    target_language: Annotated[str | None, Form(description="Listener's language")] = None,
) -> SubtitleOut:
    source = parse_language(language, "language")
    target = parse_language(target_language, "target_language")
    wav = await audio.read(MAX_UPLOAD_BYTES + 1)
    if len(wav) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="audio segment too large")
    try:
        result = await transcriber.transcribe(wav, segment_id, source)
    except InvalidAudio as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except SttUnavailable as err:
        log.warning("segment=%s could not be transcribed: %s", segment_id, err)
        raise HTTPException(status_code=503, detail=str(err)) from err

    translated, translate_ms, did_translate = await translate_or_original(translator, result.text, source, target, segment_id)
    return SubtitleOut(
        segmentId=segment_id,
        speakerId=speaker_id,
        originalText=result.text,
        translatedText=translated,
        # Trust the language the speaker picked over Whisper's guess (it calls Cebuano "Tagalog").
        lang=source.code if source else result.language,
        targetLang=target.code if did_translate and target else (source.code if source else None),
        timestamp=timestamp,
        engine=result.engine,
        audioSeconds=result.audio_seconds,
        sttMs=result.processing_ms,
        translateMs=translate_ms,
    )


class TranslateIn(BaseModel):
    text: str
    source: str
    target: str


class TranslateOut(BaseModel):
    text: str
    source: str
    target: str
    ms: int


@app.post("/translate", dependencies=[Depends(require_internal_token)])
async def translate_text(
    body: TranslateIn, translator: Annotated[NllbTranslator, Depends(get_translator)]
) -> TranslateOut:
    """Text-only translation. Handy for testing and for the transcript page later."""
    source = parse_language(body.source, "source")
    target = parse_language(body.target, "target")
    assert source and target
    if len(body.text) > 2_000:
        raise HTTPException(status_code=413, detail="text too long (max 2000 characters)")
    if not translator.available:
        raise HTTPException(status_code=503, detail="translation model not installed (npm run setup:models)")
    started = time.perf_counter()
    text = await translator.translate(body.text.strip(), source, target)
    return TranslateOut(text=text, source=source.code, target=target.code, ms=int((time.perf_counter() - started) * 1000))


class SummaryLineIn(BaseModel):
    speaker: str
    text: str
    lang: str | None = None


class SummaryIn(BaseModel):
    lines: list[SummaryLineIn]
    languages: list[str] = []  # summary is always in English, plus these


class SummaryOut(BaseModel):
    summaries: dict[str, str]
    model: str
    ms: int


@app.post("/summaries", dependencies=[Depends(require_internal_token)])
async def summarize_call(
    body: SummaryIn, summarizer: Annotated[Summarizer, Depends(get_summarizer)]
) -> SummaryOut:
    """After-call summary: transcript -> English summary (Groq LLM) -> each participant's language (NLLB)."""
    started = time.perf_counter()
    lines = [TranscriptLine(l.speaker, l.text.strip(), l.lang) for l in body.lines if l.text.strip()]
    try:
        summaries = await summarizer.summarize(lines, body.languages)
    except SummaryUnavailable as err:
        log.warning("summary unavailable: %s", err)
        raise HTTPException(status_code=503, detail=str(err)) from err
    ms = int((time.perf_counter() - started) * 1000)
    log.info("summary of %d lines in %dms (%s), languages=%s", len(lines), ms, summarizer.model, list(summaries))
    return SummaryOut(summaries=summaries, model=summarizer.model, ms=ms)

"""Speech-to-text with faster-whisper running on this machine (the free fallback)."""

from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from faster_whisper import WhisperModel

from .base import SttUnavailable, Transcription, normalize_language

log = logging.getLogger("usap.stt.local")


class LocalWhisperStt:
    name = "local"

    def __init__(self, model_size: str, device: str, compute_type: str, max_queue: int) -> None:
        self.model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._max_queue = max_queue
        self._model: WhisperModel | None = None
        self._load_lock = threading.Lock()
        # Whisper on CPU already uses all cores for one segment, so running two
        # at once only makes both slower. One worker thread = a simple queue.
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whisper")
        self._pending = 0

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _get_model(self) -> WhisperModel:
        with self._load_lock:
            if self._model is None:
                log.info("Loading faster-whisper '%s' (first run downloads it)...", self.model_size)
                self._model = WhisperModel(self.model_size, device=self._device, compute_type=self._compute_type)
                log.info("faster-whisper '%s' ready", self.model_size)
            return self._model

    def preload_in_background(self) -> None:
        self._executor.submit(self._get_model)

    async def transcribe(self, samples: np.ndarray, language: str | None = None) -> Transcription:
        if self._pending >= self._max_queue:
            raise SttUnavailable(f"local model busy ({self._pending} segments queued)")
        self._pending += 1
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(self._executor, self._transcribe_sync, samples, language)
        finally:
            self._pending -= 1

    def _transcribe_sync(self, samples: np.ndarray, language: str | None) -> Transcription:
        model = self._get_model()
        segments, info = model.transcribe(
            samples,
            language=language,
            beam_size=1,  # greedy decoding: much faster, slightly less accurate
            temperature=0.0,
            condition_on_previous_text=False,  # each segment is independent
        )
        segments = list(segments)  # transcription actually runs while iterating
        probs = [s.no_speech_prob for s in segments]
        return Transcription(
            text=" ".join(s.text.strip() for s in segments).strip(),
            language=normalize_language(info.language),
            engine=self.name,
            no_speech_prob=sum(probs) / len(probs) if probs else None,
        )

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

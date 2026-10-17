"""Translation with Meta's NLLB-200 (distilled, 600M parameters), run locally.

The model runs through CTranslate2, an inference engine for Transformer
models. We convert Meta's weights once to int8 (8-bit integers instead of
32-bit floats): about 4x smaller and 3-4x faster on a CPU, with almost the
same quality. See prepare_models.py.
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import ctranslate2
import sentencepiece as spm

from .languages import Language

log = logging.getLogger("usap.translator")

SPM_FILE = "sentencepiece.bpe.model"
CACHE_SIZE = 512  # short phrases ("Salamat", "Okay") repeat a lot


class TranslatorUnavailable(Exception):
    pass


# End of sentence: . ! ? (and Japanese 。！？) followed by whitespace or end of text.
# Japanese doesn't put spaces after 。 so the space is optional there.
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+|(?<=[。！？])\s*")


def split_sentences(text: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE_END.split(text)]
    return [p for p in parts if p] or [text]


class NllbTranslator:
    def __init__(self, model_dir: Path, device: str = "cpu", compute_type: str = "int8", beam_size: int = 2) -> None:
        self.model_dir = model_dir
        self._device = device
        self._compute_type = compute_type
        self._beam_size = beam_size
        self._model: ctranslate2.Translator | None = None
        self._tokenizer: spm.SentencePieceProcessor | None = None
        self._load_lock = threading.Lock()
        self._load_error: str | None = None
        # Separate worker from Whisper, so a long transcription doesn't hold up
        # a short translation (and vice versa).
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="nllb")
        self._cache: OrderedDict[tuple[str, str, str], str] = OrderedDict()

    @property
    def available(self) -> bool:
        return (self.model_dir / "model.bin").exists() and (self.model_dir / SPM_FILE).exists()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _load(self) -> tuple[ctranslate2.Translator, spm.SentencePieceProcessor]:
        with self._load_lock:
            if self._model is None or self._tokenizer is None:
                if not self.available:
                    raise TranslatorUnavailable(f"NLLB model not found in {self.model_dir}. Run: npm run setup:models")
                log.info("Loading NLLB-200 from %s ...", self.model_dir)
                self._model = ctranslate2.Translator(
                    str(self.model_dir), device=self._device, compute_type=self._compute_type
                )
                self._tokenizer = spm.SentencePieceProcessor(model_file=str(self.model_dir / SPM_FILE))
                log.info("NLLB-200 ready")
            return self._model, self._tokenizer

    def preload_in_background(self) -> None:
        if not self.available:
            log.warning("NLLB model missing (%s): translation disabled. Run: npm run setup:models", self.model_dir)
            return
        self._executor.submit(self._load)

    async def translate(self, text: str, source: Language, target: Language) -> str:
        if not text or source.code == target.code:
            return text
        key = (text, source.code, target.code)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(self._executor, self._translate_sync, text, source, target)

        self._cache[key] = result
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)  # drop the least recently used
        return result

    def _translate_sync(self, text: str, source: Language, target: Language) -> str:
        model, tokenizer = self._load()
        # NLLB was trained on single sentences and tends to silently DROP a
        # sentence when given several at once, so translate them one by one
        # (as a single batch, which is nearly as fast as one sentence).
        sentences = split_sentences(text)
        # NLLB input format: [source language token] + subword pieces + end-of-sentence.
        batch = [[source.nllb, *tokenizer.encode(s, out_type=str), "</s>"] for s in sentences]
        results = model.translate_batch(
            batch,
            # The decoder starts with the target language token, which tells
            # NLLB which of its 200 languages to write in.
            target_prefix=[[target.nllb]] * len(batch),
            beam_size=self._beam_size,
            max_decoding_length=256,
            repetition_penalty=1.1,
        )
        outputs = []
        for result in results:
            tokens = result.hypotheses[0]
            if tokens and tokens[0] == target.nllb:
                tokens = tokens[1:]
            outputs.append(tokenizer.decode(tokens).strip())
        # Japanese is written without spaces between sentences.
        return ("" if target.code == "ja" else " ").join(o for o in outputs if o)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

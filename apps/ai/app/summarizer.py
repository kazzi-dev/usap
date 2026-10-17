"""After-call summaries with Groq's free-tier LLM.

Pipeline:
  1. Translate every transcript line to English with NLLB (local, free), because
     the LLM summarizes English far better than Cebuano or mixed-language text.
  2. Ask the LLM for a short English summary (one rate-limited request).
  3. Translate the summary into each participant's language with NLLB.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx

from .languages import LANGUAGES, get_language
from .rate_limiter import TokenBucket
from .translator import NllbTranslator

log = logging.getLogger("usap.summarizer")

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
# Free-tier context is limited and long prompts eat the tokens-per-minute budget;
# for long calls keep the most recent part (~3,000 tokens).
MAX_TRANSCRIPT_CHARS = 12_000
# Includes the hidden "thinking" tokens of reasoning models like gpt-oss.
MAX_OUTPUT_TOKENS = 1_200

SYSTEM_PROMPT = """You summarize video call transcripts.
The transcript was machine-translated into English and may contain small errors.
Write plain text in this exact shape (no markdown headings, no bold):
<one sentence overview>
- <key point>
- <key point>
Action items:
- <action item, or "none">
Use 3 to 6 key points. Only use facts that are in the transcript.
Refer to people by their names. Never guess anyone's gender from a name:
if you need a pronoun, use "they"."""


class SummaryUnavailable(Exception):
    pass


@dataclass(frozen=True)
class TranscriptLine:
    speaker: str
    text: str
    lang: str | None


class LlmRateLimiter:
    """Groq LLM free-tier limits (separate from speech-to-text limits)."""

    def __init__(self, requests_per_minute: int, requests_per_day: int, tokens_per_minute: int) -> None:
        self.minute = TokenBucket(requests_per_minute, requests_per_minute / 60)
        self.day = TokenBucket(requests_per_day, requests_per_day / 86_400)
        self.tokens = TokenBucket(tokens_per_minute, tokens_per_minute / 60)

    def try_acquire(self, estimated_tokens: int) -> bool:
        charges = ((self.minute, 1), (self.day, 1), (self.tokens, estimated_tokens))
        if not all(bucket.can_afford(cost) for bucket, cost in charges):
            return False
        for bucket, cost in charges:
            bucket.consume(cost)
        return True


class Summarizer:
    def __init__(
        self,
        client: httpx.AsyncClient,
        api_key: str | None,
        model: str,
        limiter: LlmRateLimiter,
        translator: NllbTranslator,
    ) -> None:
        self._client = client
        self._api_key = api_key
        self._model = model
        self._limiter = limiter
        self._translator = translator

    @property
    def model(self) -> str:
        return self._model

    async def summarize(self, lines: list[TranscriptLine], languages: list[str]) -> dict[str, str]:
        if not self._api_key:
            raise SummaryUnavailable("GROQ_API_KEY is not set")
        if not lines:
            raise SummaryUnavailable("nothing was said")

        english_lines = [f"{line.speaker}: {await self._to_english(line)}" for line in lines]
        transcript = "\n".join(english_lines)
        if len(transcript) > MAX_TRANSCRIPT_CHARS:
            transcript = "(earlier part omitted)\n" + transcript[-MAX_TRANSCRIPT_CHARS:]

        estimated_tokens = (len(SYSTEM_PROMPT) + len(transcript)) // 4 + MAX_OUTPUT_TOKENS
        if not self._limiter.try_acquire(estimated_tokens):
            raise SummaryUnavailable("free-tier LLM limit reached, try again in a minute")

        english = await self._complete(transcript)
        summaries = {"en": english}
        english_lang = LANGUAGES["en"]
        for code in dict.fromkeys(languages):  # unique, keep order
            target = get_language(code)
            if target and code not in summaries:
                summaries[code] = await self._translate_summary(english, english_lang, target)
        return summaries

    async def _to_english(self, line: TranscriptLine) -> str:
        source = get_language(line.lang)
        if source is None or source.code == "en" or not self._translator.available:
            return line.text
        try:
            return await self._translator.translate(line.text, source, LANGUAGES["en"])
        except Exception:  # noqa: BLE001 - keep the original text if translation fails
            return line.text

    async def _translate_summary(self, text: str, source, target) -> str:
        """Translate line by line so the "- " bullet layout survives."""
        if not self._translator.available:
            return text
        out = []
        for raw in text.splitlines():
            match = re.match(r"^(\s*[-•*]\s*)?(.*)$", raw)
            bullet, body = (match.group(1) or ""), match.group(2).strip()
            out.append(bullet + (await self._translator.translate(body, source, target) if body else ""))
        return "\n".join(out).strip()

    async def _complete(self, transcript: str) -> str:
        try:
            response = await self._client.post(
                GROQ_CHAT_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": self._model,
                    "temperature": 0.3,
                    "max_tokens": MAX_OUTPUT_TOKENS,
                    # gpt-oss "thinks" before answering; a summary needs little of that.
                    "reasoning_effort": "low",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Transcript:\n{transcript}"},
                    ],
                },
                timeout=30.0,
            )
        except httpx.HTTPError as err:
            raise SummaryUnavailable(f"network error: {type(err).__name__}") from err
        if response.status_code == 429:
            raise SummaryUnavailable("Groq rate limit (429), try again later")
        if response.status_code >= 400:
            raise SummaryUnavailable(f"Groq returned {response.status_code}: {response.text[:200]}")
        content = (response.json()["choices"][0]["message"].get("content") or "").strip()
        if not content:
            raise SummaryUnavailable("the model returned an empty summary")
        return content

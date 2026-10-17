"""Speech-to-text through Groq's hosted Whisper (free tier)."""

from __future__ import annotations

import httpx

from .base import SttUnavailable, Transcription, normalize_language

GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
DEFAULT_RETRY_AFTER = 60.0


def _retry_after(response: httpx.Response) -> float:
    try:
        return float(response.headers.get("retry-after", DEFAULT_RETRY_AFTER))
    except ValueError:
        return DEFAULT_RETRY_AFTER


class GroqStt:
    name = "groq"

    def __init__(self, api_key: str, model: str, client: httpx.AsyncClient) -> None:
        self._api_key = api_key
        self._model = model
        self._client = client

    async def transcribe(self, wav: bytes, language: str | None = None, prompt: str | None = None) -> Transcription:
        data = {
            "model": self._model,
            # verbose_json also returns the detected language and per-segment
            # no_speech_prob, which we use to filter out hallucinations.
            "response_format": "verbose_json",
            "temperature": "0",
        }
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt

        try:
            response = await self._client.post(
                GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {self._api_key}"},
                data=data,
                files={"file": ("segment.wav", wav, "audio/wav")},
                timeout=15.0,
            )
        except httpx.HTTPError as err:
            raise SttUnavailable(f"network error: {type(err).__name__}") from err

        if response.status_code == 429:
            raise SttUnavailable("Groq rate limit (429)", retry_after=_retry_after(response))
        if response.status_code >= 400:
            # 5xx = Groq outage; 4xx = e.g. invalid key. Either way the local model can still help.
            raise SttUnavailable(f"Groq returned {response.status_code}: {response.text[:200]}")

        body = response.json()
        segments = body.get("segments") or []
        probs = [s["no_speech_prob"] for s in segments if isinstance(s.get("no_speech_prob"), (int, float))]
        return Transcription(
            text=(body.get("text") or "").strip(),
            language=normalize_language(body.get("language")),
            engine=self.name,
            no_speech_prob=sum(probs) / len(probs) if probs else None,
        )

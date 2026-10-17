"""The four languages Usap supports, and how each model refers to them.

App code    Whisper (speech-to-text)     NLLB-200 (translation)
en          "en"                         eng_Latn
tl          "tl"                         tgl_Latn
ceb         none: we use "tl" + prompt   ceb_Latn
ja          "ja"                         jpn_Jpan
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    code: str  # our code, shared with the web app
    name: str
    nllb: str  # NLLB-200 language token
    whisper: str  # language hint for Whisper
    # Example text in the language. Whisper treats it as "what came before",
    # which nudges spelling and vocabulary toward this language.
    whisper_prompt: str | None = None


LANGUAGES: dict[str, Language] = {
    lang.code: lang
    for lang in (
        Language("en", "English", "eng_Latn", "en"),
        Language("tl", "Tagalog", "tgl_Latn", "tl"),
        # Whisper was never trained on Cebuano. Tagalog is the closest language it
        # knows (same spelling rules, many shared words), and a Cebuano prompt
        # pulls the output toward Bisaya words. Not perfect, but free.
        Language(
            "ceb",
            "Cebuano",
            "ceb_Latn",
            "tl",
            whisper_prompt="Maayong buntag! Kumusta ka? Unsa imong pangalan? Asa ka padulong? Salamat kaayo.",
        ),
        Language("ja", "Japanese", "jpn_Jpan", "ja"),
    )
}


def get_language(code: str | None) -> Language | None:
    return LANGUAGES.get((code or "").strip().lower())

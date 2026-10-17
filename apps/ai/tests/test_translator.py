from app.languages import LANGUAGES, get_language
from app.translator import split_sentences


def test_splits_on_sentence_punctuation():
    assert split_sentences("Hello Ana, can you hear me? The subtitles are working now.") == [
        "Hello Ana, can you hear me?",
        "The subtitles are working now.",
    ]


def test_splits_japanese_without_spaces():
    assert split_sentences("おはようございます。今日は何をしますか？") == ["おはようございます。", "今日は何をしますか？"]


def test_keeps_text_without_punctuation_whole():
    assert split_sentences("oo sige tara na") == ["oo sige tara na"]


def test_every_language_has_nllb_and_whisper_codes():
    assert set(LANGUAGES) == {"en", "tl", "ceb", "ja"}
    for lang in LANGUAGES.values():
        assert lang.nllb and lang.whisper


def test_cebuano_uses_tagalog_whisper_with_a_prompt():
    ceb = get_language("ceb")
    assert ceb is not None
    assert ceb.whisper == "tl"
    assert ceb.whisper_prompt


def test_unknown_language_is_rejected():
    assert get_language("fr") is None
    assert get_language(None) is None

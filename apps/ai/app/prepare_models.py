"""One-time setup: download Meta's NLLB-200 and convert it for CTranslate2.

Run with: npm run setup:models   (or: python -m app.prepare_models inside apps/ai)

Downloads ~2.5 GB from Hugging Face and writes a ~600 MB int8 model to
apps/ai/models/. Needs the packages in requirements-convert.txt (PyTorch +
transformers), which the running service itself never imports.
"""

from __future__ import annotations

import shutil
import sys

from .config import load_settings

NLLB_SOURCE = "facebook/nllb-200-distilled-600M"


def main() -> int:
    settings = load_settings()
    out = settings.nllb_model_dir
    if (out / "model.bin").exists() and (out / "sentencepiece.bpe.model").exists():
        print(f"NLLB model already prepared in {out}")
        return 0

    try:
        from ctranslate2.converters import TransformersConverter
        from huggingface_hub import hf_hub_download
    except ImportError as err:
        print(f"Missing conversion packages ({err}). Run: npm run setup:ai")
        return 1

    print(f"Converting {NLLB_SOURCE} to CTranslate2 int8 in {out} (first run downloads ~2.5 GB)...")
    out.parent.mkdir(parents=True, exist_ok=True)
    TransformersConverter(NLLB_SOURCE).convert(str(out), quantization="int8", force=True)

    # The SentencePiece tokenizer file isn't part of the converted model; copy it alongside.
    tokenizer_file = hf_hub_download(NLLB_SOURCE, "sentencepiece.bpe.model")
    shutil.copy(tokenizer_file, out / "sentencepiece.bpe.model")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

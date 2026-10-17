"use client";

import { useEffect, useState } from "react";
import type { SubtitleLine } from "@/lib/call-session";
import { languageLabel } from "@/lib/languages";

const VISIBLE_MS = 8_000;
const MAX_LINES = 3;

/**
 * Shows the last few subtitle lines over the video, like TV captions.
 * Lines disappear 8 s after they arrive.
 *
 * - The other person's line: big, in MY language, with what they actually
 *   said underneath in small text (useful when learning each other's language).
 * - My own line: small, what I said, plus what the other person is reading.
 */
export function SubtitleOverlay({ lines }: { lines: SubtitleLine[] }) {
  const [now, setNow] = useState(0);

  // Re-render once a second so old lines fade away even when nobody talks.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  const visible = lines.filter((line) => now - line.receivedAt < VISIBLE_MS).slice(-MAX_LINES);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-3 left-0 right-32 flex flex-col items-start gap-1 px-3 sm:right-64"
    >
      {visible.map((line) => {
        const wasTranslated = line.targetLang !== null && line.targetLang !== line.lang;
        return line.isOwn ? (
          <div key={line.segmentId} className="max-w-full rounded-lg bg-black/45 px-3 py-1.5 text-sm leading-snug">
            <p className="text-neutral-300">
              <span className="mr-1.5 font-semibold text-neutral-400">You:</span>
              {line.originalText}
            </p>
            {wasTranslated && (
              <p className="text-xs text-neutral-400">
                They read ({languageLabel(line.targetLang)}): {line.translatedText}
              </p>
            )}
          </div>
        ) : (
          <div key={line.segmentId} className="max-w-full rounded-lg bg-black/75 px-3 py-1.5 leading-snug">
            <p className="text-base text-white sm:text-lg">
              <span className="mr-1.5 font-semibold text-sky-300">{line.speakerName}:</span>
              {line.translatedText}
            </p>
            {wasTranslated && (
              <p className="text-xs text-neutral-400 sm:text-sm">
                {languageLabel(line.lang)}: {line.originalText}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

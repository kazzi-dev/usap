"use client";

import { useEffect, useState } from "react";
import type { SubtitleLine } from "@/lib/call-session";

const VISIBLE_MS = 8_000;
const MAX_LINES = 3;

/**
 * Shows the last few subtitle lines over the video, like TV captions.
 * Lines disappear 8 s after they arrive. The other person's lines are big
 * and bright; our own are smaller and dimmer (they're just a confirmation
 * of what the other side is reading).
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
      {visible.map((line) => (
        <p
          key={line.segmentId}
          className={`max-w-full rounded-lg px-3 py-1.5 leading-snug ${
            line.isOwn ? "bg-black/45 text-sm text-neutral-300" : "bg-black/75 text-base text-white sm:text-lg"
          }`}
        >
          <span className={`mr-1.5 font-semibold ${line.isOwn ? "text-neutral-400" : "text-sky-300"}`}>
            {line.isOwn ? "You" : line.speakerName}:
          </span>
          {line.translatedText}
        </p>
      ))}
    </div>
  );
}

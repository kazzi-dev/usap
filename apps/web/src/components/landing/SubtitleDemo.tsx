"use client";

import { useEffect, useState } from "react";

interface DemoLine {
  speaker: string;
  speakerLang: string;
  text: string;
  listener: string;
  listenerLang: string;
  translated: string;
  hue: string; // avatar gradient
}

// Two short conversations covering all four languages.
const LINES: DemoLine[] = [
  {
    speaker: "Ana",
    speakerLang: "Tagalog",
    text: "Kumusta ka? Kumain ka na ba?",
    listener: "Ken",
    listenerLang: "日本語",
    translated: "元気？もうご飯食べた？",
    hue: "from-sky-400 to-cyan-300",
  },
  {
    speaker: "Ken",
    speakerLang: "日本語",
    text: "うん、さっき食べたよ！",
    listener: "Ana",
    listenerLang: "Tagalog",
    translated: "Oo, kumain na ako kanina!",
    hue: "from-violet-500 to-fuchsia-400",
  },
  {
    speaker: "Mika",
    speakerLang: "Bisaya",
    text: "Maayong buntag! Asa ka padulong?",
    listener: "Sam",
    listenerLang: "English",
    translated: "Good morning! Where are you going?",
    hue: "from-emerald-400 to-teal-300",
  },
  {
    speaker: "Sam",
    speakerLang: "English",
    text: "To the library. Want to come?",
    listener: "Mika",
    listenerLang: "Bisaya",
    translated: "Sa library. Gusto ka mouban?",
    hue: "from-amber-400 to-orange-400",
  },
];

const TYPE_MS = 38;
const HOLD_MS = 2600;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Plays the demo: type the speech, then reveal the translation, then the next line. */
function useDemo() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const line = LINES[index];
  const done = typed >= line.text.length;

  useEffect(() => {
    if (prefersReducedMotion()) {
      // No typing animation: show whole lines, change them slowly.
      const show = setTimeout(() => setTyped(line.text.length), 0);
      const next = setTimeout(() => {
        setIndex((i) => (i + 1) % LINES.length);
        setTyped(0);
      }, HOLD_MS * 2);
      return () => {
        clearTimeout(show);
        clearTimeout(next);
      };
    }
    const timer = done
      ? setTimeout(() => {
          setIndex((i) => (i + 1) % LINES.length);
          setTyped(0);
        }, HOLD_MS)
      : setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(timer);
  }, [done, line.text.length, typed]);

  return { line, typed, done, index };
}

function Avatar({ name, hue, speaking }: { name: string; hue: string; speaking: boolean }) {
  return (
    <div className="relative">
      {speaking && <span className={`animate-pulse-ring absolute inset-0 rounded-full bg-gradient-to-br ${hue}`} />}
      <div
        className={`relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br ${hue} text-lg font-semibold text-ink-950 shadow-lg sm:size-16`}
      >
        {name[0]}
      </div>
    </div>
  );
}

function VoiceBars() {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="animate-wave h-full w-1 origin-bottom rounded-full bg-sky-300"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * A fake call card that shows what Usap does: what one person says appears as
 * a subtitle in the other person's language.
 */
export function SubtitleDemo({ compact = false }: { compact?: boolean }) {
  const { line, typed, done, index } = useDemo();
  const partner = LINES[index % 2 === 0 ? index + 1 : index - 1];

  return (
    <figure
      aria-label="Example: subtitles translated live during a call"
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900/80 shadow-2xl shadow-sky-950/50 backdrop-blur"
    >
      {/* Window bar */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-400" /> Connected
        </span>
        <span className="font-mono">kfp-wqzt-mbd</span>
      </div>

      {/* "Video" area */}
      <div className={`relative grid grid-cols-2 gap-3 p-4 ${compact ? "h-40" : "h-56 sm:h-64"}`}>
        {[line, partner].map((person, i) => (
          <div
            key={person.speaker}
            className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-ink-700 to-ink-800 ${
              i === 0 ? "ring-2 ring-sky-400/60" : ""
            }`}
          >
            <Avatar name={person.speaker} hue={person.hue} speaking={i === 0 && !done} />
            <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] text-slate-200">
              {i === 0 && !done && <VoiceBars />}
              {person.speaker} · {person.speakerLang}
            </span>
          </div>
        ))}
      </div>

      {/* Subtitles */}
      <figcaption className="space-y-2 px-4 pb-5" aria-live="off">
        <p className="min-h-[1.75rem] text-sm text-slate-300">
          <span className="mr-1.5 font-semibold text-slate-400">{line.speaker}:</span>
          {line.text.slice(0, typed)}
          {!done && <span className="animate-caret ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-sky-300" />}
        </p>
        <div
          key={index}
          className={`rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 transition-opacity duration-500 ${
            done ? "opacity-100" : "opacity-0"
          }`}
        >
          <p className="text-[11px] uppercase tracking-wider text-sky-300/80">
            {line.listener} reads · {line.listenerLang}
          </p>
          <p className={`mt-0.5 font-medium text-white ${compact ? "text-base" : "text-lg"}`}>{line.translated}</p>
        </div>
      </figcaption>
    </figure>
  );
}

"use client";

import type { LanguageCode } from "@usap/shared";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { loadLanguage, saveLanguage } from "@/lib/preferences";

interface OnboardingProps {
  onClose: () => void;
  /** Start on a later step (0-based). */
  initialStep?: number;
}

const STEPS = ["welcome", "speak", "language", "privacy"] as const;

const GREETINGS: { code: LanguageCode; label: string; native: string; hello: string }[] = [
  { code: "en", label: "English", native: "English", hello: "Hello!" },
  { code: "tl", label: "Tagalog", native: "Tagalog", hello: "Kumusta!" },
  { code: "ceb", label: "Cebuano", native: "Bisaya", hello: "Maayong adlaw!" },
  { code: "ja", label: "Japanese", native: "日本語", hello: "こんにちは！" },
];

const noop = () => () => {};

/**
 * First-visit intro: what Usap is, how it works, your language, and privacy.
 * A modal dialog: Esc or "Skip" closes it, arrow keys move between steps.
 */
export function Onboarding({ onClose, initialStep = 0 }: OnboardingProps) {
  const [step, setStep] = useState(Math.min(Math.max(0, initialStep), 3));
  const storedLanguage = useSyncExternalStore(noop, loadLanguage, () => "en" as const);
  const [picked, setPicked] = useState<LanguageCode | null>(null);
  const language = picked ?? storedLanguage;
  const nextButton = useRef<HTMLButtonElement>(null);
  const last = step === STEPS.length - 1;

  const next = () => (last ? onClose() : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  // Keyboard: Esc = skip, arrows = navigate. Focus the main button on each step.
  useEffect(() => {
    nextButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  const pick = (code: LanguageCode) => {
    setPicked(code);
    saveLanguage(code);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/40 p-0 sm:items-center sm:p-6"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-neutral-200 bg-white sm:rounded-3xl">
        {/* Illustration area */}
        <div className="relative flex h-60 items-center justify-center overflow-hidden bg-neutral-50">
          <div key={step} className="animate-fade-up">
            {STEPS[step] === "welcome" && <WelcomeArt />}
            {STEPS[step] === "speak" && <SpeakArt />}
            {STEPS[step] === "language" && <LanguageArt code={language} />}
            {STEPS[step] === "privacy" && <PrivacyArt />}
          </div>
        </div>

        {/* Text */}
        <div key={`text-${step}`} className="animate-fade-up px-6 pb-2 pt-6 [animation-delay:80ms]">
          {STEPS[step] === "welcome" && (
            <>
              <h2 id="onboarding-title" className="text-2xl font-semibold text-neutral-950">
                Welcome to <span className="text-hanko">Usap</span>
              </h2>
              <p className="mt-2 text-neutral-700">
                Video calls where everyone reads the conversation in their own language: English, Tagalog,
                Bisaya or Japanese.
              </p>
            </>
          )}
          {STEPS[step] === "speak" && (
            <>
              <h2 id="onboarding-title" className="text-2xl font-semibold text-neutral-950">
                Just talk naturally
              </h2>
              <p className="mt-2 text-neutral-700">
                About a second after you pause, your words appear as subtitles on the other person&apos;s screen,
                translated for them. You see what they say in your language.
              </p>
            </>
          )}
          {STEPS[step] === "language" && (
            <>
              <h2 id="onboarding-title" className="text-2xl font-semibold text-neutral-950">
                Which language do you speak?
              </h2>
              <p className="mt-1 text-sm text-neutral-500">You&apos;ll read subtitles in it too. You can change it anytime.</p>
              <div role="radiogroup" aria-label="Your language" className="mt-4 grid grid-cols-2 gap-2">
                {GREETINGS.map((g) => (
                  <button
                    key={g.code}
                    type="button"
                    role="radio"
                    aria-checked={language === g.code}
                    onClick={() => pick(g.code)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      language === g.code
                        ? "border-neutral-900 bg-hanko/5"
                        : "border-neutral-200 bg-neutral-50 hover:border-neutral-400"
                    }`}
                  >
                    <span className="block font-medium text-neutral-950">{g.native}</span>
                    <span className="block text-sm text-neutral-500">{g.hello}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {STEPS[step] === "privacy" && (
            <>
              <h2 id="onboarding-title" className="text-2xl font-semibold text-neutral-950">
                Private by design
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                <li className="flex gap-2">
                  <Check /> Video goes directly between you and the other person.
                </li>
                <li className="flex gap-2">
                  <Check /> Your browser asks before using your camera and microphone.
                </li>
                <li className="flex gap-2">
                  <Check /> A transcript is saved only when someone is logged in, and everyone sees a
                  &quot;Transcript saved&quot; badge.
                </li>
              </ul>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3 px-6 pb-6 pt-5">
          <button type="button" onClick={step === 0 ? onClose : back} className="text-sm text-neutral-500 hover:text-neutral-950">
            {step === 0 ? "Skip" : "Back"}
          </button>
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-neutral-900" : "w-1.5 bg-neutral-300"}`}
              />
            ))}
          </div>
          <button
            ref={nextButton}
            type="button"
            onClick={next}
            className="bg-neutral-950 text-white hover:bg-neutral-800 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {last ? "Start using Usap" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-hanko" fill="currentColor" aria-hidden="true">
      <path d="M8 13.2 4.8 10l-1.1 1.1L8 15.4l8.3-8.3-1.1-1.1z" />
    </svg>
  );
}

// ---------- Illustrations (decorative) ----------

function WelcomeArt() {
  const bubbles = [
    { text: "Hello", cls: "left-[8%] top-[18%]", delay: "0s" },
    { text: "Kumusta", cls: "right-[6%] top-[14%]", delay: "-2s" },
    { text: "Maayo", cls: "left-[12%] bottom-[14%]", delay: "-4s" },
    { text: "こんにちは", cls: "right-[10%] bottom-[18%]", delay: "-1s" },
  ];
  return (
    <div aria-hidden="true" className="relative flex h-60 w-[min(32rem,100vw)] items-center justify-center">
      <span className="animate-pulse-ring absolute size-24 rounded-full bg-hanko/20" />
      <span className="animate-pulse-ring absolute size-24 rounded-full bg-neutral-900/10 [animation-delay:1.2s]" />
      <div className="relative rounded-3xl bg-white p-4 ring-1 ring-neutral-200">
        <LogoMark className="size-16" />
      </div>
      {bubbles.map((b) => (
        <span
          key={b.text}
          className={`animate-float absolute rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-700 ${b.cls}`}
          style={{ animationDelay: b.delay }}
        >
          {b.text}
        </span>
      ))}
    </div>
  );
}

function SpeakArt() {
  return (
    <div aria-hidden="true" className="flex items-center gap-4 px-6">
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-neutral-100 ring-1 ring-neutral-200">
          <svg viewBox="0 0 24 24" className="size-7 text-hanko" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 17v4" strokeLinecap="round" />
          </svg>
        </div>
        <span className="flex h-6 items-end gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="animate-wave h-full w-1.5 origin-bottom rounded-full bg-hanko"
              style={{ animationDelay: `${i * 110}ms` }}
            />
          ))}
        </span>
      </div>
      <svg viewBox="0 0 40 12" className="w-10 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M0 6h36m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="w-56 space-y-2">
        <div className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-700">Kumusta ka? Kumain ka na ba?</div>
        <div className="animate-fade-up rounded-xl border border-hanko/30 bg-hanko/5 px-3 py-2 text-sm font-medium text-neutral-950 [animation-delay:400ms]">
          How are you? Have you eaten yet?
        </div>
      </div>
    </div>
  );
}

function LanguageArt({ code }: { code: LanguageCode }) {
  const current = GREETINGS.find((g) => g.code === code) ?? GREETINGS[0];
  return (
    <div aria-hidden="true" className="flex flex-col items-center gap-3">
      <div key={code} className="animate-fade-up text-4xl font-semibold text-neutral-950">
        {current.hello}
      </div>
      <div className="flex gap-2">
        {GREETINGS.map((g) => (
          <span
            key={g.code}
            className={`rounded-full px-3 py-1 text-xs transition ${
              g.code === code ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {g.native}
          </span>
        ))}
      </div>
    </div>
  );
}

function PrivacyArt() {
  return (
    <div aria-hidden="true" className="relative flex items-center gap-6">
      <div className="flex size-14 items-center justify-center rounded-full bg-neutral-900 !text-white text-lg font-semibold text-white">
        A
      </div>
      <div className="relative h-1 w-28 overflow-hidden rounded-full bg-neutral-100">
        <span className="bg-neutral-900 absolute inset-0" />
      </div>
      <div className="flex size-14 items-center justify-center rounded-full bg-hanko !text-white text-lg font-semibold text-white">
        K
      </div>
      <div className="absolute -top-14 left-1/2 flex size-12 -translate-x-1/2 items-center justify-center rounded-2xl bg-white ring-1 ring-hanko/30">
        <svg viewBox="0 0 24 24" className="size-6 text-hanko" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" strokeLinejoin="round" />
          <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

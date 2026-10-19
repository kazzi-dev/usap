"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccountBar } from "@/components/AccountBar";
import { Aurora } from "@/components/brand/Aurora";
import { Logo } from "@/components/brand/Logo";
import { SubtitleDemo } from "@/components/landing/SubtitleDemo";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { createRoomId, parseRoomInput } from "@/lib/ids";

const LANGUAGES = ["English", "Tagalog", "Bisaya", "日本語"];

const FEATURES = [
  {
    title: "Subtitles in about a second",
    body: "Speak normally. Your words appear on the other screen right after you pause.",
    icon: "M4 6h16M4 12h10M4 18h7",
  },
  {
    title: "Everyone reads their language",
    body: "Each person picks a language; subtitles are translated for each listener.",
    icon: "M3 5h8M7 3v2m2.5 10A12 12 0 0 1 4 9m8 12 4.5-10L21 21m-7.5-4h6",
  },
  {
    title: "A summary after every call",
    body: "Log in to keep transcripts and an AI summary in your own language.",
    icon: "M8 4h8l4 4v12H4V4h4zM8 12h8M8 16h5",
  },
  {
    title: "Direct, private video",
    body: "Video flows straight between you two. Recording only with a visible badge.",
    icon: "M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z",
  },
];

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [replayIntro, setReplayIntro] = useState(false);

  const createCall = () => router.push(`/room/${createRoomId()}`);

  const joinCall = (e: React.FormEvent) => {
    e.preventDefault();
    const roomId = parseRoomInput(code);
    if (!roomId) {
      setError("Paste an invite link or a room code like abc-defg-hij.");
      return;
    }
    router.push(`/room/${roomId}`);
  };

  return (
    <main className="relative isolate min-h-dvh overflow-hidden text-neutral-950">
      <Aurora />
      <OnboardingGate replay={replayIntro} onReplayDone={() => setReplayIntro(false)} />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <AccountBar />
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-16 pt-6 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
        <div>
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Live translated video calls · free
          </p>
          <h1 className="animate-fade-up mt-5 text-4xl font-semibold leading-[1.08] tracking-tight [animation-delay:80ms] sm:text-6xl">
            Talk to anyone.
            <br />
            <span className="text-hanko">Read them in your language.</span>
          </h1>
          <p className="animate-fade-up mt-5 max-w-xl text-lg text-neutral-700 [animation-delay:160ms]">
            Usap turns what each person says into live subtitles, translated for the other person. No
            accounts needed to call.
          </p>

          <ul className="animate-fade-up mt-5 flex flex-wrap gap-2 [animation-delay:220ms]" aria-label="Supported languages">
            {LANGUAGES.map((l) => (
              <li key={l} className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 ring-1 ring-neutral-200">
                {l}
              </li>
            ))}
          </ul>

          {/* Start / join */}
          <div className="animate-fade-up mt-8 max-w-md rounded-3xl border border-neutral-200 bg-white p-4 [animation-delay:280ms]">
            <button
              type="button"
              onClick={createCall}
              className="bg-neutral-950 text-white hover:bg-neutral-800 group flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-base font-semibold transition hover:brightness-110"
            >
              Start a new call
              <svg viewBox="0 0 20 20" className="size-5 transition group-hover:translate-x-0.5" fill="currentColor" aria-hidden="true">
                <path d="M11.3 4.3 16 9l-4.7 4.7-1-1L13.2 9.8H4V8.2h9.2L10.3 5.3z" />
              </svg>
            </button>
            <div className="my-3 flex items-center gap-3 text-xs text-neutral-500">
              <div className="h-px flex-1 bg-neutral-100" /> or join with a link
              <div className="h-px flex-1 bg-neutral-100" />
            </div>
            <form onSubmit={joinCall} className="flex gap-2">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                placeholder="Invite link or room code"
                aria-label="Invite link or room code"
                aria-invalid={!!error}
                className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 outline-none transition focus:border-neutral-900"
              />
              <button type="submit" className="rounded-xl bg-neutral-100 px-4 py-3 font-medium transition hover:bg-neutral-200">
                Join
              </button>
            </form>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:200ms] lg:pl-4">
          <SubtitleDemo />
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 pb-16" aria-labelledby="features-title">
        <h2 id="features-title" className="sr-only">
          Features
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-neutral-400"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-neutral-100 ring-1 ring-neutral-200">
                <svg viewBox="0 0 24 24" className="size-5 text-hanko" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={f.icon} />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-neutral-500">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 pb-20" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-semibold">
          How it works
        </h2>
        <ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["Start a call", "Pick your language and send the invite link to anyone."],
            ["Talk normally", "Each of you speaks your own language. No buttons to hold."],
            ["Read along", "Subtitles appear for both of you, translated for each person."],
          ].map(([title, body], i) => (
            <li key={title} className="relative rounded-2xl border border-neutral-200 p-5">
              <span className="text-hanko text-3xl font-semibold">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-neutral-500">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-neutral-500 sm:flex-row">
          <span>
            Usap · Made by{" "}
            <a href="https://github.com/kazzi-dev/usap" className="font-medium text-neutral-950 hover:text-hanko">
              Kazzi
            </a>{" "}
            · © 2026 Kazzi, MIT License
          </span>
          <button type="button" onClick={() => setReplayIntro(true)} className="hover:text-neutral-950">
            Replay the intro
          </button>
        </div>
      </footer>
    </main>
  );
}

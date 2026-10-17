"use client";

import type { CallDetail } from "@usap/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountBar } from "@/components/AccountBar";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration, formatOffset } from "@/lib/format";
import { isLanguageCode, languageLabel } from "@/lib/languages";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";

const label = (code: string | null) => (code && isLanguageCode(code) ? languageLabel(code) : (code ?? ""));

export function CallDetailClient() {
  const { callId } = useParams<{ callId: string }>();
  const session = useSession();
  const { data: call, error, loading, reload } = useApi<CallDetail>(session ? `/api/calls/${callId}` : null);

  // While the summary is being written, check again every few seconds.
  const pending = call?.summaryStatus === "pending";
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(reload, 3_000);
    return () => clearInterval(id);
  }, [pending, reload]);

  return (
    <main className="min-h-dvh bg-neutral-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <Link href="/history" className="text-sm text-neutral-400 hover:text-white">
            ← Call history
          </Link>
          <AccountBar />
        </header>

        {!session ? (
          <p className="mt-8 text-neutral-400">
            <Link href={`/login?next=/history/${callId}`} className="text-sky-400 hover:underline">
              Log in
            </Link>{" "}
            to see this call.
          </p>
        ) : loading && !call ? (
          <p className="mt-8 text-neutral-400">Loading…</p>
        ) : error ? (
          <p className="mt-8 text-red-400">{error.message}</p>
        ) : call ? (
          <CallView call={call} onSummaryRetried={reload} />
        ) : null}
      </div>
    </main>
  );
}

function CallView({ call, onSummaryRetried }: { call: CallDetail; onSummaryRetried: () => void }) {
  const myLang = call.participants.find((p) => p.isYou)?.lang ?? "en";
  const others = call.participants.filter((p) => !p.isYou);
  const start = Date.parse(call.startedAt);

  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold">
        {others.length ? `Call with ${others.map((p) => p.name).join(", ")}` : "Call"}
      </h1>
      <p className="mt-1 text-sm text-neutral-400">
        {formatDateTime(call.startedAt)} · {formatDuration(call.startedAt, call.endedAt)} ·{" "}
        {call.participants.map((p) => `${p.name}${p.isYou ? " (you)" : ""}: ${label(p.lang)}`).join(" · ")}
      </p>

      <SummaryCard call={call} defaultLang={myLang} onRetried={onSummaryRetried} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Transcript</h2>
        {call.lines.length === 0 ? (
          <p className="mt-2 text-neutral-400">Nothing was transcribed in this call.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {call.lines.map((line) => {
              const translated = line.targetLang && line.targetLang !== line.lang;
              return (
                <li key={line.id} className="rounded-lg bg-neutral-900 px-4 py-3">
                  <p className="text-xs text-neutral-500">
                    <span className="font-mono">{formatOffset(line.spokenAt - start)}</span> ·{" "}
                    <span className="font-medium text-neutral-300">{line.speakerName}</span> · {label(line.lang)}
                  </p>
                  <p className="mt-1">{line.originalText}</p>
                  {translated && (
                    <p className="mt-1 text-sm text-neutral-400">
                      {label(line.targetLang)}: {line.translatedText}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

function SummaryCard({ call, defaultLang, onRetried }: { call: CallDetail; defaultLang: string; onRetried: () => void }) {
  const languages = Object.keys(call.summary ?? {});
  const [picked, setPicked] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const lang = picked ?? (languages.includes(defaultLang) ? defaultLang : (languages[0] ?? "en"));

  const retry = async () => {
    setRetrying(true);
    await api(`/api/calls/${call.id}/summary`, { method: "POST" }).catch(() => {});
    setRetrying(false);
    onRetried();
  };

  return (
    <section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">AI summary</h2>
        {languages.length > 1 && (
          <div role="tablist" aria-label="Summary language" className="flex gap-1">
            {languages.map((code) => (
              <button
                key={code}
                role="tab"
                aria-selected={code === lang}
                type="button"
                onClick={() => setPicked(code)}
                className={`rounded-md px-2 py-1 text-xs ${
                  code === lang ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {label(code)}
              </button>
            ))}
          </div>
        )}
      </div>

      {call.summaryStatus === "ready" && call.summary ? (
        <p className="mt-3 whitespace-pre-line leading-relaxed text-neutral-200">{call.summary[lang]}</p>
      ) : call.summaryStatus === "pending" ? (
        <p className="mt-3 text-neutral-400">{call.endedAt ? "Writing the summary…" : "The summary appears after the call ends."}</p>
      ) : call.summaryStatus === "skipped" ? (
        <p className="mt-3 text-neutral-400">{call.summaryError ?? "No summary for this call."}</p>
      ) : (
        <div className="mt-3">
          <p className="text-amber-300">The summary couldn&apos;t be created.</p>
          {call.summaryError && <p className="mt-1 text-sm text-neutral-400">{call.summaryError}</p>}
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="mt-3 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Made with Groq&apos;s free AI from the machine-translated transcript. Check important details.
      </p>
    </section>
  );
}

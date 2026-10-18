"use client";

import type { CallListItem } from "@usap/shared";
import Link from "next/link";
import { AccountBar } from "@/components/AccountBar";
import { formatDateTime, formatDuration } from "@/lib/format";
import { languageLabel, isLanguageCode } from "@/lib/languages";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";

const SUMMARY_BADGE: Record<CallListItem["summaryStatus"], [string, string]> = {
  ready: ["bg-emerald-100 text-emerald-800", "Summary ready"],
  pending: ["bg-neutral-100 text-neutral-600", "Summarizing…"],
  failed: ["bg-amber-100 text-amber-800", "Summary failed"],
  skipped: ["bg-neutral-100 text-neutral-500", "No summary"],
};

export default function HistoryPage() {
  const session = useSession();
  const { data: calls, error, loading } = useApi<CallListItem[]>(session ? "/api/calls" : null);

  return (
    <main className="min-h-dvh bg-white px-4 py-6 text-neutral-950">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            Usap
          </Link>
          <AccountBar />
        </header>

        <h1 className="mt-8 text-2xl font-semibold">Call history</h1>

        {!session ? (
          <p className="mt-4 text-neutral-500">
            <Link href="/login?next=/history" className="text-hanko hover:underline">
              Log in
            </Link>{" "}
            to see your calls, transcripts and summaries.
          </p>
        ) : loading ? (
          <p className="mt-4 text-neutral-500">Loading…</p>
        ) : error ? (
          <p className="mt-4 text-hanko">{error.message}</p>
        ) : !calls?.length ? (
          <p className="mt-4 text-neutral-500">
            No saved calls yet. Calls are saved when you&apos;re logged in and someone joins you.{" "}
            <Link href="/" className="text-hanko hover:underline">
              Start a call
            </Link>
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {calls.map((call) => {
              const others = call.participants.filter((p) => !p.isYou);
              const [badgeClass, badgeText] = SUMMARY_BADGE[call.summaryStatus];
              return (
                <li key={call.id}>
                  <Link
                    href={`/history/${call.id}`}
                    className="block rounded-xl border border-neutral-200 bg-neutral-50 p-4 hover:border-neutral-400"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {others.length
                            ? `With ${others
                                .map((p) => `${p.name} (${isLanguageCode(p.lang) ? languageLabel(p.lang) : p.lang})`)
                                .join(", ")}`
                            : "Call"}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {formatDateTime(call.startedAt)} · {formatDuration(call.startedAt, call.endedAt)} ·{" "}
                          {call.lineCount} {call.lineCount === 1 ? "line" : "lines"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${badgeClass}`}>{badgeText}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

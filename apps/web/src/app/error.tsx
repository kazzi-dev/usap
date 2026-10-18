"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/brand/Logo";

/** Shown when a page crashes, instead of a blank screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold text-neutral-950">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-neutral-500">
          The page hit an unexpected error. Try again; if it keeps happening, reload or go back home.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-neutral-950 px-5 py-2.5 font-semibold text-white hover:bg-neutral-800"
        >
          Try again
        </button>
        <Link href="/" className="rounded-xl border border-neutral-200 px-5 py-2.5 font-semibold text-neutral-950 hover:border-neutral-400">
          Go home
        </Link>
      </div>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccountBar } from "@/components/AccountBar";
import { createRoomId, parseRoomInput } from "@/lib/ids";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-4 text-white">
      <div className="absolute right-4 top-4">
        <AccountBar />
      </div>
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold tracking-tight">Usap</h1>
        <p className="mt-2 text-neutral-400">
          Video calls with live translated subtitles. English, Tagalog, Cebuano and Japanese.
        </p>

        <button
          type="button"
          onClick={createCall}
          className="mt-8 w-full rounded-lg bg-sky-600 px-4 py-3 font-medium hover:bg-sky-500"
        >
          Start a new call
        </button>

        <div className="my-6 flex items-center gap-3 text-sm text-neutral-500">
          <div className="h-px flex-1 bg-neutral-800" />
          or join one
          <div className="h-px flex-1 bg-neutral-800" />
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
            className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-3 outline-none focus:border-sky-500"
          />
          <button type="submit" className="rounded-lg bg-neutral-800 px-4 py-3 font-medium hover:bg-neutral-700">
            Join
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}

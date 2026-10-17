"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearSession, useSession } from "@/lib/session";

/** Top-right: "Log in", or the user's name with History and Log out. */
export function AccountBar() {
  const session = useSession();
  const router = useRouter();

  const logOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    clearSession();
    router.push("/");
  };

  return (
    <nav className="flex items-center gap-4 text-sm">
      {session ? (
        <>
          <span className="hidden text-neutral-400 sm:inline">{session.user.name}</span>
          <Link href="/history" className="text-neutral-200 hover:text-white">
            Call history
          </Link>
          <button type="button" onClick={logOut} className="text-neutral-400 hover:text-white">
            Log out
          </button>
        </>
      ) : (
        <Link href="/login" className="rounded-lg bg-neutral-800 px-3 py-1.5 text-neutral-100 hover:bg-neutral-700">
          Log in
        </Link>
      )}
    </nav>
  );
}

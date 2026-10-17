"use client";

import type { ApiUser } from "@usap/shared";
import { useSyncExternalStore } from "react";

/*
 * Who is logged in on this browser: the user and their session token,
 * kept in localStorage so it survives reloads.
 *
 * Why a token in localStorage and not a cookie? The API runs on a different
 * site than the web app (Oracle Cloud vs Vercel when deployed), and browsers
 * increasingly block cross-site cookies. The trade-off: JavaScript can read the
 * token, so an XSS bug could steal it. React escapes everything we render and
 * we never inject raw HTML, which keeps that risk low.
 */

export interface Session {
  user: ApiUser;
  token: string;
}

const KEY = "usap:session";
const listeners = new Set<() => void>();

// getSnapshot must return the SAME object while nothing changed, so cache the parse.
let cachedRaw: string | null = null;
let cachedSession: Session | null = null;

function read(): Session | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage blocked: behave as logged out
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSession = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cachedSession = null;
    }
  }
  return cachedSession;
}

function emit() {
  for (const listener of listeners) listener();
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
  emit();
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  emit();
}

/** Current session outside React (e.g. when opening the call socket). */
export const getSession = read;

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Logging in/out in another tab updates this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The logged-in session, or null. Always null during server rendering. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

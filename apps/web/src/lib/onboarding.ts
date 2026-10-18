"use client";

import { useSyncExternalStore } from "react";

// Bump the version to show the intro again to everyone after a big change.
const KEY = "usap:onboarded:v1";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // storage blocked: don't nag on every visit
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // ignore
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Has this browser seen the intro? (Server render: assume yes, so no flash.) */
export function useOnboarded(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

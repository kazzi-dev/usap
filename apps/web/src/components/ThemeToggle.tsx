"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "usap:theme";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

/** Cycles the page theme: follow the device → light → dark. Saved in this browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // Read once after mount: the server can't know the saved choice.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  const change = () => {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={change}
      title="Change theme"
      aria-label={`Theme: ${LABEL[theme]}. Change theme`}
      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-neutral-700 hover:border-neutral-400"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
        <path d="M10 2a8 8 0 1 0 0 16V2Z" />
        <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {LABEL[theme]}
    </button>
  );
}

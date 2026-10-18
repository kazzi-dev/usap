import { useId } from "react";

/**
 * The Usap mark: two overlapping speech bubbles ("usap" = to talk, in Filipino).
 * The front bubble carries the brand gradient; the back one is "the other
 * person", in a lighter tone.
 */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  const id = useId(); // unique gradient id, so several logos on one page don't clash
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path
        d="M16 15h15a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6h-1v4.5L24.5 33H16a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"
        fill="#dbeafe"
        opacity="0.92"
      />
      <path
        d="M9 3h14a6 6 0 0 1 6 6v7a6 6 0 0 1-6 6h-8.5L9 26.5V22a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z"
        fill={`url(#${id})`}
      />
      <circle cx="11" cy="12.5" r="1.6" fill="#fff" />
      <circle cx="16" cy="12.5" r="1.6" fill="#fff" />
      <circle cx="21" cy="12.5" r="1.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-xl font-semibold tracking-tight text-white">Usap</span>
    </span>
  );
}

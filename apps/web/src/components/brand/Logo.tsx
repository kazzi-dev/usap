/**
 * The Usap mark: two overlapping speech bubbles ("usap" = to talk, in Filipino).
 * The front bubble is ink black; the back one, "the other person", is seal red.
 */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M16 15h15a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6h-1v4.5L24.5 33H16a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"
        fill="#d93a2b"
      />
      <path
        d="M9 3h14a6 6 0 0 1 6 6v7a6 6 0 0 1-6 6h-8.5L9 26.5V22a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z"
        fill="#111111"
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
      <span className="text-xl font-semibold tracking-tight text-neutral-950">Usap</span>
    </span>
  );
}

// Small inline icons (no icon library needed).
type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  "aria-hidden": true,
} as const;

export const MicIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
  </svg>
);

export const MicOffIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M19 10a7 7 0 0 1-1.1 3.8M5 10a7 7 0 0 0 11 5.7M12 17v4M8 21h8M3 3l18 18" />
  </svg>
);

export const CamIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="m16 10 6-3v10l-6-3" />
  </svg>
);

export const CamOffIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M16 16v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1m4 0h5a2 2 0 0 1 2 2v3.3l6-3.3v10M3 3l18 18" />
  </svg>
);

export const PhoneOffIcon = ({ className = "size-6" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 15.5c5-4.7 13-4.7 18 0l-2.2 2.5-3.3-1.6v-2.6a12 12 0 0 0-7 0v2.6L5.2 18z" />
  </svg>
);

export const LinkIcon = ({ className = "size-5" }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

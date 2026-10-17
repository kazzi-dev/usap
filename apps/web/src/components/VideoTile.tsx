"use client";

import { useEffect, useRef, useState } from "react";

interface VideoTileProps {
  stream: MediaStream | null;
  /** Show the avatar instead of the video (camera off / not connected yet). */
  showVideo: boolean;
  name: string;
  /** Our own preview: muted (no echo) and mirrored like a mirror. */
  isLocal?: boolean;
  /** Must include a position class ("relative" or "absolute"). */
  className?: string;
  children?: React.ReactNode;
}

export function VideoTile({ stream, showVideo, name, isLocal = false, className = "", children }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  // srcObject can't be set through JSX, so attach the stream imperatively.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (!stream) return;
    // Browsers can block autoplay with sound; if so, ask for one tap.
    video.play().then(
      () => setNeedsTap(false),
      (err: unknown) => {
        if (err instanceof DOMException && err.name === "NotAllowedError") setNeedsTap(true);
      },
    );
  }, [stream]);

  const initials = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className={`overflow-hidden bg-neutral-800 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`h-full w-full object-cover ${isLocal ? "-scale-x-100" : ""} ${showVideo ? "" : "invisible"}`}
      />
      {!showVideo && name && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-neutral-600 text-3xl font-semibold text-white">
            {initials}
          </div>
        </div>
      )}
      {name && (
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {isLocal ? `${name} (you)` : name}
        </span>
      )}
      {needsTap && !isLocal && (
        <button
          type="button"
          onClick={() => void videoRef.current?.play().then(() => setNeedsTap(false))}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-white"
        >
          Tap to turn on sound
        </button>
      )}
      {children}
    </div>
  );
}

import type { ClientToServerEvents, IceServersResponse, ServerToClientEvents } from "@usap/shared";
import type { Socket } from "socket.io-client";

export type SignalSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const DEFAULT_SIGNAL_PORT = 4000;

/**
 * Where the signaling server lives. By default: same host as this page, port
 * 4000, same http/https scheme. That makes it work unchanged on localhost and
 * on a LAN IP (phone on the same Wi-Fi). Override with NEXT_PUBLIC_SIGNAL_URL
 * when deployed.
 */
export function getSignalUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SIGNAL_URL;
  // "same-origin": the signal server is reachable through this site's own
  // address (a reverse proxy in front of both, as in `npm run share`).
  if (fromEnv === "same-origin") return window.location.origin;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${DEFAULT_SIGNAL_PORT}`;
}

/** Used if the signaling server can't be reached for ICE config. */
const FALLBACK_ICE: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export async function fetchIceServers(signalUrl: string): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${signalUrl}/ice-servers`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as IceServersResponse;
    return body.iceServers.length ? body.iceServers : FALLBACK_ICE;
  } catch {
    return FALLBACK_ICE;
  }
}

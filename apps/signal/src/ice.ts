import type { IceServer } from "@usap/shared";
import { config } from "./config.js";

/**
 * ICE servers tell the browser how to find a network path to the other peer:
 * - STUN: "what is my public IP:port?" Free, enough for most home networks.
 * - TURN: a relay that forwards the media when a direct path is impossible
 *   (strict NATs, some mobile networks, corporate firewalls).
 *
 * TURN credentials are secrets, so they come from the server's .env and are
 * handed to clients at runtime instead of being baked into the web bundle.
 */
const STUN: IceServer = {
  urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
};

const CACHE_MS = 60 * 60 * 1000;
let cache: { servers: IceServer[]; expiresAt: number } | null = null;

async function fetchMeteredServers(appName: string, apiKey: string): Promise<IceServer[]> {
  const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`Metered responded ${res.status}`);
  const servers = (await res.json()) as IceServer[];
  if (!Array.isArray(servers)) throw new Error("Unexpected Metered response");
  return servers;
}

function staticTurnServers(): IceServer[] {
  const { urls, username, credential } = config.turn;
  if (urls.length === 0 || !username || !credential) return [];
  return [{ urls, username, credential }];
}

export async function getIceServers(): Promise<IceServer[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.servers;

  let turn: IceServer[] = [];
  let fetchFailed = false;
  const { meteredAppName, meteredApiKey } = config.turn;
  if (meteredAppName && meteredApiKey) {
    try {
      turn = await fetchMeteredServers(meteredAppName, meteredApiKey);
    } catch (err) {
      fetchFailed = true;
      console.warn(`[ice] Could not fetch Metered TURN credentials, using static config: ${String(err)}`);
    }
  }
  if (turn.length === 0) turn = staticTurnServers();

  const servers = [STUN, ...turn];
  // After a failed fetch, retry in a minute instead of waiting an hour.
  cache = { servers, expiresAt: Date.now() + (fetchFailed ? 60_000 : CACHE_MS) };
  return servers;
}

export const hasTurnConfigured = (): boolean =>
  Boolean((config.turn.meteredAppName && config.turn.meteredApiKey) || staticTurnServers().length);

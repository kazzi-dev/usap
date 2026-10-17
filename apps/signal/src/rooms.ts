import type { LanguageCode, MediaState, PeerInfo } from "@usap/shared";

/** A participant as the server sees them: public info plus connection bookkeeping. */
interface Participant extends PeerInfo {
  /** Current Socket.IO socket, or null while they are disconnected (inside the grace period). */
  socketId: string | null;
  /** Fires when the grace period runs out and the slot is released. */
  graceTimer: NodeJS.Timeout | null;
}

export type JoinResult =
  | {
      ok: true;
      /** True if the same clientId was already in the room (socket reconnect). */
      resumed: boolean;
      /** On resume: the socket that held the slot before, so the caller can close it. */
      previousSocketId: string | null;
      /** Everyone else in the room. */
      peers: PeerInfo[];
      /** Disconnected "ghost" participants that were removed to make space for this join. */
      evicted: PeerInfo[];
    }
  | { ok: false; error: "room-full" };

export interface RoomManagerOptions {
  /** Max participants per room (2 for a 1-on-1 call). */
  capacity: number;
  /** How long a disconnected participant keeps their slot before being removed. */
  graceMs: number;
}

const toPeerInfo = ({ clientId, name, media, lang }: Participant): PeerInfo => ({
  clientId,
  name,
  media: { ...media },
  lang,
});

/**
 * In-memory room registry. It knows nothing about Socket.IO, which keeps it
 * small and easy to unit test; index.ts wires it to real sockets.
 *
 * Rooms are created on first join and deleted when the last person leaves.
 * State lives in process memory, so restarting the server ends all calls
 * (fine for a single small server; multiple servers would need e.g. Redis).
 */
export class RoomManager {
  private readonly rooms = new Map<string, Map<string, Participant>>();

  constructor(private readonly options: RoomManagerOptions) {}

  join(roomId: string, info: PeerInfo, socketId: string): JoinResult {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }

    // Same clientId = the same browser page coming back after a network blip.
    const existing = room.get(info.clientId);
    if (existing) {
      if (existing.graceTimer) clearTimeout(existing.graceTimer);
      const previousSocketId = existing.socketId;
      existing.graceTimer = null;
      existing.socketId = socketId;
      existing.name = info.name;
      existing.media = { ...info.media };
      existing.lang = info.lang;
      return {
        ok: true,
        resumed: true,
        previousSocketId: previousSocketId === socketId ? null : previousSocketId,
        peers: this.others(roomId, info.clientId),
        evicted: [],
      };
    }

    const evicted: PeerInfo[] = [];
    if (room.size >= this.options.capacity) {
      // A page reload gets a brand-new clientId, while the old one is still
      // holding a slot in its grace period. Free that slot instead of
      // telling the user the room is full.
      const ghost = [...room.values()].find((p) => p.socketId === null);
      if (!ghost) return { ok: false, error: "room-full" };
      this.leave(roomId, ghost.clientId);
      evicted.push(toPeerInfo(ghost));
      room = this.rooms.get(roomId) ?? new Map<string, Participant>();
      this.rooms.set(roomId, room);
    }

    room.set(info.clientId, {
      clientId: info.clientId,
      name: info.name,
      media: { ...info.media },
      lang: info.lang,
      socketId,
      graceTimer: null,
    });
    return {
      ok: true,
      resumed: false,
      previousSocketId: null,
      peers: this.others(roomId, info.clientId),
      evicted,
    };
  }

  /**
   * Called when a socket drops. The participant keeps their slot for
   * `graceMs`; if they don't rejoin in time, they are removed and `onExpire` runs.
   *
   * Returns false if this socket no longer owns the slot (the participant
   * already reconnected on a newer socket), so the caller should ignore it.
   */
  disconnect(roomId: string, clientId: string, socketId: string, onExpire: () => void): boolean {
    const participant = this.rooms.get(roomId)?.get(clientId);
    if (!participant || participant.socketId !== socketId) return false;

    participant.socketId = null;
    participant.graceTimer = setTimeout(() => {
      this.leave(roomId, clientId);
      onExpire();
    }, this.options.graceMs);
    participant.graceTimer.unref?.();
    return true;
  }

  /** Removes a participant right away. Returns true if they were in the room. */
  leave(roomId: string, clientId: string): boolean {
    const room = this.rooms.get(roomId);
    const participant = room?.get(clientId);
    if (!room || !participant) return false;
    if (participant.graceTimer) clearTimeout(participant.graceTimer);
    room.delete(clientId);
    if (room.size === 0) this.rooms.delete(roomId);
    return true;
  }

  /** Socket id of a connected participant, or null if absent / disconnected. */
  socketIdOf(roomId: string, clientId: string): string | null {
    return this.rooms.get(roomId)?.get(clientId)?.socketId ?? null;
  }

  setMedia(roomId: string, clientId: string, media: MediaState): void {
    const participant = this.rooms.get(roomId)?.get(clientId);
    if (participant) participant.media = { ...media };
  }

  setLanguage(roomId: string, clientId: string, lang: LanguageCode): void {
    const participant = this.rooms.get(roomId)?.get(clientId);
    if (participant) participant.lang = lang;
  }

  get(roomId: string, clientId: string): PeerInfo | null {
    const participant = this.rooms.get(roomId)?.get(clientId);
    return participant ? toPeerInfo(participant) : null;
  }

  others(roomId: string, clientId: string): PeerInfo[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return [...room.values()].filter((p) => p.clientId !== clientId).map(toPeerInfo);
  }

  get roomCount(): number {
    return this.rooms.size;
  }
}

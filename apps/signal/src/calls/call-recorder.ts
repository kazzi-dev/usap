import type { CallStore, LineInput, ParticipantInput } from "./call-store.js";

interface LiveCall {
  /** Set once recording has started (a row exists in `calls`). */
  callId: string | null;
  participants: Map<string, ParticipantInput>;
}

export interface RecordingState {
  recording: boolean;
  callId: string | null;
}

export interface CallRecorderEvents {
  /** Recording started or stopped in a room: tell everyone in it. */
  onRecordingChange(roomId: string, state: RecordingState): void;
  /** The last person left a recorded call: time to summarize it. */
  onCallEnded(callId: string): void;
}

/**
 * Follows each room's life and writes it to the database.
 *
 * Rules:
 *  - A transcript is saved only once 2 people are in the room AND at least one
 *    of them is logged in (so the call shows up in someone's history).
 *    Everyone in the room is told, so nobody is recorded without knowing.
 *  - The call ends when the room is empty; then it gets summarized.
 *
 * Events for one room are processed one at a time (a promise chain per room).
 * Database writes are async, and without this a quick "join then leave" could
 * try to end a call whose row hasn't been created yet.
 */
export class CallRecorder {
  private readonly rooms = new Map<string, LiveCall>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly store: CallStore,
    private readonly events: CallRecorderEvents,
    private readonly log: (...args: unknown[]) => void = console.log,
  ) {}

  state(roomId: string): RecordingState {
    const callId = this.rooms.get(roomId)?.callId ?? null;
    return { recording: callId !== null, callId };
  }

  join(roomId: string, participant: ParticipantInput): Promise<void> {
    return this.enqueue(roomId, async () => {
      const live = this.live(roomId);
      const isNew = !live.participants.has(participant.clientId);
      live.participants.set(participant.clientId, participant);

      if (live.callId) {
        if (isNew) await this.store.addParticipant(live.callId, participant);
        return;
      }
      const people = [...live.participants.values()];
      if (people.length >= 2 && people.some((p) => p.userId)) {
        live.callId = await this.store.createCall(roomId);
        for (const p of people) await this.store.addParticipant(live.callId, p);
        this.log(`[room ${roomId}] recording transcript as call ${live.callId}`);
        this.events.onRecordingChange(roomId, this.state(roomId));
      }
    });
  }

  setLanguage(roomId: string, clientId: string, lang: string): void {
    const p = this.rooms.get(roomId)?.participants.get(clientId);
    if (p) p.lang = lang;
  }

  leave(roomId: string, clientId: string): Promise<void> {
    return this.enqueue(roomId, async () => {
      const live = this.rooms.get(roomId);
      if (!live || !live.participants.delete(clientId)) return;
      if (live.callId) await this.store.markParticipantLeft(live.callId, clientId);
      if (live.participants.size > 0) return;

      this.rooms.delete(roomId);
      if (live.callId) {
        await this.store.endCall(live.callId);
        this.log(`[room ${roomId}] call ${live.callId} ended`);
        this.events.onCallEnded(live.callId);
      }
    });
  }

  addLine(roomId: string, line: LineInput): Promise<void> {
    return this.enqueue(roomId, async () => {
      const callId = this.rooms.get(roomId)?.callId;
      if (callId) await this.store.addLine(callId, line);
    });
  }

  private live(roomId: string): LiveCall {
    let live = this.rooms.get(roomId);
    if (!live) {
      live = { callId: null, participants: new Map() };
      this.rooms.set(roomId, live);
    }
    return live;
  }

  private enqueue(roomId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const next = previous
      .then(task)
      // A failed database write is logged, and must not block later events.
      .catch((err: unknown) => this.log(`[room ${roomId}] recorder error: ${String(err)}`));
    this.queues.set(roomId, next);
    void next.finally(() => {
      if (this.queues.get(roomId) === next) this.queues.delete(roomId);
    });
    return next;
  }
}

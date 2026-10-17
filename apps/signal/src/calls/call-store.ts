import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { callParticipants, calls, transcriptLines, type Call } from "../db/schema.js";

export interface ParticipantInput {
  clientId: string;
  name: string;
  lang: string;
  userId: string | null;
}

export interface LineInput {
  speakerClientId: string;
  speakerName: string;
  originalText: string;
  lang: string | null;
  translatedText: string;
  targetLang: string | null;
  spokenAt: number;
  engine: string;
}

export interface CallListItem {
  id: string;
  roomId: string;
  startedAt: Date;
  endedAt: Date | null;
  summaryStatus: Call["summaryStatus"];
  lineCount: number;
  participants: { name: string; lang: string; isYou: boolean }[];
}

/** All SQL about calls lives here, so the rest of the server deals in plain objects. */
export class CallStore {
  constructor(private readonly db: Db) {}

  async createCall(roomId: string): Promise<string> {
    const [row] = await this.db.insert(calls).values({ roomId }).returning({ id: calls.id });
    return row!.id;
  }

  async addParticipant(callId: string, p: ParticipantInput): Promise<void> {
    await this.db.insert(callParticipants).values({ callId, ...p });
  }

  async markParticipantLeft(callId: string, clientId: string): Promise<void> {
    await this.db
      .update(callParticipants)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(callParticipants.callId, callId),
          eq(callParticipants.clientId, clientId),
          isNull(callParticipants.leftAt),
        ),
      );
  }

  async addLine(callId: string, line: LineInput): Promise<void> {
    await this.db.insert(transcriptLines).values({ callId, ...line });
  }

  async endCall(callId: string): Promise<void> {
    await this.db.update(calls).set({ endedAt: new Date() }).where(eq(calls.id, callId));
  }

  async setSummary(
    callId: string,
    update: { status: Call["summaryStatus"]; summary?: Record<string, string> | null; error?: string | null },
  ): Promise<void> {
    await this.db
      .update(calls)
      .set({ summaryStatus: update.status, summary: update.summary ?? null, summaryError: update.error ?? null })
      .where(eq(calls.id, callId));
  }

  /** Everything needed to summarize a call: its lines and who was in it. */
  async summaryInput(callId: string) {
    const lines = await this.db
      .select()
      .from(transcriptLines)
      .where(eq(transcriptLines.callId, callId))
      .orderBy(asc(transcriptLines.spokenAt));
    const participants = await this.db.select().from(callParticipants).where(eq(callParticipants.callId, callId));
    return { lines, participants };
  }

  /** Calls the user took part in, newest first. */
  async listForUser(userId: string, limit = 50): Promise<CallListItem[]> {
    const mine = this.db
      .selectDistinct({ callId: callParticipants.callId })
      .from(callParticipants)
      .where(eq(callParticipants.userId, userId));
    const rows = await this.db
      .select()
      .from(calls)
      .where(inArray(calls.id, mine))
      .orderBy(desc(calls.startedAt))
      .limit(limit);
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const participants = await this.db.select().from(callParticipants).where(inArray(callParticipants.callId, ids));
    const counts = await this.db
      .select({ callId: transcriptLines.callId, n: count() })
      .from(transcriptLines)
      .where(inArray(transcriptLines.callId, ids))
      .groupBy(transcriptLines.callId);
    const countById = new Map(counts.map((c) => [c.callId, Number(c.n)]));

    return rows.map((call) => ({
      id: call.id,
      roomId: call.roomId,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      summaryStatus: call.summaryStatus,
      lineCount: countById.get(call.id) ?? 0,
      participants: uniqueByClient(participants.filter((p) => p.callId === call.id)).map((p) => ({
        name: p.name,
        lang: p.lang,
        isYou: p.userId === userId,
      })),
    }));
  }

  /** One call with its transcript, or null if the user wasn't in it (or it doesn't exist). */
  async getForUser(callId: string, userId: string) {
    const [call] = await this.db.select().from(calls).where(eq(calls.id, callId));
    if (!call) return null;
    const participants = await this.db.select().from(callParticipants).where(eq(callParticipants.callId, callId));
    if (!participants.some((p) => p.userId === userId)) return null; // not yours: behave as if it doesn't exist
    const lines = await this.db
      .select()
      .from(transcriptLines)
      .where(eq(transcriptLines.callId, callId))
      .orderBy(asc(transcriptLines.spokenAt));
    return {
      call,
      participants: uniqueByClient(participants).map((p) => ({
        clientId: p.clientId,
        name: p.name,
        lang: p.lang,
        isYou: p.userId === userId,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      })),
      lines,
    };
  }
}

/** A person who rejoined has several participant rows; show them once. */
function uniqueByClient<T extends { clientId: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((r) => [r.clientId, r])).values()];
}

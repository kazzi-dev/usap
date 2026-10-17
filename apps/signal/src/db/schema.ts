import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Database tables. Drizzle turns these definitions into SQL migrations
 * (npm run db:generate -> apps/signal/drizzle/*.sql), which run automatically
 * when the server starts.
 *
 *   users ─┬─< sessions             (one user, many logged-in devices)
 *          └─< call_participants >── calls ──< transcript_lines
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** scrypt hash, never the password itself (see auth/passwords.ts). */
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Emails are compared case-insensitively: Ana@x.com and ana@x.com are one account.
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the session token. A stolen database doesn't reveal usable tokens. */
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const summaryStatus = pgEnum("summary_status", ["pending", "ready", "failed", "skipped"]);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("room_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    summaryStatus: summaryStatus("summary_status").notNull().default("pending"),
    /** Summary per language, e.g. { "en": "...", "tl": "..." }. */
    summary: jsonb("summary").$type<Record<string, string>>(),
    summaryError: text("summary_error"),
  },
  (t) => [index("calls_started_idx").on(t.startedAt)],
);

export const callParticipants = pgTable(
  "call_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    /** Null for guests (people who joined by link without an account). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    lang: text("lang").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [index("participants_call_idx").on(t.callId), index("participants_user_idx").on(t.userId)],
);

export const transcriptLines = pgTable(
  "transcript_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    speakerClientId: text("speaker_client_id").notNull(),
    speakerName: text("speaker_name").notNull(),
    originalText: text("original_text").notNull(),
    lang: text("lang"),
    translatedText: text("translated_text").notNull(),
    targetLang: text("target_lang"),
    /** When the speech started (ms since epoch), used for ordering. */
    spokenAt: bigint("spoken_at", { mode: "number" }).notNull(),
    engine: text("engine").notNull(),
  },
  (t) => [index("lines_call_time_idx").on(t.callId, t.spokenAt)],
);

export type User = typeof users.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type CallParticipant = typeof callParticipants.$inferSelect;
export type TranscriptLine = typeof transcriptLines.$inferSelect;

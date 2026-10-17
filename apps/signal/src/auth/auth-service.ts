import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions, users, type User } from "../db/schema.js";
import { hashPassword, verifyPassword } from "./passwords.js";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

const SESSION_DAYS = 30;

export class AuthError extends Error {
  constructor(
    readonly code: "email-taken" | "invalid-credentials",
    message: string,
  ) {
    super(message);
  }
}

const toPublic = (u: User): PublicUser => ({ id: u.id, email: u.email, name: u.name });

/** Only the hash of a token is stored; the token itself exists only on the user's device. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/*
 * Accounts and logins.
 *
 * A login creates a random 256-bit session token. The device keeps the token;
 * the database keeps only its SHA-256. Unlike a JWT, a session row can be
 * deleted, so "log out" really ends the session on the server.
 */
export class AuthService {
  constructor(private readonly db: Db) {}

  async signUp(email: string, password: string, name: string): Promise<{ user: PublicUser; token: string }> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()));
    if (existing.length > 0) throw new AuthError("email-taken", "An account with this email already exists.");

    let user: User | undefined;
    try {
      [user] = await this.db
        .insert(users)
        .values({ email, name, passwordHash: await hashPassword(password) })
        .returning();
    } catch (err) {
      // Two sign-ups with the same email at the same moment: the unique index decides.
      if ((err as { code?: string }).code === "23505") {
        throw new AuthError("email-taken", "An account with this email already exists.");
      }
      throw err;
    }
    return { user: toPublic(user!), token: await this.createSession(user!.id) };
  }

  async logIn(email: string, password: string): Promise<{ user: PublicUser; token: string }> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()));
    // Same error whether the email or the password is wrong, so the form can't
    // be used to find out which emails have accounts.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AuthError("invalid-credentials", "Wrong email or password.");
    }
    return { user: toPublic(user), token: await this.createSession(user.id) };
  }

  async userForToken(token: string | undefined | null): Promise<PublicUser | null> {
    if (!token) return null;
    const rows = await this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
    return rows[0] ? toPublic(rows[0].user) : null;
  }

  async logOut(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  /** Housekeeping: drop expired sessions. */
  async deleteExpiredSessions(): Promise<void> {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
    return token;
  }
}

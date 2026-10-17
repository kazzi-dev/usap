import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { ApiError, AuthResponse, CallDetail, CallListItem, IceServersResponse } from "@usap/shared";
import { z } from "zod";
import { AuthError, type AuthService, type PublicUser } from "./auth/auth-service.js";
import type { CallStore } from "./calls/call-store.js";
import { rateLimitByIp } from "./http/rate-limit.js";
import { getIceServers } from "./ice.js";

export interface AppDeps {
  auth: AuthService;
  calls: CallStore;
  corsOrigins: string[];
  /** Re-run the summary for a call (the "Retry" button). */
  summarize: (callId: string) => Promise<void>;
  roomCount: () => number;
  /** Behind a reverse proxy (production), trust X-Forwarded-For for client IPs. */
  trustProxy?: boolean;
}

/** The token from "Authorization: Bearer <token>". */
const bearer = (req: Request) => req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];

const signUpBody = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  name: z.string().trim().min(1, "Enter your name.").max(40),
});
const logInBody = z.object({ email: z.string().max(254), password: z.string().max(200) });

function validationError(res: Response, error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
  const body: ApiError = { error: "Please fix the highlighted fields.", fields };
  res.status(400).json(body);
}

/**
 * HTTP side of the backend: ICE config, accounts, and call history.
 * Socket.IO (live calls) is attached to the same server in index.ts.
 */
export function createApp(deps: AppDeps) {
  const app = express();
  // Proxies on this same machine (nginx, cloudflared, the share proxy) are
  // trusted to report the real client IP in X-Forwarded-For.
  if (deps.trustProxy) app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));

  // CORS: the web app runs on another origin (port 3000 locally, Vercel in production).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (deps.corsOrigins.length === 0 || deps.corsOrigins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const requireUser: RequestHandler = async (req, res, next) => {
    const user = await deps.auth.userForToken(bearer(req));
    if (!user) {
      res.status(401).json({ error: "Please log in." } satisfies ApiError);
      return;
    }
    res.locals.user = user;
    next();
  };
  const currentUser = (res: Response) => res.locals.user as PublicUser;

  // ---------- Public ----------

  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: deps.roomCount() });
  });

  app.get("/ice-servers", async (_req, res) => {
    res.json({ iceServers: await getIceServers() } satisfies IceServersResponse);
  });

  // ---------- Accounts ----------

  const authLimit = rateLimitByIp();

  app.post("/api/auth/signup", authLimit, async (req, res) => {
    const parsed = signUpBody.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
      const { email, password, name } = parsed.data;
      res.status(201).json((await deps.auth.signUp(email, password, name)) satisfies AuthResponse);
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(409).json({ error: err.message, fields: { email: err.message } } satisfies ApiError);
        return;
      }
      throw err;
    }
  });

  app.post("/api/auth/login", authLimit, async (req, res) => {
    const parsed = logInBody.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
      res.json((await deps.auth.logIn(parsed.data.email, parsed.data.password)) satisfies AuthResponse);
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(401).json({ error: err.message } satisfies ApiError);
        return;
      }
      throw err;
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = bearer(req);
    if (token) await deps.auth.logOut(token);
    res.sendStatus(204);
  });

  app.get("/api/me", requireUser, (_req, res) => {
    res.json(currentUser(res));
  });

  // ---------- Call history ----------

  app.get("/api/calls", requireUser, async (_req, res) => {
    const calls = await deps.calls.listForUser(currentUser(res).id);
    const body: CallListItem[] = calls.map((c) => ({
      ...c,
      startedAt: c.startedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() ?? null,
    }));
    res.json(body);
  });

  app.get("/api/calls/:id", requireUser, async (req, res) => {
    const id = String(req.params.id);
    if (!z.uuid().safeParse(id).success) {
      res.status(404).json({ error: "Call not found." } satisfies ApiError);
      return;
    }
    const found = await deps.calls.getForUser(id, currentUser(res).id);
    if (!found) {
      // Same answer for "doesn't exist" and "not yours": don't reveal which calls exist.
      res.status(404).json({ error: "Call not found." } satisfies ApiError);
      return;
    }
    const { call, participants, lines } = found;
    const body: CallDetail = {
      id: call.id,
      roomId: call.roomId,
      startedAt: call.startedAt.toISOString(),
      endedAt: call.endedAt?.toISOString() ?? null,
      summaryStatus: call.summaryStatus,
      summary: call.summary,
      summaryError: call.summaryError,
      participants: participants.map(({ clientId, name, lang, isYou }) => ({ clientId, name, lang, isYou })),
      lines: lines.map((l) => ({
        id: l.id,
        speakerClientId: l.speakerClientId,
        speakerName: l.speakerName,
        originalText: l.originalText,
        lang: l.lang,
        translatedText: l.translatedText,
        targetLang: l.targetLang,
        spokenAt: l.spokenAt,
      })),
    };
    res.json(body);
  });

  app.post("/api/calls/:id/summary", requireUser, async (req, res) => {
    const id = String(req.params.id);
    const found = z.uuid().safeParse(id).success ? await deps.calls.getForUser(id, currentUser(res).id) : null;
    if (!found) {
      res.status(404).json({ error: "Call not found." } satisfies ApiError);
      return;
    }
    if (!found.call.endedAt) {
      res.status(409).json({ error: "The call is still going." } satisfies ApiError);
      return;
    }
    await deps.summarize(id);
    res.sendStatus(204);
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found." } satisfies ApiError);
  });

  // Express 5 forwards errors from async handlers here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[api] unexpected error", err);
    res.status(500).json({ error: "Something went wrong on our side." } satisfies ApiError);
  });

  return app;
}

import type {
  ClientToServerEvents,
  JoinRequest,
  LanguageCode,
  ServerToClientEvents,
  SocketAuth,
} from "@usap/shared";
import type { Server } from "socket.io";
import { processSegment } from "./ai-client.js";
import type { AuthService, PublicUser } from "./auth/auth-service.js";
import type { CallRecorder } from "./calls/call-recorder.js";
import { config } from "./config.js";
import type { RoomManager } from "./rooms.js";

/** Per-socket state. */
export interface SocketData {
  roomId?: string;
  clientId?: string;
  /** Logged-in user, or null for a guest (set once, in the handshake). */
  user: PublicUser | null;
}

export type UsapServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface SocketDeps {
  rooms: RoomManager;
  auth: AuthService;
  recorder: CallRecorder;
  log: (...args: unknown[]) => void;
}

const ROOM_ID = /^[a-z0-9-]{3,64}$/i;
const LANGUAGES = new Set<LanguageCode>(["en", "tl", "ceb", "ja"]);
const isLanguage = (value: unknown): value is LanguageCode => LANGUAGES.has(value as LanguageCode);

function parseJoin(req: unknown): JoinRequest | null {
  if (typeof req !== "object" || req === null) return null;
  const r = req as Partial<JoinRequest>;
  if (typeof r.roomId !== "string" || !ROOM_ID.test(r.roomId)) return null;
  if (typeof r.clientId !== "string" || r.clientId.length === 0 || r.clientId.length > 64) return null;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : "";
  return {
    roomId: r.roomId.toLowerCase(),
    clientId: r.clientId,
    name: name || "Guest",
    media: { audio: r.media?.audio === true, video: r.media?.video === true },
    lang: isLanguage(r.lang) ? r.lang : "en",
  };
}

/** Rooms, WebRTC signaling, subtitles and recording over Socket.IO. */
export function registerSockets(io: UsapServer, { rooms, auth, recorder, log }: SocketDeps) {
  // Handshake: a valid session token makes this socket "logged in"; anything
  // else (no token, expired token) is simply a guest. Guests can still call.
  io.use(async (socket, next) => {
    const { token } = (socket.handshake.auth ?? {}) as SocketAuth;
    socket.data.user = await auth.userForToken(token).catch(() => null);
    next();
  });

  io.on("connection", (socket) => {
    /** Leave the current room on purpose (end call / joining another room). */
    const leaveCurrentRoom = () => {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId) return;
      if (rooms.leave(roomId, clientId)) {
        socket.to(roomId).emit("peer-left", { clientId });
        log(`[room ${roomId}] ${clientId} left`);
        void recorder.leave(roomId, clientId);
      }
      void socket.leave(roomId);
      socket.data.roomId = undefined;
      socket.data.clientId = undefined;
    };

    socket.on("join-room", (rawReq, ack) => {
      if (typeof ack !== "function") return;
      const req = parseJoin(rawReq);
      if (!req) return ack({ ok: false, error: "invalid-request" });

      if (socket.data.roomId && socket.data.roomId !== req.roomId) leaveCurrentRoom();

      const result = rooms.join(req.roomId, req, socket.id);
      if (!result.ok) {
        log(`[room ${req.roomId}] rejected ${req.clientId}: ${result.error}`);
        return ack({ ok: false, error: result.error });
      }

      void socket.join(req.roomId);
      socket.data.roomId = req.roomId;
      socket.data.clientId = req.clientId;

      for (const ghost of result.evicted) {
        socket.to(req.roomId).emit("peer-left", { clientId: ghost.clientId });
        void recorder.leave(req.roomId, ghost.clientId);
      }

      if (result.resumed) {
        // The old socket may not have noticed it's dead yet; close it so it
        // can't send stale messages. Its disconnect handler will ignore it.
        if (result.previousSocketId) io.sockets.sockets.get(result.previousSocketId)?.disconnect(true);
        socket.to(req.roomId).emit("peer-reconnected", { clientId: req.clientId });
        log(`[room ${req.roomId}] ${req.clientId} resumed`);
      } else {
        socket.to(req.roomId).emit("peer-joined", {
          clientId: req.clientId,
          name: req.name,
          media: req.media,
          lang: req.lang,
        });
        const who = socket.data.user ? `${req.name}, user ${socket.data.user.email}` : `${req.name}, guest`;
        log(`[room ${req.roomId}] ${req.clientId} (${who}) joined, ${result.peers.length + 1} in room`);
      }

      ack({ ok: true, peers: result.peers, resumed: result.resumed });

      // Recording: may start now (2nd person, someone logged in). Then tell
      // this socket the current state (the recorder tells the room on changes).
      void recorder
        .join(req.roomId, { clientId: req.clientId, name: req.name, lang: req.lang, userId: socket.data.user?.id ?? null })
        .then(() => socket.emit("call-recording", recorder.state(req.roomId)));
    });

    // Relay offer / answer / ICE candidates. The server never reads the payload.
    socket.on("signal", (msg) => {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId || typeof msg?.to !== "string") return;
      const target = rooms.socketIdOf(roomId, msg.to);
      if (target) io.to(target).emit("signal", { from: clientId, payload: msg.payload });
    });

    socket.on("media-state", (media) => {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId) return;
      const clean = { audio: media?.audio === true, video: media?.video === true };
      rooms.setMedia(roomId, clientId, clean);
      socket.to(roomId).emit("media-state", { clientId, media: clean });
    });

    socket.on("leave-room", (ack) => {
      leaveCurrentRoom();
      if (typeof ack === "function") ack();
    });

    socket.on("set-language", (lang) => {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId || !isLanguage(lang)) return;
      rooms.setLanguage(roomId, clientId, lang);
      recorder.setLanguage(roomId, clientId, lang);
      socket.to(roomId).emit("language-changed", { clientId, lang });
    });

    // Diagnostics only: lets the log answer "why was there no video?"
    socket.on("webrtc-state", (report) => {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId || typeof report?.state !== "string") return;
      const route = report.route ? ` via ${String(report.route).slice(0, 16)}` : "";
      const turn = report.hasTurn ? "TURN available" : "no TURN configured";
      log(`[room ${roomId}] ${clientId} video ${String(report.state).slice(0, 16)}${route} (${turn})`);
    });

    // ---------- Subtitles: speech segment -> AI service -> everyone in the room ----------
    let segmentsInFlight = 0;

    socket.on("audio-segment", (segment) => {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId) return;
      const seq = Number.isInteger(segment?.seq) ? segment.seq : -1;
      // Socket.IO delivers binary data to Node as a Buffer (a Uint8Array).
      const audio = segment?.audio;
      if (!(audio instanceof Uint8Array) || audio.byteLength === 0 || audio.byteLength > config.subtitles.maxSegmentBytes) {
        socket.emit("subtitle-error", { seq, reason: "invalid-audio" });
        return;
      }
      // Backpressure: if the AI service is falling behind, drop new segments
      // instead of building an ever-growing queue of stale subtitles.
      if (segmentsInFlight >= config.subtitles.maxInFlightPerSpeaker) {
        socket.emit("subtitle-error", { seq, reason: "busy" });
        log(`[room ${roomId}] dropped segment ${seq} from ${clientId}: too many in flight`);
        return;
      }

      segmentsInFlight++;
      const durationMs = Number.isFinite(segment.durationMs) ? Math.max(0, segment.durationMs) : 0;
      const segmentId = `${clientId.slice(0, 8)}-${seq}`;
      // Translate into the listener's language (1-on-1: the one other person).
      const speaker = rooms.get(roomId, clientId);
      const speakerLang = speaker?.lang ?? "en";
      const listenerLang = rooms.others(roomId, clientId)[0]?.lang ?? speakerLang;
      void processSegment({
        segmentId,
        speakerId: clientId,
        timestamp: Date.now() - durationMs,
        wav: audio,
        language: speakerLang,
        targetLanguage: listenerLang,
      })
        .then((result) => {
          if (!result.ok) {
            log(`[room ${roomId}] segment ${segmentId} failed (${result.reason}): ${result.detail}`);
            socket.emit("subtitle-error", { seq, reason: result.reason });
            return;
          }
          const { subtitle } = result;
          log(
            `[room ${roomId}] subtitle ${segmentId} engine=${subtitle.engine} audio=${result.audioSeconds}s ` +
              `stt=${result.sttMs}ms translate=${result.translateMs}ms (${speakerLang}->${listenerLang})` +
              (subtitle.originalText ? "" : " (no speech)"),
          );
          // Empty text = silence, noise or a filtered hallucination: nothing to show.
          if (!subtitle.originalText) return;
          io.to(roomId).emit("subtitle", subtitle);
          void recorder.addLine(roomId, {
            speakerClientId: clientId,
            speakerName: speaker?.name ?? "Guest",
            originalText: subtitle.originalText,
            lang: subtitle.lang,
            translatedText: subtitle.translatedText,
            targetLang: subtitle.targetLang,
            spokenAt: subtitle.timestamp,
            engine: subtitle.engine,
          });
        })
        .finally(() => {
          segmentsInFlight--;
        });
    });

    socket.on("disconnect", (reason) => {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId) return;
      const marked = rooms.disconnect(roomId, clientId, socket.id, () => {
        io.to(roomId).emit("peer-left", { clientId });
        log(`[room ${roomId}] ${clientId} did not come back, removed`);
        void recorder.leave(roomId, clientId);
      });
      if (marked) {
        io.to(roomId).emit("peer-disconnected", { clientId });
        log(`[room ${roomId}] ${clientId} disconnected (${reason}), holding slot`);
      }
    });
  });
}

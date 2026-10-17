import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  IceServersResponse,
  JoinRequest,
  LanguageCode,
  ServerToClientEvents,
} from "@usap/shared";
import { processSegment } from "./ai-client.js";
import { config, loadDevCertificate } from "./config.js";
import { getIceServers, hasTurnConfigured } from "./ice.js";
import { RoomManager } from "./rooms.js";

/** Per-socket state: which room/participant this socket belongs to. */
interface SocketData {
  roomId?: string;
  clientId?: string;
}

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);

const rooms = new RoomManager(config.room);

// ---------- Plain HTTP routes (everything that is not Socket.IO) ----------

function setCors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && (config.corsOrigins.length === 0 || config.corsOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  setCors(req, res);
  const path = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" && path === "/health") {
    return sendJson(res, 200, { ok: true, rooms: rooms.roomCount });
  }
  if (req.method === "GET" && path === "/ice-servers") {
    const body: IceServersResponse = { iceServers: await getIceServers() };
    return sendJson(res, 200, body);
  }
  sendJson(res, 404, { error: "not found" });
}

const httpServer = config.https
  ? createHttpsServer(loadDevCertificate(), handleHttp)
  : createHttpServer(handleHttp);

// ---------- Socket.IO: rooms + WebRTC signaling ----------

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: {
    origin: config.corsOrigins.length === 0 ? true : config.corsOrigins,
  },
  // Detect dead connections (e.g. phone lost Wi-Fi) within ~25s instead of the 45s default.
  pingInterval: 10_000,
  pingTimeout: 15_000,
  // Audio segments are binary messages of up to ~1.5 MB.
  maxHttpBufferSize: 2_000_000,
});

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

io.on("connection", (socket) => {
  /** Leave the current room on purpose (end call / joining another room). */
  const leaveCurrentRoom = () => {
    const { roomId, clientId } = socket.data;
    if (!roomId || !clientId) return;
    if (rooms.leave(roomId, clientId)) {
      socket.to(roomId).emit("peer-left", { clientId });
      log(`[room ${roomId}] ${clientId} left`);
    }
    void socket.leave(roomId);
    socket.data = {};
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
    socket.data = { roomId: req.roomId, clientId: req.clientId };

    for (const ghost of result.evicted) {
      socket.to(req.roomId).emit("peer-left", { clientId: ghost.clientId });
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
      log(`[room ${req.roomId}] ${req.clientId} (${req.name}) joined, ${result.peers.length + 1} in room`);
    }

    ack({ ok: true, peers: result.peers, resumed: result.resumed });
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
    socket.to(roomId).emit("language-changed", { clientId, lang });
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
    const speakerLang = rooms.get(roomId, clientId)?.lang ?? "en";
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
        log(
          `[room ${roomId}] subtitle ${segmentId} engine=${result.subtitle.engine} audio=${result.audioSeconds}s ` +
            `stt=${result.sttMs}ms translate=${result.translateMs}ms (${speakerLang}->${listenerLang})` +
            (result.subtitle.originalText ? "" : " (no speech)"),
        );
        // Empty text = silence, noise or a filtered hallucination: nothing to show.
        if (result.subtitle.originalText) io.to(roomId).emit("subtitle", result.subtitle);
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
    });
    if (marked) {
      io.to(roomId).emit("peer-disconnected", { clientId });
      log(`[room ${roomId}] ${clientId} disconnected (${reason}), holding slot`);
    }
  });
});

httpServer.listen(config.port, "0.0.0.0", () => {
  const scheme = config.https ? "https" : "http";
  const lanIps = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
  log(`Signaling server on ${scheme}://localhost:${config.port}`);
  for (const ip of lanIps) log(`  LAN: ${scheme}://${ip}:${config.port}`);
  if (!hasTurnConfigured()) log("No TURN configured (STUN only): fine on the same Wi-Fi, may fail across strict networks.");
});

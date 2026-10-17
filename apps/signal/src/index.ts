import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { AuthService } from "./auth/auth-service.js";
import { CallRecorder } from "./calls/call-recorder.js";
import { CallStore } from "./calls/call-store.js";
import { summarizeCall } from "./calls/summarize.js";
import { config, loadDevCertificate } from "./config.js";
import { openDatabase } from "./db/client.js";
import { hasTurnConfigured } from "./ice.js";
import { RoomManager } from "./rooms.js";
import { registerSockets, type UsapServer } from "./sockets.js";

/*
 * The Usap backend:
 *   - HTTP API (Express): accounts, call history, ICE config      -> app.ts
 *   - Socket.IO: rooms, WebRTC signaling, subtitles, recording    -> sockets.ts
 *   - Postgres: users, sessions, calls, transcripts               -> db/
 */

const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);

const database = await openDatabase(config.databaseUrl);
log(`Database: ${database.kind}`);

const auth = new AuthService(database.db);
const calls = new CallStore(database.db);
const rooms = new RoomManager(config.room);
const summarize = (callId: string) => summarizeCall(calls, callId, log);

let io: UsapServer; // assigned below, once the HTTP server exists
const recorder = new CallRecorder(
  calls,
  {
    onRecordingChange: (roomId, state) => io.to(roomId).emit("call-recording", state),
    // Summaries run in the background; the result appears on the call page.
    onCallEnded: (callId) => void summarize(callId),
  },
  log,
);

const app = createApp({
  auth,
  calls,
  corsOrigins: config.corsOrigins,
  summarize,
  roomCount: () => rooms.roomCount,
  trustProxy: config.trustProxy,
});

const httpServer = config.https ? createHttpsServer(loadDevCertificate(), app) : createHttpServer(app);

io = new Server(httpServer, {
  cors: { origin: config.corsOrigins.length === 0 ? true : config.corsOrigins },
  // Detect dead connections (e.g. phone lost Wi-Fi) within ~25s instead of the 45s default.
  pingInterval: 10_000,
  pingTimeout: 15_000,
  // Audio segments are binary messages of up to ~1.5 MB.
  maxHttpBufferSize: 2_000_000,
});
registerSockets(io, { rooms, auth, recorder, log });

// Housekeeping: expired login sessions.
setInterval(() => void auth.deleteExpiredSessions().catch(() => {}), 60 * 60 * 1000).unref();

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

// Close the database cleanly on Ctrl+C / container stop.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    httpServer.close();
    void database.close().finally(() => process.exit(0));
  });
}

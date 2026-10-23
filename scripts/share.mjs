// npm run share: put Usap on the internet for a test call, behind ONE link.
//
//   friend's browser ─https─▶ Cloudflare ─tunnel─▶ cloudflared (this laptop)
//        ─▶ share proxy :8800 ─┬─ /api, /socket.io, /ice-servers ─▶ signal server :4200
//                              └─ everything else ─────────────────▶ website :3200
//
// A free Cloudflare "quick tunnel" forwards to a single local address, so this
// small proxy puts both servers behind it. The website is built in
// "same-origin" mode: it talks to the signal server through its own address.
// The AI service (port 8000) stays private; only the signal server calls it.
//
// Stop with Ctrl+C. The link changes every time.
//   --no-build   reuse the last website build (faster restarts)
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_PORT = 3200;
const SIGNAL_PORT = 4200;
const PROXY_PORT = 8800;
const DIST_DIR = ".next-share"; // separate build folder, so it can't clash with `npm run dev`

const children = [];
let stopping = false;

const say = (msg) => console.log(`\x1b[35m[share]\x1b[0m ${msg}`);

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

/** Start a long-running process; its output is prefixed with its name. */
function run(name, command, args, { cwd = root, env = {} } = {}) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (line) => line && console.log(`\x1b[90m[${name}]\x1b[0m ${line}`);
  child.stdout.on("data", (d) => String(d).split(/\r?\n/).forEach(prefix));
  child.stderr.on("data", (d) => String(d).split(/\r?\n/).forEach(prefix));
  child.on("exit", (code) => {
    if (!stopping) {
      say(`${name} stopped unexpectedly (exit ${code}). Shutting down.`);
      stopAll(1);
    }
  });
  children.push(child);
  return child;
}

function portInUse(port) {
  return new Promise((done) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.destroy(), done(true)));
    socket.once("error", () => done(false));
  });
}

async function waitFor(url, label, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not start in time`);
}

function findCloudflared() {
  const candidates = ["cloudflared", "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe", "C:\\Program Files\\cloudflared\\cloudflared.exe"];
  return candidates.find((c) => spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0);
}

// ---------- The reverse proxy ----------

const toSignal = (url = "") => /^\/(api\/|socket\.io\/|ice-servers|health)/.test(url);

/** Original headers + X-Forwarded-For, so the backend's rate limiter sees real client IPs. */
function forwardedHeaders(req) {
  const headers = { ...req.headers };
  const client = req.socket.remoteAddress ?? "";
  headers["x-forwarded-for"] = headers["x-forwarded-for"] ? `${headers["x-forwarded-for"]}, ${client}` : client;
  headers["x-forwarded-proto"] ??= "http";
  return headers;
}

function startProxy() {
  const server = http.createServer((req, res) => {
    const port = toSignal(req.url) ? SIGNAL_PORT : WEB_PORT;
    const upstream = http.request(
      { host: "127.0.0.1", port, method: req.method, path: req.url, headers: forwardedHeaders(req) },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Usap is starting or stopped. Try again in a moment.");
    });
    req.pipe(upstream);
  });

  // WebSockets (Socket.IO) start as an HTTP "upgrade" request; after that the
  // proxy just pipes raw bytes both ways.
  server.on("upgrade", (req, socket, head) => {
    const port = toSignal(req.url) ? SIGNAL_PORT : WEB_PORT;
    const upstream = net.connect(port, "127.0.0.1", () => {
      const headers = forwardedHeaders(req);
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (const [key, value] of Object.entries(headers)) {
        for (const v of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${v}`);
      }
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  server.listen(PROXY_PORT, "127.0.0.1");
  return server;
}

// ---------- Main ----------

// Already sharing? Stop here, BEFORE rebuilding: a rebuild under a running
// website replaces its files and breaks its styles for everyone.
if (await portInUse(PROXY_PORT)) {
  say("Usap is already being shared (port 8800 is in use). Nothing to do.");
  say("To restart it, press Ctrl+C in the window that is sharing, then run this again.");
  process.exit(0);
}

if (await portInUse(4000)) {
  say("The dev signal server (port 4000) is running. Stop `npm run dev` first:");
  say("both would open the same local database at the same time.");
  process.exit(1);
}
// --tailscale: a permanent https://<laptop>.<tailnet>.ts.net link (Tailscale
// Funnel) instead of a new random trycloudflare.com link on every start.
const useTailscale = process.argv.includes("--tailscale");
const tailscale = ["tailscale", "C:\\Program Files\\Tailscale\\tailscale.exe"].find(
  (c) => spawnSync(c, ["version"], { stdio: "ignore" }).status === 0,
);
if (useTailscale && !tailscale) {
  say("Tailscale is not installed. On Windows: winget install -e --id Tailscale.Tailscale, then sign in.");
  process.exit(1);
}
const cloudflared = useTailscale ? null : findCloudflared();
if (!useTailscale && !cloudflared) {
  say("cloudflared is not installed. On Windows: winget install -e --id Cloudflare.cloudflared");
  process.exit(1);
}

if (!(await portInUse(8000))) {
  say("Starting the AI service...");
  run("ai", process.execPath, ["scripts/run-ai.mjs"]);
}

const buildDir = resolve(root, "apps/web", DIST_DIR);
if (process.argv.includes("--no-build") && existsSync(buildDir)) {
  say("Reusing the last website build.");
} else {
  say("Building the website (about a minute)...");
  // Run Node directly (no npm/shell needed): copy the VAD files, then `next build`.
  const steps = [
    [resolve(root, "scripts/copy-vad-assets.mjs")],
    [resolve(root, "node_modules/next/dist/bin/next"), "build"],
  ];
  for (const args of steps) {
    const step = spawnSync(process.execPath, args, {
      cwd: resolve(root, "apps/web"),
      stdio: "inherit",
      env: { ...process.env, NEXT_PUBLIC_SIGNAL_URL: "same-origin", USAP_NEXT_DIST_DIR: DIST_DIR },
    });
    if (step.status !== 0) process.exit(step.status ?? 1);
  }
}

run("signal", process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: resolve(root, "apps/signal"),
  env: { SIGNAL_PORT: String(SIGNAL_PORT), TRUST_PROXY: "true", CORS_ORIGINS: "" },
});
run("web", process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "-p", String(WEB_PORT)], {
  cwd: resolve(root, "apps/web"),
  env: { USAP_NEXT_DIST_DIR: DIST_DIR },
});
startProxy();
await waitFor(`http://127.0.0.1:${SIGNAL_PORT}/health`, "signal server");
await waitFor(`http://127.0.0.1:${WEB_PORT}/`, "website");
await waitFor(`http://127.0.0.1:${PROXY_PORT}/health`, "proxy");
say(`Local check: http://localhost:${PROXY_PORT}`);

say(useTailscale ? "Opening the Tailscale Funnel..." : "Opening the Cloudflare tunnel...");
const tunnel = useTailscale
  ? run("tunnel", tailscale, ["funnel", String(PROXY_PORT)])
  : run("tunnel", cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PROXY_PORT}`]);
let announced = false;
const findUrl = (data) => {
  const url = String(data).match(/https:\/\/[a-z0-9.-]+\.(trycloudflare\.com|ts\.net)/)?.[0];
  if (!url || announced) return;
  announced = true;
  console.log(
    `\n\x1b[42m\x1b[30m  Usap is online  \x1b[0m  Send this link: \x1b[1m${url}\x1b[0m\n` +
      "  (it can take ~30 s before the link works; stop sharing with Ctrl+C)\n",
  );
};
tunnel.stdout.on("data", findUrl);
tunnel.stderr.on("data", findUrl);

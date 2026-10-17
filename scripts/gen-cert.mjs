// Generates a self-signed HTTPS certificate for local development.
//
// Why: browsers only allow camera/microphone access on "secure" pages:
// https:// or http://localhost. A phone opening http://192.168.x.x:3000 would
// be blocked, so for testing on another device we serve both apps over HTTPS
// with this certificate (valid for localhost and every LAN IP of this laptop).
//
// The certificate is regenerated whenever the laptop's LAN IPs change.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "certs");
const keyPath = resolve(dir, "dev-key.pem");
const certPath = resolve(dir, "dev-cert.pem");
const ipsPath = resolve(dir, "ips.json");

const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n.address)
  .sort();
const ips = ["127.0.0.1", ...lanIps];

if (existsSync(keyPath) && existsSync(certPath) && existsSync(ipsPath)) {
  const previous = JSON.parse(readFileSync(ipsPath, "utf8"));
  if (JSON.stringify(previous) === JSON.stringify(ips)) {
    console.log("[cert] Dev certificate is up to date.");
    process.exit(0);
  }
}

const pems = selfsigned.generate([{ name: "commonName", value: "usap-dev" }], {
  days: 365,
  keySize: 2048,
  algorithm: "sha256",
  extensions: [
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", serverAuth: true },
    {
      name: "subjectAltName",
      altNames: [{ type: 2, value: "localhost" }, ...ips.map((ip) => ({ type: 7, ip }))],
    },
  ],
});

mkdirSync(dir, { recursive: true });
writeFileSync(keyPath, pems.private);
writeFileSync(certPath, pems.cert);
writeFileSync(ipsPath, JSON.stringify(ips));
console.log(`[cert] Wrote certs/dev-cert.pem for localhost, ${ips.join(", ")}`);

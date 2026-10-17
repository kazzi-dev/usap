// Builds the Android app (apps/mobile) with this laptop's LAN address baked in
// as the default server, so the phone connects without typing an IP.
//
//   npm run build:mobile            -> debug APK (accepts the dev certificate)
//   npm run build:mobile -- --install  -> also installs it on a USB-connected phone
//
// The address can still be changed on the app's home screen ("Server").
import { spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileDir = resolve(root, "apps/mobile");

const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((n) => n && n.family === "IPv4" && !n.internal)?.address;
const signalUrl = process.env.SIGNAL_URL || `https://${lanIp ?? "192.168.1.10"}:4000`;

function flutter(args) {
  console.log(`> flutter ${args.join(" ")}`);
  // One command string + shell: true, so Windows finds flutter.bat. (Our args have no spaces.)
  const result = spawnSync(`flutter ${args.join(" ")}`, { cwd: mobileDir, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

flutter(["build", "apk", "--debug", `--dart-define=SIGNAL_URL=${signalUrl}`]);
console.log(`\nAPK: apps/mobile/build/app/outputs/flutter-apk/app-debug.apk (server: ${signalUrl})`);
if (process.argv.includes("--install")) flutter(["install", "--debug"]);

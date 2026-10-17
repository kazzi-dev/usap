// Copies the voice-activity-detection runtime files into apps/web/public/vad/
// so the browser can load them from our own server (no CDN needed):
//   - the Silero VAD model (.onnx), a tiny neural net that says "is this speech?"
//   - the AudioWorklet that feeds microphone audio to it
//   - the ONNX Runtime WebAssembly files that run the model in the browser
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const vadDist = dirname(require.resolve("@ricky0123/vad-web"));
const ortDist = dirname(require.resolve("onnxruntime-web/wasm"));
const out = resolve(root, "apps/web/public/vad");

const files = [
  [vadDist, "silero_vad_v5.onnx"],
  [vadDist, "vad.worklet.bundle.min.js"],
  [ortDist, "ort-wasm-simd-threaded.wasm"],
  [ortDist, "ort-wasm-simd-threaded.mjs"],
];

mkdirSync(out, { recursive: true });
for (const [dir, name] of files) copyFileSync(resolve(dir, name), resolve(out, name));
console.log(`[vad] Copied ${files.length} files to apps/web/public/vad`);

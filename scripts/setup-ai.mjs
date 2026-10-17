// Creates the Python virtual environment for apps/ai and installs its packages.
// Run once (and again after requirements.txt changes): npm run setup:ai
//
// With --models (npm run setup:models): also installs the one-time conversion
// tools (PyTorch, transformers) and converts NLLB-200 for CTranslate2.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const aiDir = resolve(root, "apps/ai");
const venvDir = resolve(aiDir, ".venv");
export const venvPython =
  process.platform === "win32" ? resolve(venvDir, "Scripts/python.exe") : resolve(venvDir, "bin/python");

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: aiDir });
  return result.status === 0;
}

if (!existsSync(venvPython)) {
  // Try the Windows launcher first, then the usual names on macOS/Linux.
  const candidates = [
    ["py", ["-3.12", "-m", "venv", venvDir]],
    ["python3", ["-m", "venv", venvDir]],
    ["python", ["-m", "venv", venvDir]],
  ];
  const ok = candidates.some(([cmd, args]) => run(cmd, args));
  if (!ok) {
    console.error("Could not create a virtual environment. Install Python 3.12 first (see README).");
    process.exit(1);
  }
}

if (!run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"])) process.exit(1);
if (!run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"])) process.exit(1);
if (process.argv.includes("--models")) {
  if (!run(venvPython, ["-m", "pip", "install", "-r", "requirements-convert.txt"])) process.exit(1);
  if (!run(venvPython, ["-m", "app.prepare_models"])) process.exit(1);
}
console.log("\nAI service environment ready.");

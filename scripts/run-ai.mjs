// Starts the Python AI service from its virtual environment (created by npm run setup:ai).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const aiDir = resolve(root, "apps/ai");
const python =
  process.platform === "win32" ? resolve(aiDir, ".venv/Scripts/python.exe") : resolve(aiDir, ".venv/bin/python");

if (!existsSync(python)) {
  console.error("Python environment missing. Run: npm run setup:ai");
  process.exit(1);
}

const port = process.env.AI_PORT || "8000";
// --test runs the Python unit tests instead of the server.
const args = process.argv.includes("--test")
  ? ["-m", "pytest", "-q"]
  : ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port];
// --reload restarts on code changes. Not used by npm run dev: on Windows the old
// process can keep running (its model worker threads block shutdown) and serve stale code.
if (process.argv.includes("--reload")) args.push("--reload", "--reload-dir", "app");

const child = spawn(python, args, { cwd: aiDir, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

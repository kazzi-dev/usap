// Deploy the backend (signal server + AI service) to a Hugging Face Docker Space.
//
//   node scripts/deploy-hf.mjs <hf-username>/<space-name>
//
// Copies only what the container needs into a temp folder (never .env, never
// node_modules or models) and pushes it to the Space's git repo. Git asks for
// your Hugging Face username and an access token (with write permission) as
// the password, or uses the one your credential manager saved.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const space = process.argv[2];
if (!space || !space.includes("/")) {
  console.error("Usage: node scripts/deploy-hf.mjs <hf-username>/<space-name>");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "usap-hf-"));
const skip = /[\/](node_modules|\.venv|models|dist|\.data|__pycache__|\.pytest_cache)([\/]|$)|[\/]\.env/;
const copy = (path) => cpSync(join(root, path), join(out, path), { recursive: true, filter: (src) => !skip.test(src) });

for (const path of ["apps/ai", "apps/signal", "packages", "package.json", "package-lock.json", "apps/web/package.json"]) copy(path);
cpSync(join(root, "deploy/huggingface/Dockerfile"), join(out, "Dockerfile"));
cpSync(join(root, "deploy/huggingface/README.md"), join(out, "README.md"));
writeFileSync(join(out, ".gitignore"), ".env\nnode_modules/\n");

const git = (...args) => execFileSync("git", args, { cwd: out, stdio: "inherit" });
git("init", "-q", "-b", "main");
git("add", "-A");
git("commit", "-q", "-m", "Deploy Usap backend");
git("push", "--force", `https://huggingface.co/spaces/${space}`, "main");
rmSync(out, { recursive: true, force: true });

const [user, name] = space.toLowerCase().split("/");
console.log(`\nPushed. Build log: https://huggingface.co/spaces/${space}`);
console.log(`Backend URL (once built): https://${user}-${name.replace(/[^a-z0-9]+/g, "-")}.hf.space`);

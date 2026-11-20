// Test gate of the desktop build: `pnpm tauri build` runs this first (beforeBuildCommand in
// src-tauri/tauri.conf.json), so a build with failing tests never produces an installer.
// The work is done by scripts/check.sh at the repository root; this wrapper only exists so
// that SKIP_TESTS=1 works on machines without bash (the Windows release runner, whose
// commits are tested by .github/workflows/ci.yml).
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.SKIP_TESTS === "1") {
  console.log("!! SKIP_TESTS=1: building WITHOUT running the tests.");
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const r = spawnSync("bash", [resolve(root, "scripts/check.sh"), "--no-flutter"], { stdio: "inherit" });
if (r.error) {
  console.error(`check: could not run scripts/check.sh: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);

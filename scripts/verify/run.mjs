/**
 * Run the whole verification suite.
 *
 *   npm run verify              build, serve locally, check everything, tear down
 *   npm run verify -- --live    check the deployed site instead (no build/serve)
 *
 * The browser checks exist because a green build proves almost nothing here: every
 * real bug this project has hit (columns misaligned against their headers, an attn
 * value silently losing its description, a borrowed training pipeline reported as
 * the model's own disclosure) compiled perfectly.
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const LIVE = "https://jvel07.github.io/frontier-models-table/";
const LOCAL = "http://localhost:4173/frontier-models-table/";

const live = process.argv.includes("--live");
const target = live ? LIVE : LOCAL;

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false, ...opts });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch {}
    await wait(500);
  }
  return false;
}

let server;
try {
  // Data extraction and the structural checks need no browser and no server.
  if (run("node", ["scripts/extract-models.mjs"]).status !== 0) process.exit(1);
  console.log("\n──────── structural ────────");
  if (run("node", ["scripts/verify/maps.mjs"]).status !== 0) process.exit(1);

  if (!live) {
    console.log("\n──────── build ────────");
    if (run("npm", ["run", "build"]).status !== 0) process.exit(1);
    server = spawn("npm", ["run", "preview", "--", "--port", "4173"],
      { cwd: ROOT, stdio: "ignore", detached: true });
    if (!(await reachable(target))) {
      console.error("preview server never came up");
      process.exit(1);
    }
  } else {
    console.log(`\nchecking the live site: ${target}`);
    if (!(await reachable(target))) {
      console.error("live site unreachable");
      process.exit(1);
    }
  }

  const suites = ["columns", "detail", "compare", "provenance", "scroll", "attention", "papers"];
  let failed = [];
  for (const s of suites) {
    console.log(`\n──────── ${s} ────────`);
    if (run("node", [`scripts/verify/${s}.mjs`, target]).status !== 0) failed.push(s);
  }

  console.log("\n════════════════════════════");
  if (failed.length) {
    console.error(`FAILED: ${failed.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`All suites passed against ${live ? "the live site" : "the local build"}.`);
  }
} finally {
  if (server) {
    try { process.kill(-server.pid); } catch {}
  }
}

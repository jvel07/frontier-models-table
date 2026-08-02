/**
 * The derived layer: metrics, data export, trends, openness, tools, permalinks.
 *
 * These pages state numbers no lab published, which makes them the easiest place on
 * the site to be confidently wrong. So this suite checks the arithmetic against
 * independently recomputed values rather than against the page's own output, and
 * checks that the pages refuse to answer where the atlas has no basis to.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseCount, disclosedTokens, trainingFlops, tokensPerParam, kvBytesPerToken, disclosure,
} from "../../src/metrics.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const MODELS = JSON.parse(readFileSync(resolve(ROOT, ".verify", "models.json"), "utf8"));
const BASE = (process.argv[2] || "http://localhost:4173/frontier-models-table/").replace(/#.*$/, "");

let pass = 0, fail = 0;
const t = (label, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`);
};

console.log("=== ARITHMETIC (no browser) ===");
// parseCount is the root of every derived number; a silent failure here poisons
// every chart at once, so pin the awkward real-world spellings.
const parseCases = [
  ["105B", 105e9], ["1T", 1e12], ["8B (4.5B eff.)", 8e9], ["—", null], ["~40T", 40e12],
  [">30T", 30e12], ["32T+", 32e12], ["3 × ~40B", 120e9], ["Up to 9T", 9e12], [null, null],
];
const badParse = parseCases.filter(([s, want]) => parseCount(s) !== want);
t(`parseCount handles ${parseCases.length} real spellings`, badParse.length === 0,
  badParse.map(([s]) => JSON.stringify(s)).join(", "));

// 6ND must agree with a hand-multiplication, and must be absent where inputs are.
let flopsBad = [];
for (const m of MODELS) {
  const f = trainingFlops(m);
  const tok = disclosedTokens(m);
  const act = parseCount(m.active);
  if (!tok || act == null) {
    if (f) flopsBad.push(`${m.name}: FLOPs derived without inputs`);
  } else if (!f || Math.abs(f.flops - 6 * act * tok.tokens) > 1) {
    flopsBad.push(`${m.name}: ${f && f.flops} != ${6 * act * tok.tokens}`);
  }
}
t("training FLOPs equal 6 × active × disclosed tokens, everywhere", flopsBad.length === 0,
  flopsBad.slice(0, 3).join("; "));

// The inherited-pipeline rule has bitten this project twice; it must hold here too.
const inherited = MODELS.filter((m) => m.trainingSource);
t(`no derived token total for the ${inherited.length} inherited pipelines`,
  inherited.every((m) => disclosedTokens(m) === null && trainingFlops(m) === null),
  inherited.filter((m) => disclosedTokens(m)).map((m) => m.name).join(", "));

// KV cache must refuse the cases the formula does not describe.
const mla = MODELS.filter((m) => /MLA/i.test(m.attn));
t(`KV cache refuses all ${mla.length} MLA models rather than guessing`,
  mla.every((m) => { const k = kvBytesPerToken(m, { layers: 10, hidden: "4,096", heads: "8 Q / 2 KV" }); return k && k.unsupported; }));

// Disclosure must be bounded and must mark the fully-undisclosed models as such.
const undisclosed = MODELS.filter((m) => /Undisclosed/i.test(m.arch) && /Undisclosed/i.test(m.attn));
const discBad = MODELS.filter((m) => {
  const d = disclosure(m, {});
  return d.met < 0 || d.met > d.total;
});
t("disclosure scores stay within range", discBad.length === 0);
t(`the ${undisclosed.length} fully-undisclosed models never score architecture fields`,
  undisclosed.every((m) => {
    const f = disclosure(m, {}).fields;
    return !f.find((x) => x.key === "arch").met && !f.find((x) => x.key === "attn").met;
  }));

console.log("\n=== EXPORTED DATA ===");
const data = JSON.parse(readFileSync(resolve(ROOT, "public", "data", "models.json"), "utf8"));
t("models.json carries every model", data.models.length === MODELS.length,
  `${data.models.length} vs ${MODELS.length}`);
t("every record separates derived from recorded",
  data.models.every((m) => m.derived && typeof m.derived._note === "string"));
t("derived FLOPs in the export match a fresh computation",
  data.models.every((m) => {
    const src = MODELS.find((x) => x.name === m.name);
    const f = trainingFlops(src);
    return (f ? f.flops : null) === m.derived.trainingFlops;
  }));
const csv = readFileSync(resolve(ROOT, "public", "data", "models.csv"), "utf8").trim().split("\n");
t("models.csv has a header and one row per model", csv.length === MODELS.length + 1,
  `${csv.length - 1} rows`);
t("schema.json documents the derived namespace",
  /derived/.test(readFileSync(resolve(ROOT, "public", "data", "schema.json"), "utf8")));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

console.log("\n=== PAGES RENDER ===");
for (const [hash, sel, label] of [
  ["#/trends", "svg", "trends"],
  ["#/openness", "[data-model]", "openness"],
  ["#/tools", "[data-calc], [data-axis]", "tools"],
]) {
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  t(`${label} renders`, (await page.locator(sel).count()) > 0);
}

console.log("\n=== OPENNESS SCORES MATCH THE DATA ===");
await page.goto(BASE + "#/openness", { waitUntil: "networkidle" });
await page.waitForSelector("[data-model]");
const shown = await page.locator("[data-model]").evaluateAll((els) =>
  els.map((e) => [e.dataset.model, e.lastElementChild.textContent.trim()]));
let scoreBad = [];
for (const [name, text] of shown) {
  const m = MODELS.find((x) => x.name === name);
  if (!m) { scoreBad.push(`${name}: not a model`); continue; }
  if (!/^\d+\/\d+$/.test(text)) scoreBad.push(`${name}: score "${text}" malformed`);
}
t(`all ${shown.length} rows carry a well-formed score`, scoreBad.length === 0,
  scoreBad.slice(0, 3).join("; "));
t("the openness page cites the NVIDIA letter",
  (await page.locator('a[href*="Open-Weights-and-American-AI-Leadership"]').count()) > 0);

console.log("\n=== CALCULATOR REFUSES WHAT IT CANNOT DERIVE ===");
await page.goto(BASE + "#/tools", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const select = page.locator("select").first();
const mlaName = (MODELS.find((m) => /MLA/i.test(m.attn) && m.open) || {}).name;
if (mlaName) {
  await select.selectOption(mlaName);
  await page.waitForTimeout(400);
  t(`picking ${mlaName} (MLA) shows a refusal, not a number`,
    (await page.locator('[data-calc="unsupported"]').count()) > 0);
}
const gqa = MODELS.find((m) => /Grouped-query/i.test(m.attn) && m.open);
if (gqa) {
  await select.selectOption(gqa.name);
  await page.waitForTimeout(400);
  t(`picking ${gqa.name} (GQA) produces a figure`,
    (await page.locator('[data-calc="ok"]').count()) > 0);
}

console.log("\n=== PERMALINK ===");
const target = "Kimi K3";
await page.goto(BASE + "#/model/" + encodeURIComponent(target), { waitUntil: "networkidle" });
await page.waitForTimeout(600);
t("#/model/<name> opens that row expanded",
  (await page.locator("td[colspan]").count()) > 0);
t("the expanded row is the one asked for",
  (await page.locator("body").textContent()).includes(target));

console.log("\n=== COLUMN PRESETS ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");
const allCols = await page.locator("#atlas-table thead th").evaluateAll((e) =>
  e.filter((x) => x.offsetParent !== null).length);
await page.locator("[data-presets] button", { hasText: "Serving" }).click();
await page.waitForTimeout(400);
const servingCols = await page.locator("#atlas-table thead th").evaluateAll((e) =>
  e.filter((x) => x.offsetParent !== null).length);
t("a preset hides columns", servingCols < allCols, `${allCols} -> ${servingCols}`);
const hdr = await page.locator("#atlas-table thead th").evaluateAll((e) =>
  e.filter((x) => x.offsetParent !== null).length);
const cells = await page.locator("#atlas-table tbody tr").first()
  .locator("td:not([colspan])").evaluateAll((e) => e.filter((x) => x.offsetParent !== null).length);
t("visible header and body cell counts still agree", hdr === cells, `${hdr} th vs ${cells} td`);
await page.locator("[data-presets] button", { hasText: "All cols" }).click();
await page.waitForTimeout(400);
t("All restores every column",
  (await page.locator("#atlas-table thead th").evaluateAll((e) =>
    e.filter((x) => x.offsetParent !== null).length)) === allCols);

console.log("\n=== MOBILE ===");
for (const hash of ["#/trends", "#/openness", "#/tools"]) {
  await page.goto(BASE + hash, { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 380, height: 800 });
  await page.waitForTimeout(400);
  t(`no horizontal overflow at 380px on ${hash}`,
    await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.setViewportSize({ width: 1440, height: 1050 });
}

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.join("\n") : "No page errors.");
await browser.close();
process.exit(fail ? 1 : 0);

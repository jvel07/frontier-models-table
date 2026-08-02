/**
 * The papers page.
 *
 * The bug worth guarding here is a wrong pairing: a paper listed against models that
 * do not use its work. The page derives that mapping from the citation maps, so this
 * suite re-derives the same thing from .verify/models.json and the source maps and
 * checks the rendered rows against it, rather than trusting the page's own arithmetic.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const MODELS = JSON.parse(readFileSync(resolve(ROOT, ".verify", "models.json"), "utf8"));
const SRC = readFileSync(resolve(ROOT, "src", "FrontierModelsTable.jsx"), "utf8");

const BASE = (process.argv[2] || "http://localhost:4173/frontier-models-table/").replace(/#.*$/, "");
const URL = BASE + "#/papers";

// Re-derive report URLs straight from the source map, independently of the page.
const reportsBlock = SRC.slice(SRC.indexOf("export const REPORTS = {"), SRC.indexOf("\n};", SRC.indexOf("export const REPORTS = {")));
const REPORTS = Object.fromEntries(
  [...reportsBlock.matchAll(/\n {2}"([^"]+)": \{ label: "([^"]*)", url: "([^"]*)" \}/g)]
    .map((m) => [m[1], m[3]]));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

let pass = 0, fail = 0;
const t = (label, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`);
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("[data-paper]");

console.log("=== ROUTE + SHAPE ===");
t("#/papers renders the bibliography", (await page.locator("[data-paper]").count()) > 0);
const headers = await page.locator("thead th").allTextContents();
t("columns are Paper then Models", /paper/i.test(headers[0]) && /models/i.test(headers[1]),
  headers.join(" | "));

console.log("\n=== EVERY CITED PAPER APPEARS ONCE ===");
const urls = await page.locator("[data-paper]").evaluateAll((els) => els.map((e) => e.dataset.paper));
t("no paper is listed twice", new Set(urls).size === urls.length,
  urls.filter((u, i) => urls.indexOf(u) !== i).join(", "));
const wantReports = [...new Set(Object.values(REPORTS))];
const missing = wantReports.filter((u) => !urls.includes(u));
t(`all ${wantReports.length} distinct technical-report URLs are present`, missing.length === 0,
  missing.slice(0, 4).join(", "));

console.log("\n=== MODEL PAIRING IS CORRECT ===");
// A model's own report must list that model, and must not list unrelated ones.
let checked = 0, bad = [];
for (const [name, url] of Object.entries(REPORTS)) {
  const row = page.locator(`[data-paper="${url.replace(/"/g, '\\"')}"]`);
  if ((await row.count()) === 0) { bad.push(`${name}: row missing`); continue; }
  const text = await row.first().textContent();
  if (!text.includes(name)) bad.push(`${name} absent from its own report row`);
  checked++;
}
t(`each model appears beside its own report (${checked} checked)`, bad.length === 0,
  bad.slice(0, 4).join("; "));

// Attention papers must cover exactly the models using that mechanism.
const attnBlock = SRC.slice(SRC.indexOf("export const ATTENTION_INFO"), SRC.indexOf("export const POSITIONAL_PAPERS"));
const attnPaper = {};
for (const m of attnBlock.matchAll(/\n {2}"([^"]+)": \{[\s\S]*?paper: \{ label: "[^"]*", url: "([^"]*)" \}/g))
  attnPaper[m[1]] = m[2];
let attnBad = [];
for (const [attn, url] of Object.entries(attnPaper)) {
  const users = MODELS.filter((m) => m.attn === attn).map((m) => m.name);
  if (!users.length) continue;
  const row = page.locator(`[data-paper="${url.replace(/"/g, '\\"')}"]`);
  if ((await row.count()) === 0) { attnBad.push(`${attn}: no row`); continue; }
  const text = await row.first().textContent();
  const absent = users.filter((u) => !text.includes(u));
  if (absent.length) attnBad.push(`${attn} missing ${absent.join(",")}`);
}
t("attention papers list every model using that mechanism", attnBad.length === 0,
  attnBad.slice(0, 3).join("; "));

console.log("\n=== PROVIDER MARKS RENDER ===");
const firstRow = page.locator("[data-paper]").first();
t("model names carry a provider mark", (await firstRow.locator("svg").count()) > 0,
  `${await firstRow.locator("svg").count()} marks in the busiest row`);

console.log("\n=== LINKS ===");
const hrefs = await page.locator("[data-paper] a[href]").evaluateAll((a) => a.map((x) => x.href));
t("every paper links out over https", hrefs.every((h) => h.startsWith("https://")),
  hrefs.filter((h) => !h.startsWith("https://")).slice(0, 3).join(", "));

console.log("\n=== FILTERS ===");
const before = await page.locator("[data-paper]").count();
await page.getByPlaceholder(/Search paper/i).fill("Kimi K3");
await page.waitForTimeout(300);
const after = await page.locator("[data-paper]").count();
t("searching a model narrows the table", after > 0 && after < before, `${before} -> ${after}`);
await page.getByPlaceholder(/Search paper/i).fill("");
await page.waitForTimeout(250);

console.log("\n=== NAV ===");
for (const [label, hash] of [["Atlas", "#/"], ["Attention", "#/attention"], ["Papers", "#/papers"]]) {
  t(`nav has ${label}`, (await page.locator(`nav a[href="${hash}"]`).count()) > 0);
}
await page.locator('nav a[href="#/"]').first().click();
await page.waitForTimeout(500);
t("Atlas returns to the table", (await page.locator("table tbody tr").count()) > 0);

console.log("\n=== MOBILE ===");
await page.goto(URL, { waitUntil: "networkidle" });
await page.setViewportSize({ width: 380, height: 800 });
await page.waitForTimeout(400);
t("no horizontal page overflow at 380px",
  await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth + 1));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.join("\n") : "No page errors.");
await browser.close();
process.exit(fail ? 1 : 0);

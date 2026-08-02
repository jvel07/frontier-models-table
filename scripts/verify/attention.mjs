/**
 * The attention menu page.
 *
 * The failure this guards against is the same one maps.mjs guards on the table:
 * EXPLAIN is keyed by the exact `attn` string, so renaming a mechanism in MODELS
 * without renaming it here silently drops that mechanism off the page. A build
 * would not notice, and neither would a glance — the page just gets shorter.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const MODELS = JSON.parse(readFileSync(resolve(ROOT, ".verify", "models.json"), "utf8"));

const BASE = process.argv[2] || "http://localhost:4173/frontier-models-table/";
const URL = BASE.replace(/#.*$/, "") + "#/attention";

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
await page.waitForSelector("[data-attn]");

console.log("=== ROUTE ===");
t("#/attention renders the menu, not the table", (await page.locator("table tbody tr").count()) === 0);
t("page has its own h1", /avoid re-reading/i.test(await page.locator("h1").first().textContent()));

console.log("\n=== EVERY MECHANISM IN USE IS EXPLAINED ===");
// "Undisclosed" is not a mechanism; the page covers it in prose instead of a card.
const used = [...new Set(MODELS.map((m) => m.attn))].filter((a) => a !== "Undisclosed");
const carded = await page.locator("[data-attn]").evaluateAll((els) => els.map((e) => e.dataset.attn));
const missing = used.filter((a) => !carded.includes(a));
const orphan = carded.filter((a) => !used.includes(a));
t(`all ${used.length} mechanisms in MODELS have a card`, missing.length === 0, missing.join(", "));
t("no card explains a mechanism nothing uses", orphan.length === 0, orphan.join(", "));

console.log("\n=== EACH CARD IS ACTUALLY POPULATED ===");
for (const a of carded) {
  const card = page.locator(`[data-attn="${a.replace(/"/g, '\\"')}"]`);
  const text = await card.textContent();
  const svgs = await card.locator("svg").count();
  const ok = text.length > 300 && svgs >= 1 && /gives up/i.test(text);
  t(`"${a}" has prose, a figure and a stated cost`, ok, `${text.length} chars, ${svgs} svg`);
}

console.log("\n=== MODEL ATTRIBUTION MATCHES THE DATA ===");
// A card claiming the wrong models is the "one model's figures as another's" bug
// in a new place, so check the counts against MODELS rather than trusting the page.
for (const a of carded) {
  const want = MODELS.filter((m) => m.attn === a).map((m) => m.name);
  const text = await page.locator(`[data-attn="${a.replace(/"/g, '\\"')}"]`).textContent();
  const listed = want.filter((n) => text.includes(n));
  t(`"${a}" names all ${want.length} of its models`, listed.length === want.length,
    want.filter((n) => !listed.includes(n)).join(", "));
}

console.log("\n=== CITATIONS ===");
const links = await page.locator('[data-attn] a[href^="http"]').evaluateAll((a) =>
  a.map((x) => x.getAttribute("href")));
t("every citation points at arxiv or a lab domain", links.every((h) => /^https:\/\//.test(h)),
  links.filter((h) => !/^https:\/\//.test(h)).join(", "));
t("at least one paper is cited", links.length > 0, `${links.length} citations`);

console.log("\n=== REACHABLE FROM THE TABLE, AND BACK AGAIN ===");
await page.goto(BASE.replace(/#.*$/, ""), { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");
const entry = page.locator('nav a[href="#/attention"]');
t("the table's nav links to the menu", (await entry.count()) > 0);
await entry.first().click();
await page.waitForTimeout(500);
t("that link opens the menu", (await page.locator("[data-attn]").count()) > 0);
await page.locator('nav a[href="#/"]').first().click();
await page.waitForTimeout(500);
t("nav returns to the table", (await page.locator("table tbody tr").count()) > 0);

console.log("\n=== MOBILE ===");
await page.goto(URL, { waitUntil: "networkidle" });
await page.setViewportSize({ width: 380, height: 800 });
await page.waitForTimeout(400);
t("no horizontal overflow at 380px",
  await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth + 1));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.join("\n") : "No page errors.");
await browser.close();
process.exit(fail ? 1 : 0);

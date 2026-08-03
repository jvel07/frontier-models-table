import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const MODELS = JSON.parse(readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".verify", "models.json"), "utf8"));

const URL = process.argv[2] || "http://localhost:4173/frontier-models-table/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");

// make sure no filters/search narrow the set, and sort by name for a stable 1:1 mapping
await page.getByPlaceholder("Search model or provider…").fill("");
for (const g of await page.getByRole("button", { name: "All", exact: true }).all()) await g.click();
await page.waitForTimeout(200);
await page.locator("thead th").filter({ hasText: "Model" }).first().click(); // asc
await page.waitForTimeout(200);
if ((await page.locator("table tbody tr td:first-child").first().textContent()).includes("▸Z"))
  await page.locator("thead th").filter({ hasText: "Model" }).first().click();
await page.waitForTimeout(200);

const headers = await page.locator("thead th").allTextContents();
console.log("Header order:", headers.map((h) => h.replace(/[↕↑↓]/g, "").trim()).join(" | "));

const rows = await page.locator("table tbody tr").filter({ has: page.locator("td:not([colspan])") }).all();
let fail = 0, pass = 0;
const byName = Object.fromEntries(MODELS.map((m) => [m.name, m]));

function fmtTokens(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return Math.round(n / 1000) + "K";
  return String(n);
}

if (rows.length !== 59) { console.log(`FAIL row count: ${rows.length} (expected 59)`); fail++; }

for (const row of rows) {
  const cells = await row.locator("td").allTextContents();
  // provider marks add glyphs to the name cell, so trust the row's data-model attr
  const name = (await row.getAttribute("data-model")) || cells[0].replace("▸", "").trim();
  const m = byName[name];
  if (!m) { console.log(`FAIL unknown model rendered: "${name}"`); fail++; continue; }

  // Indices are positional, so they all shift when a column is inserted. Coding sits
  // between Intelligence and Released; attention (index 9) has no source field to diff.
  const checks = [
    ["intel", cells[1].trim(), m.intel == null ? "—" : String(m.intel)],
    ["coding", cells[2].trim(), m.coding == null ? "—" : String(m.coding)],
    ["released", cells[3].trim(), m.released],
    ["provider", cells[4].trim(), m.provider],
    ["type", cells[5].trim(), m.type],
    ["arch", cells[6].trim(), m.arch],
    ["params", cells[7].trim(), m.params],
    ["active", cells[8].trim(), m.active],
    ["modality", cells[10].trim(), m.modality],
    ["context", cells[11].trim(), fmtTokens(m.context)],
    ["maxOut", cells[12].trim(), fmtTokens(m.maxOut)],
    ["license", cells[13].trim(), m.license],
  ];
  // released must never look like a score, and vice versa — the exact bug reported.
  // With two adjacent score columns this also catches the two being swapped into
  // each other's slot, which no per-cell diff above would notice on its own.
  if (!/^\d{4}\/\d{2}$/.test(cells[3].trim())) {
    console.log(`FAIL "${name}": Released column ("${cells[3].trim()}") is not a YYYY/MM date`); fail++;
  }
  for (const [label, idx] of [["Intelligence", 1], ["Coding", 2]]) {
    const v = cells[idx].trim();
    if (v !== "—" && !/^\d+$/.test(v)) {
      console.log(`FAIL "${name}": ${label} column ("${v}") is not a bare number`); fail++;
    }
  }
  for (const [field, got, want] of checks) {
    if (got !== want) {
      console.log(`FAIL "${name}".${field}: rendered "${got}" !== expected "${want}"`);
      fail++;
    } else pass++;
  }
}

console.log(`\n${pass} field checks passed, ${fail} failed, across ${rows.length} rows`);
await browser.close();
process.exit(fail ? 1 : 0);

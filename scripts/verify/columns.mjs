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
await page.locator("[data-search]").fill("");
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

// Derived from the data, not a literal: a hardcoded count turns every model
// addition into a failing suite, which trains people to edit the test.
if (rows.length !== MODELS.length) { console.log(`FAIL row count: ${rows.length} (expected ${MODELS.length})`); fail++; }

for (const row of rows) {
  const cells = await row.locator("td").allTextContents();
  // provider marks add glyphs to the name cell, so trust the row's data-model attr
  const name = (await row.getAttribute("data-model")) || cells[0].replace("▸", "").trim();
  const m = byName[name];
  if (!m) { console.log(`FAIL unknown model rendered: "${name}"`); fail++; continue; }

  // Indices are positional, so they all shift when a column moves. Order is Model,
  // the three Artificial Analysis scores, then what the model is — architecture,
  // params, attention, context — then provenance. Attention (index 6) has no source
  // field to diff against.
  const checks = [
    ["intel", cells[1].trim(), m.intel == null ? "—" : String(m.intel)],
    // The coding-agent cell prints the harness under the score, because the figure
    // describes the pair. Asserting on both is the point: a score that lost its
    // harness is the failure this column has to be protected against.
    ["codingAgent", cells[2].trim().replace(/\s+/g, " "),
      m.codingAgent == null ? "—" : `${m.codingAgent} via ${m.codingAgentVia}`],
    ["agentic", cells[3].trim(), m.agentic == null ? "—" : String(m.agentic)],
    ["arch", cells[4].trim(), m.arch],
    // Total and active share a cell. Checking the joined string is what stops the
    // two halves being silently swapped, which neither figure alone would catch.
    ["params", cells[5].trim().replace(/\s+/g, " "),
      m.active === "—" || m.active === m.params ? m.params : `${m.params} / ${m.active}`],
    ["context", cells[7].trim(), fmtTokens(m.context)],
    ["released", cells[8].trim(), m.released],
    ["provider", cells[9].trim(), m.provider],
    ["type", cells[10].trim(), m.type],
    ["modality", cells[11].trim(), m.modality],
    ["maxOut", cells[12].trim(), fmtTokens(m.maxOut)],
    ["license", cells[13].trim(), m.license],
  ];
  // released must never look like a score, and vice versa — the exact bug reported.
  // With three adjacent score columns this also catches any two being swapped into
  // each other's slot, which no per-cell diff above would notice on its own.
  if (!/^\d{4}\/\d{2}$/.test(cells[8].trim())) {
    console.log(`FAIL "${name}": Released column ("${cells[8].trim()}") is not a YYYY/MM date`); fail++;
  }
  for (const [label, idx] of [["Intelligence", 1], ["Agentic", 3]]) {
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

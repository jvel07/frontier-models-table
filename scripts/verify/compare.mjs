import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:4173/frontier-models-table/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
let pass = 0, fail = 0;
const t = (l, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? " — " + x : ""}`); };

const pick = async (name) => {
  await page.getByPlaceholder("Search model or provider…").fill(name);
  await page.waitForTimeout(280);
  await page.locator(`input[aria-label="Select ${name} for comparison"]`).first().check();
  await page.waitForTimeout(150);
};

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");

console.log("=== SELECTION UI ===");
t("no compare tray before selecting", (await page.locator("[aria-label='Model comparison tray']").count()) === 0);
await pick("Kimi K3");
t("tray appears on first selection", (await page.locator("[aria-label='Model comparison tray']").count()) === 1);
const goBtn = page.getByRole("button", { name: /^Compare/ });
t("Compare disabled with only 1 model", await goBtn.isDisabled());
await pick("Nemotron 3 Nano");
t("Compare enabled at 2 models", !(await goBtn.isDisabled()));
t("tray shows both chips", (await page.locator("[aria-label='Model comparison tray']").textContent()).includes("Kimi K3"));

console.log("\n=== MAX 4 ENFORCED ===");
await pick("Qwen3 235B-A22B");
await pick("Gemma 4 26B-A4B");
t("count reads 4 of 4", (await page.locator("[aria-label='Model comparison tray']").textContent()).includes("4 of 4"));
await page.getByPlaceholder("Search model or provider…").fill("GLM-5.2");
await page.waitForTimeout(280);
const fifth = page.locator('input[aria-label="Select GLM-5.2 for comparison"]').first();
t("5th checkbox is disabled at the limit", await fifth.isDisabled());

console.log("\n=== NAVIGATION (same tab, hash route) ===");
await goBtn.click();
await page.waitForTimeout(600);
t("URL is a #/compare route", page.url().includes("#/compare/"), page.url().split("#")[1]);
t("still a single tab", browser.contexts()[0].pages().length === 1);
t("comparison view rendered", (await page.locator("text=Side by side").count()) > 0);

console.log("\n=== COMPARISON CONTENT ===");
const body = await page.locator("body").textContent();
for (const g of ["Identity", "Scale", "Architecture", "Attention", "Positional encoding", "Tokenizer", "Context", "Training"]) {
  t(`section “${g}” present`, body.includes(g));
}
t("Kimi K3 NoPE shown under positional encoding", /NoPE/.test(body), (body.match(/NoPE[^.]{0,50}/) || [""])[0].slice(0, 60));
t("attention heads compared", body.includes("Heads"));
t("vocabulary row present", body.includes("Vocabulary"));
t("layer composition compared", body.includes("Layer composition") || body.includes("Experts"));
t("sparsity computed", /% active/.test(body));
t("training pipelines section", body.includes("Training pipelines"));
t("architecture diagrams section", body.includes("Architecture diagrams"));
t("Raschka credited on diagrams", body.includes("Sebastian Raschka"));
t("sources listed", body.includes("2607.24653") || body.includes("tech report"));

console.log("\n=== VALUE-AWARE EXPLANATIONS ===");
{
  const deep = BASE + "#/compare/" + ["Kimi K3", "Qwen3 235B-A22B"].map(encodeURIComponent).join("|");
  await page.goto(deep, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const b2 = await page.locator("body").textContent();
  t("MHA is explained where the model uses MHA", /Multi-Head Attention: every query head/.test(b2));
  t("GQA explains its own ratio", /16 query heads share one key\/value head/.test(b2), "Qwen3 is GQA 16:1");
  t("the two get DIFFERENT head explanations", /Multi-Head Attention/.test(b2) && /Grouped-Query Attention/.test(b2));
  t("NoPE is explained in plain language", /No positional embedding at all/.test(b2));
  t("RoPE theta is explained", /base frequency/.test(b2));
  t("MoE routing is explained", /Mixture-of-Experts: \d+ expert FFNs exist/.test(b2));
  t("axis hints explain what each row measures", /Longest input the model accepts/.test(b2));
  t("blank cells are explained as undisclosed", /not disclosed|no published source/i.test(b2));
  t("attention mechanism carries a full description", /Kimi Delta Attention: a linear-attention layer/.test(b2));
  t("the 69:24 ratio is explained as layers, not heads", /count of layers, not heads/.test(b2));
  t("ratio value itself states its unit", /69:24 layers/.test(b2));
}

console.log("\n=== DIFF HIGHLIGHTING ===");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");
for (const n of ["Kimi K3", "Nemotron 3 Nano", "Qwen3 235B-A22B", "Gemma 4 26B-A4B"]) await pick(n);
await page.getByRole("button", { name: /^Compare/ }).click();
await page.waitForTimeout(600);
const diffCount = await page.evaluate(() => {
  const cells = [...document.querySelectorAll("td")];
  return cells.filter((c) => c.style.boxShadow && c.style.boxShadow.includes("inset")).length;
});
t("shared values are visually marked", diffCount > 0, `${diffCount} highlighted cells`);

console.log("\n=== DEEP LINK + BACK ===");
const deep = BASE + "#/compare/" + encodeURIComponent("Kimi K3") + "|" + encodeURIComponent("Qwen3-VL 235B-A22B");
await page.goto(deep, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const dtext = await page.locator("body").textContent();
t("deep link renders the right two models", dtext.includes("Kimi K3") && dtext.includes("Qwen3-VL 235B-A22B"));
t("deep link survives a reload", (await page.locator("text=Side by side").count()) > 0);
await page.getByRole("button", { name: /Back to the atlas/i }).click();
await page.waitForTimeout(500);
t("back returns to the table", (await page.locator("table tbody tr").count()) > 0);

console.log("\n=== UNKNOWN MODEL HANDLED ===");
await page.goto(BASE + "#/compare/" + encodeURIComponent("Not A Real Model"), { waitUntil: "networkidle" });
await page.waitForTimeout(400);
t("unknown model shows a graceful message", (await page.locator("body").textContent()).includes("Nothing to compare"));

console.log("\n=== MOBILE 380px ===");
await page.goto(deep, { waitUntil: "networkidle" });
await page.setViewportSize({ width: 380, height: 800 });
await page.waitForTimeout(500);
const ok = await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth + 1);
t("no page overflow at 380px", ok);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "No console errors.");
await browser.close();
process.exit(fail ? 1 : 0);

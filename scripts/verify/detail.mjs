import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:4173/frontier-models-table/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

let pass = 0, fail = 0;
const t = (label, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? " — " + extra : ""}`); };

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector("table tbody tr");
const dataRows = () => page.locator("table tbody tr").filter({ has: page.locator("td:not([colspan])") });

console.log("=== #2 TITLE ===");
t('page <title> is "The Model Atlas"', (await page.title()) === "The Model Atlas", `got "${await page.title()}"`);

console.log("\n=== #3/#4 INTELLIGENCE COLUMN ===");
const headers = await page.locator("thead th").allTextContents();
t("Intelligence is the 2nd column", headers[1].includes("Intelligence"), `headers: ${headers.slice(0, 4).join(" | ")}`);
t("Intelligence header credits Artificial Analysis", headers[1].includes("Artificial Analysis"));
t("Coding is the 3rd column, credited to AA", headers[2].includes("Coding") && headers[2].includes("Artificial Analysis"),
  `headers[2]: ${headers[2]}`);
t("default sort is Intelligence, descending", (await page.locator("thead th").nth(1).locator("span").first().locator("span").textContent()) === "↓");
const firstFewIntel = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
const nums = firstFewIntel.slice(0, 8).map((s) => parseInt(s)).filter((n) => !Number.isNaN(n));
const sorted = [...nums].every((v, i) => i === 0 || nums[i - 1] >= v);
t("rows are actually sorted by intelligence desc", sorted, nums.join(","));
await page.locator("thead th").filter({ hasText: "Intelligence" }).first().hover();
await page.waitForTimeout(300);
const tipText = await page.locator("body").evaluate(() => document.body.innerText);
t("hovering Intelligence header shows AA tooltip", tipText.includes("Artificial Analysis Intelligence Index"));

console.log("\n=== #5 READABILITY: clamp + reader modal ===");
await page.getByPlaceholder("Search model or provider…").fill("Kimi K3");
await page.waitForTimeout(250);
await page.locator("table tbody tr").first().click();
await page.waitForTimeout(400);
// architecture notes now render as separate statements, clamped by count
const bullets = page.locator("td[colspan] ul li");
const nBullets = await bullets.count();
t("architecture notes render as separate statements", nBullets > 0, `${nBullets} bullets shown`);
t("long notes are clamped to a few statements", nBullets <= 3, `${nBullets} shown inline`);
const showMoreBtn = page.locator("td[colspan] button", { hasText: /more note/ });
t('"N more notes" button present for a long note', (await showMoreBtn.count()) > 0);
await showMoreBtn.first().click();
await page.waitForTimeout(400);
const reader = page.locator("[role=dialog]").filter({ hasText: "Architecture notes" });
t("reader modal opens", (await reader.count()) > 0);
const readerText = await reader.first().textContent();
t("reader shows the full note", readerText.includes("tech report concedes it still trails Claude Fable 5"));
t("reader shows every statement", (await reader.locator("ul li").count()) > nBullets);
t("reader shows training pipeline", readerText.includes("Pre-training") && readerText.includes("MOPD"));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
t("Esc closes reader", (await page.locator("[role=dialog]").count()) === 0);

console.log("\n=== #6/#7 DATA CURRICULUM + PIPELINE PHASES ===");
await page.getByPlaceholder("Search model or provider…").fill("GLM-5");
await page.waitForTimeout(250);
const rows = await page.locator("table tbody tr[data-model]").evaluateAll(els => els.map(e => e.dataset.model));
t("GLM-5 (exact) row found", rows.includes("GLM-5"), rows.join(","));
const glm5Row = page.locator('table tbody tr[data-model="GLM-5"]');
await glm5Row.first().click();
await page.waitForTimeout(400);
const glmText = await page.locator("td[colspan]").first().textContent();
t("GLM-5 has explicit SFT stage", glmText.includes("SFT"));
t("GLM-5 has explicit Pre-training stage", glmText.includes("Pre-training"));
t("GLM-5 shows a curriculum flag", glmText.includes("data curriculum available"));
const readBtn = page.locator("td[colspan] button", { hasText: "Read full pipeline" });
t('"Read full pipeline" button appears', (await readBtn.count()) > 0);
await readBtn.first().click();
await page.waitForTimeout(400);
const glmReader = await page.locator("[role=dialog]").first().textContent();
t("reader shows Data curriculum section", glmReader.includes("Data curriculum"));
t("curriculum mentions specific % figures from the paper", glmReader.includes("28%") || glmReader.includes("DCLM"));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.getByPlaceholder("Search model or provider…").fill("");
await page.waitForTimeout(250);

console.log("\n=== #1 LOCAL IMAGE FALLBACK ===");
await page.getByPlaceholder("Search model or provider…").fill("Kimi K3");
await page.waitForTimeout(250);
await page.locator("table tbody tr").first().click();
await page.waitForTimeout(500);
const thumb = page.locator("td[colspan] img").first();
const src1 = await thumb.getAttribute("src");
t("thumbnail primary src is the hotlink", src1.includes("sebastianraschka.com"), src1);
// simulate the hotlink failing
await thumb.evaluate((img) => { const ev = new Event("error"); img.dispatchEvent(ev); });
await page.waitForTimeout(300);
const src2 = await thumb.getAttribute("src");
t("onError swaps thumbnail to local /diagrams/ mirror", src2.includes("/diagrams/thumbnails/kimi-k3.webp"), src2);
const absLocal = new (await import("node:url")).URL(src2, page.url()).href;
const localResp = await page.evaluate(async (u) => { const r = await fetch(u); return r.status; }, absLocal);
t("local fallback file actually exists and loads", localResp === 200, `HTTP ${localResp}`);
await thumb.click();
await page.waitForTimeout(500);
const lbImg = page.locator("[role=dialog] img").first();
t("lightbox opens using the (already-local) src", (await lbImg.count()) > 0);
const lbSrc = await lbImg.getAttribute("src");
t("lightbox img primary src is the hotlink full-size image", lbSrc.includes("sebastianraschka.com") && lbSrc.includes("kimi-k3.webp"), lbSrc);
// React attaches onError via its synthetic event system, not the DOM .onerror property,
// so check behaviour (does it actually fall back?) rather than the property.
await lbImg.evaluate((img) => img.dispatchEvent(new Event("error")));
await page.waitForTimeout(300);
const lbSrc2 = await lbImg.getAttribute("src");
t("lightbox img falls back to local /diagrams/full/ on error", lbSrc2.includes("/diagrams/full/kimi-k3.webp"), lbSrc2);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.getByPlaceholder("Search model or provider…").fill("");
await page.waitForTimeout(200);

console.log("\n=== REGRESSION ===");
await page.getByPlaceholder("Search model or provider…").fill("");
await page.waitForTimeout(200);
t("all 61 models present", (await dataRows().count()) === 61);

await page.setViewportSize({ width: 380, height: 800 });
await page.waitForTimeout(400);
const mOverflow = await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth + 1);
t("no horizontal page overflow at 380px", mOverflow);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.join("\n") : "No console errors.");
await browser.close();
process.exit(fail ? 1 : 0);

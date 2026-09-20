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
// The unfiltered count, measured once. Everything below compares against this
// rather than a literal, so adding a model does not fail the suite.
const TOTAL = await dataRows().count();

console.log("=== #2 TITLE ===");
t('page <title> is "The Model Atlas"', (await page.title()) === "The Model Atlas", `got "${await page.title()}"`);

console.log("\n=== #3/#4 INTELLIGENCE COLUMN ===");
const headers = await page.locator("thead th").allTextContents();
t("Intelligence is the 2nd column", headers[1].includes("Intelligence"), `headers: ${headers.slice(0, 4).join(" | ")}`);
t("Intelligence header credits Artificial Analysis", headers[1].includes("Artificial Analysis"));
t("Coding agent is the 3rd column, credited to AA and naming the harness",
  headers[2].includes("Coding agent") && headers[2].includes("AA") && headers[2].includes("harness"),
  `headers[2]: ${headers[2]}`);
t("default sort is Intelligence, descending", (await page.locator("thead th").nth(1).locator("span").first().locator("span").textContent()) === "↓");
const firstFewIntel = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
const nums = firstFewIntel.slice(0, 8).map((s) => parseInt(s)).filter((n) => !Number.isNaN(n));
const sorted = [...nums].every((v, i) => i === 0 || nums[i - 1] >= v);
t("rows are actually sorted by intelligence desc", sorted, nums.join(","));

// Descending on the number alone is not enough, and asserting only that missed the
// real bug: the table opened on a v4.1 score of 58 above a v4.3 score of 51, which
// is still a descending sequence. The column holds two scales, so the order has to
// group by index version first — live basis, then superseded, then unrated — or the
// default view ranks models against a scale they were never measured on.
const intelOrder = firstFewIntel
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter((s) => s !== "" && s !== "—")
  .map((s) => ({ v: parseInt(s, 10), superseded: / v\d+\.\d+ scoring/.test(s) }))
  .filter((x) => !Number.isNaN(x.v));
const firstSuperseded = intelOrder.findIndex((x) => x.superseded);
const strays = firstSuperseded < 0 ? []
  : intelOrder.slice(firstSuperseded).filter((x) => !x.superseded);
t("the default order puts every live-basis score above every superseded one",
  strays.length === 0,
  `${strays.length} live-basis row(s) below the first superseded one at index ${firstSuperseded}`);
t("the top row is on the live index version, not merely the highest number",
  intelOrder.length > 0 && !intelOrder[0].superseded,
  `top cell: ${firstFewIntel[0]}`);
// Within each version block the order must still be by score.
for (const [label, block] of [["live", intelOrder.filter((x) => !x.superseded)],
                              ["superseded", intelOrder.filter((x) => x.superseded)]]) {
  t(`the ${label} block is ordered by score`,
    block.every((x, i) => i === 0 || block[i - 1].v >= x.v),
    block.map((x) => x.v).join(","));
}
await page.locator("thead th").filter({ hasText: "Intelligence" }).first().hover();
await page.waitForTimeout(300);
const tipText = await page.locator("body").evaluate(() => document.body.innerText);
t("hovering Intelligence header shows AA tooltip", tipText.includes("Artificial Analysis Intelligence Index"));

console.log("\n=== #5 READABILITY: clamp + reader modal ===");
await page.locator("[data-search]").fill("Kimi K3");
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
await page.locator("[data-search]").fill("GLM-5");
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
await page.locator("[data-search]").fill("");
await page.waitForTimeout(250);

console.log("\n=== #1 LOCAL IMAGE FALLBACK ===");
await page.locator("[data-search]").fill("Kimi K3");
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
await page.locator("[data-search]").fill("");
await page.waitForTimeout(200);

console.log("\n=== SEARCH ===");
await page.locator("[data-search]").fill("");
await page.waitForTimeout(200);
// The search reads the columns it displays, so a mechanism name has to find models.
// This is the check that would have failed before: "mamba" used to match nothing,
// because only name and provider were searched.
await page.locator("[data-search]").fill("mamba");
await page.waitForTimeout(250);
const mamba = await page.locator("table tbody tr[data-model]").evaluateAll((els) => els.map((e) => e.dataset.model));
t("searching an attention mechanism finds models", mamba.length > 0, mamba.join(","));
// Attention is the 8th column: Model, the four Artificial Analysis scores, then
// architecture and params ahead of it.
t("every hit really uses it", (await page.locator("table tbody tr[data-model] td:nth-child(8)")
  .allTextContents()).every((s) => /mamba/i.test(s)));
t("the live count matches the rows shown",
  (await page.locator("[data-search-count]").textContent()) === `${mamba.length}/${TOTAL}`);

await page.locator("[data-search]").fill("zzzznope");
await page.waitForTimeout(250);
t("no matches shows an empty state, not a bare header",
  (await page.locator("[data-empty]").count()) === 1 && !(await page.locator("#atlas-table").isVisible()));
await page.locator("[data-empty] button").click();
await page.waitForTimeout(250);
t("clearing from the empty state restores every row", (await dataRows().count()) === TOTAL);

// "/" is a global shortcut, so it must not fire while the caret is already in a field.
await page.locator("body").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("/");
await page.waitForTimeout(150);
t('"/" focuses the search field', await page.evaluate(() => document.activeElement?.dataset?.search !== undefined));
await page.keyboard.type("glm");
await page.keyboard.press("/");
await page.waitForTimeout(150);
t('"/" inside the field types a slash instead of hijacking',
  (await page.locator("[data-search]").inputValue()) === "glm/");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
t("Escape clears the query", (await page.locator("[data-search]").inputValue()) === "");

await page.locator("[data-search]").fill("");
await page.waitForTimeout(200);

console.log("\n=== ROW HOVER ===");
// Splitting the name into per-character spans must not change what the cell says:
// the column suite diffs cells against the source data, and a reader copying a
// name has to get a name.
const firstRow = page.locator("table tbody tr[data-model]").first();
const rowName = await firstRow.getAttribute("data-model");
t("splitting the name leaves the cell text intact",
  (await firstRow.locator("td").first().textContent()).includes(rowName), rowName);
t("every character carries its stagger index",
  (await firstRow.locator(".atlas-char").count()) === rowName.length,
  `${await firstRow.locator(".atlas-char").count()} spans for ${rowName.length} chars`);
// Splitting a name into boxes is exactly how kerning gets silently destroyed — the
// first attempt put every letter in a flex container with a 7px gap and rendered
// "O p u s  5" at more than twice the width. Measure it rather than trust it.
// Measured across every name, not just the first one. Measuring only row 1 made this
// depend on the sort order: it passed for two years on "Opus 5", whose letters carry
// no kerning pairs worth the name, and failed the day a model scoring higher put
// "GPT-6 Astra" on top. "GPT-5.6 Sol" had sat in the table the whole time with the
// same 2.4% delta, unmeasured.
//
// The tolerance is proportional and loose for the same reason. Splitting text into
// per-character spans always loses the kerning pairs — "PT", "T-" — so a small delta
// is the cost of the effect, not a defect. What this guards against is the bug in the
// comment above: a layout that spaces the letters out and doubles the width. 5% cannot
// miss that and does not fire on kerning.
const kern = await page.locator("table tbody tr[data-model]").evaluateAll((rows) => rows.map((r) => {
  const wrap = r.querySelector(".atlas-char")?.parentElement;
  if (!wrap) return null;
  const probe = document.createElement("span");
  probe.textContent = wrap.textContent;
  probe.style.cssText = "position:absolute;visibility:hidden;font:" + getComputedStyle(wrap).font;
  document.body.appendChild(probe);
  const split = wrap.getBoundingClientRect().width;
  const plain = probe.getBoundingClientRect().width;
  probe.remove();
  return { name: r.dataset.model, split, plain, pct: plain ? Math.abs(split - plain) / plain * 100 : 0 };
}).filter(Boolean));
const worst = kern.reduce((a, b) => (b.pct > a.pct ? b : a), { pct: 0, name: "(none)", split: 0, plain: 0 });
t("every split name sets to within 5% of the unsplit text",
  kern.length > 0 && worst.pct < 5,
  `worst: "${worst.name}" ${worst.split.toFixed(1)}px split vs ${worst.plain.toFixed(1)}px plain (${worst.pct.toFixed(2)}%), across ${kern.length} names`);
// The provider mark is hidden until hover, but its slot stays in the layout —
// dropping it out of flow would reflow the whole column under the pointer.
const markBefore = await firstRow.locator(".atlas-mark").first().evaluate((el) => ({
  opacity: getComputedStyle(el).opacity, width: el.getBoundingClientRect().width,
}));
t("the provider mark is invisible at rest", markBefore.opacity === "0", `opacity ${markBefore.opacity}`);
t("its slot still occupies width, so hovering cannot reflow the column",
  markBefore.width > 0, `${markBefore.width.toFixed(1)}px`);

await firstRow.hover();
await page.waitForTimeout(700);
const lifted = await firstRow.locator(".atlas-char").first().evaluate((el) => getComputedStyle(el).transform);
t("hovering lifts the name", lifted !== "none", lifted);
const markAfter = await firstRow.locator(".atlas-mark").first().evaluate((el) => getComputedStyle(el).opacity);
t("hovering brings the provider mark out", markAfter === "1", `opacity ${markAfter}`);
const rail = await firstRow.locator("td").first().evaluate((el) =>
  getComputedStyle(el, "::before").transform);
t("hovering wipes in the accent rail", rail !== "none" && !/matrix\(1, 0, 0, 0/.test(rail), rail);

console.log("\n=== METER ===");
// The neon marks the top score in a column. If it ever marked something else it
// would be worse than decoration — it would be a claim about the data that is wrong.
const lit = await page.locator(".atlas-meter-lead").count();
t("some meters are lit", lit > 0, `${lit} lit`);
// Intelligence holds two index versions at once, because AA re-based the index at
// v4.3 and re-rated only some of these models. So the top score in the column is not
// the leader — it usually belongs to a model that simply was not re-tested, and
// lighting it would be a claim that the older scale and the newer one are one scale.
// The lead is the best among rows on the live basis, which the cell marks by *not*
// carrying a version tag.
const intelLead = await page.locator("table tbody tr[data-model]").evaluateAll((rows) => {
  const vals = rows.map((r) => {
    const cell = r.querySelectorAll("td")[1];
    const text = cell.textContent.replace(/\s+/g, " ").trim();
    return {
      name: r.dataset.model,
      v: parseInt(text, 10),
      superseded: / v\d+\.\d+ scoring/.test(text),
      lit: !!cell.querySelector(".atlas-meter-lead"),
    };
  }).filter((x) => !Number.isNaN(x.v));
  const live = vals.filter((x) => !x.superseded);
  const max = Math.max(...live.map((x) => x.v));
  return { max,
    highestAnywhere: Math.max(...vals.map((x) => x.v)),
    litNames: vals.filter((x) => x.lit).map((x) => x.name),
    shouldBe: live.filter((x) => x.v === max).map((x) => x.name) };
});
t("the lit intelligence meters are exactly the top rows on the live index version",
  JSON.stringify(intelLead.litNames.sort()) === JSON.stringify(intelLead.shouldBe.sort()),
  `lit ${intelLead.litNames.join(",")} vs top ${intelLead.shouldBe.join(",")} at ${intelLead.max}`);
// And the case that makes the rule worth stating: a superseded score outranks the
// live leader numerically, so "highest number" and "lead" really are different rows.
t("a superseded score does outrank the live leader, so the distinction is load-bearing",
  intelLead.highestAnywhere > intelLead.max,
  `highest anywhere ${intelLead.highestAnywhere} vs live leader ${intelLead.max}`);

console.log("\n=== BACKDROP ===");
// The parallax layer is fixed, so it must never lengthen the document or widen it;
// that is the whole reason it can be there at all on a page with a wide table.
const beforeH = await page.evaluate(() => document.documentElement.scrollHeight);
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(400);
const moved = await page.evaluate(() => {
  const layer = document.querySelector("[aria-hidden='true'] > div:last-child");
  return layer ? getComputedStyle(layer).transform : "none";
});
t("the backdrop parallaxes on scroll", moved !== "none" && moved !== "matrix(1, 0, 0, 1, 0, 0)", moved);
t("scrolling does not grow the document", (await page.evaluate(() => document.documentElement.scrollHeight)) === beforeH);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);

console.log("\n=== REGRESSION ===");
await page.locator("[data-search]").fill("");
await page.waitForTimeout(200);
t(`all ${TOTAL} models present`, (await dataRows().count()) === TOTAL);

await page.setViewportSize({ width: 380, height: 800 });
await page.waitForTimeout(400);
const mOverflow = await page.evaluate(() => document.body.scrollWidth <= document.documentElement.clientWidth + 1);
t("no horizontal page overflow at 380px", mOverflow);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errors.length ? "CONSOLE ERRORS:\n" + errors.join("\n") : "No console errors.");
await browser.close();
process.exit(fail ? 1 : 0);

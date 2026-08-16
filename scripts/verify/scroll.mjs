import { chromium } from "playwright";
const B = process.argv[2] || "http://localhost:4173/frontier-models-table/";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
let pass = 0, fail = 0;
const t = (l, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? " — " + x : ""}`); };

await p.goto(B, { waitUntil: "networkidle" });
await p.waitForSelector("table tbody tr");

const wrapSel = () => p.evaluate(() => {
  const w = [...document.querySelectorAll("div")].find(
    (d) => d.querySelector("table") && getComputedStyle(d).overflowY === "auto");
  if (!w) return null;
  return {
    clientH: w.clientHeight, scrollH: w.scrollHeight,
    clientW: w.clientWidth, scrollW: w.scrollWidth,
    maxH: getComputedStyle(w).maxHeight,
  };
});

console.log("=== TABLE IS ITS OWN SCROLLPORT ===");
const g = await wrapSel();
t("table container scrolls vertically", g && g.scrollH > g.clientH,
  g ? `${g.scrollH}px of rows in a ${g.clientH}px box (max-height ${g.maxH})` : "no scroll container");
t("still scrolls horizontally", g && g.scrollW > g.clientW, g ? `${g.scrollW} > ${g.clientW}` : "");

console.log("\n=== PAGE IS SHORTER ===");
const pageH = await p.evaluate(() => document.body.scrollHeight);
t("whole page fits in a few screens", pageH < 4000, `body ${pageH}px tall`);

console.log("\n=== STICKY HEADER ===");
const sticky = await p.evaluate(() => {
  const w = [...document.querySelectorAll("div")].find(
    (d) => d.querySelector("table") && getComputedStyle(d).overflowY === "auto");
  const th = w.querySelector("thead th");
  const before = th.getBoundingClientRect().top;
  w.scrollTop = 600;
  const after = th.getBoundingClientRect().top;
  const firstCell = w.querySelector("tbody td");
  const cellTop = firstCell.getBoundingClientRect().top;
  const cs = getComputedStyle(th);
  w.scrollTop = 0;
  return { before, after, cellTop, pos: cs.position, z: cs.zIndex, bg: cs.backgroundColor };
});
t("header uses position:sticky", sticky.pos === "sticky");
t("header stays put while rows scroll", Math.abs(sticky.after - sticky.before) < 2,
  `top ${sticky.before.toFixed(0)} -> ${sticky.after.toFixed(0)}`);
t("header has an opaque background", sticky.bg !== "rgba(0, 0, 0, 0)", sticky.bg);
t("header sits above the detail panel", Number(sticky.z) >= 2, `z-index ${sticky.z}`);

console.log("\n=== EXPANDED ROW STILL BEHAVES ===");
await p.locator("[data-search]").fill("");
await p.waitForTimeout(200);
// expand a row far down the list to exercise the scroll-into-view
const rows = p.locator("table tbody tr[data-model]");
await rows.nth(30).click();
await p.waitForTimeout(700);
const panel = p.locator("td[colspan]").first();
t("row expands inside the scrollport", (await panel.count()) > 0);
const vis = await p.evaluate(() => {
  const w = [...document.querySelectorAll("div")].find(
    (d) => d.querySelector("table") && getComputedStyle(d).overflowY === "auto");
  const pnl = w.querySelector("td[colspan]");
  const wr = w.getBoundingClientRect(), pr = pnl.getBoundingClientRect();
  return { visible: pr.top < wr.bottom && pr.bottom > wr.top, top: pr.top, wrapTop: wr.top };
});
t("expanded panel is scrolled into view", vis.visible,
  `panel top ${vis.top.toFixed(0)} vs container top ${vis.wrapTop.toFixed(0)}`);

const pin = await p.evaluate(() => {
  const w = [...document.querySelectorAll("div")].find(
    (d) => d.querySelector("table") && getComputedStyle(d).overflowY === "auto");
  const pnl = w.querySelector("td[colspan] > div");
  w.scrollLeft = 0; const a = pnl.getBoundingClientRect().left;
  w.scrollLeft = 600; const bx = pnl.getBoundingClientRect().left;
  const cell = w.querySelector("tbody td");
  const cellAt600 = cell.getBoundingClientRect().left;
  w.scrollLeft = 0; const cellAt0 = cell.getBoundingClientRect().left;
  return { drift: Math.abs(bx - a), cellMoved: Math.abs(cellAt600 - cellAt0) };
});
t("detail panel still pinned during horizontal scroll", pin.drift < 2, `drift ${pin.drift.toFixed(1)}px`);
t("table cells still move (proving it scrolled)", pin.cellMoved > 400, `${pin.cellMoved.toFixed(0)}px`);

console.log("\n=== MOBILE 380px ===");
await p.setViewportSize({ width: 380, height: 780 });
await p.waitForTimeout(500);
const m = await p.evaluate(() => {
  const w = [...document.querySelectorAll("div")].find(
    (d) => d.querySelector("table") && getComputedStyle(d).overflowY === "auto");
  return { body: document.body.scrollWidth, doc: document.documentElement.clientWidth,
           clientH: w.clientHeight, scrollH: w.scrollHeight, scrollW: w.scrollWidth, clientW: w.clientWidth };
});
t("no page overflow at 380px", m.body <= m.doc + 1, `${m.body} vs ${m.doc}`);
t("vertical scroll survives at 380px", m.scrollH > m.clientH, `${m.scrollH} > ${m.clientH}`);
t("horizontal scroll survives at 380px", m.scrollW > m.clientW, `${m.scrollW} > ${m.clientW}`);
t("container height is sane on a small screen", m.clientH >= 380 && m.clientH <= 800, `${m.clientH}px`);

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errs.length ? "ERRORS: " + errs.join("; ") : "No page errors.");
await b.close();
process.exit(fail ? 1 : 0);

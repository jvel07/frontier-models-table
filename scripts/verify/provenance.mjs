import { chromium } from "playwright";
const B = process.argv[2] || "http://localhost:4173/frontier-models-table/";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
let pass = 0, fail = 0;
const t = (l, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? " — " + x : ""}`); };

await p.goto(B, { waitUntil: "networkidle" });
await p.waitForSelector("table tbody tr");
await p.locator("[data-search]").fill("Kimi K2.6");
await p.waitForTimeout(320);
await p.locator("table tbody tr").first().click();
await p.waitForTimeout(600);
const d = await p.locator("td[colspan]").first().textContent();

t("caveat is shown", d.includes("Not this model's own figures"));
t("states K2.6 published nothing", /published no training details for K2\.6/.test(d));
t("attributes the pipeline to the K2.5 report", d.includes("2602.02276"));
t("quotes the architectural link accurately", d.includes("same architecture as Kimi-K2.5"));
t("header says inherited, not disclosed", d.includes("inherited, not reported"));
t("does NOT claim a disclosed token total", !/Training pipeline · ~\d+T disclosed/.test(d),
  (d.match(/Training pipeline[^A-Z]{0,34}/) || [""])[0].trim());
t("K2.5 stages are present", ["ViT training", "Joint pre-training", "SFT", "RL"].every(s => d.includes(s)));
t("carries the vision-ratio curriculum finding", d.includes("data curriculum available"));

// caveat must survive into the comparison view too
await p.goto(B + "#/compare/" + ["Kimi K2.6", "Kimi K3"].map(encodeURIComponent).join("|"), { waitUntil: "networkidle" });
await p.waitForTimeout(700);
const c = await p.locator("body").textContent();
t("caveat repeats in the comparison", c.includes("Not this model's own figures"));
t("comparison reports stages as Not reported", /Not reported/.test(c));
t("K3's real figures are unaffected", /~?\d+T?/.test(c) && c.includes("MOPD"));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(errs.length ? "ERRORS: " + errs.join("; ") : "No page errors.");
await b.close();
process.exit(fail ? 1 : 0);

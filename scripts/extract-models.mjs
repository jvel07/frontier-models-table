/**
 * Extract the MODELS array from the component into plain JSON, so verification
 * scripts can diff what the page renders against the actual source data.
 *
 * Parses by bracket matching rather than regex because the notes contain brackets
 * and quotes. It must skip `//` comments — an apostrophe inside one ("K2.5's")
 * would otherwise be read as a string opener and truncate the array.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..", "src", "FrontierModelsTable.jsx");
const OUT = resolve(here, "..", ".verify", "models.json");

const t = readFileSync(SRC, "utf8");
const start = t.indexOf("const MODELS = [");
if (start < 0) throw new Error("MODELS array not found");

let i = t.indexOf("[", start);
let depth = 0, end = -1, inStr = null, esc = false, inComment = false;
for (let j = i; j < t.length; j++) {
  const c = t[j];
  if (inComment) { if (c === "\n") inComment = false; continue; }
  if (inStr) {
    if (esc) esc = false;
    else if (c === "\\") esc = true;
    else if (c === inStr) inStr = null;
    continue;
  }
  if (c === "/" && t[j + 1] === "/") { inComment = true; continue; }
  if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
  if (c === "[") depth++;
  else if (c === "]") { depth--; if (depth === 0) { end = j; break; } }
}
if (end < 0) throw new Error("MODELS array not terminated");

const models = new Function(`return ${t.slice(i, end + 1)};`)();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(models, null, 1));
console.log(`[extract-models] ${models.length} models -> ${OUT}`);

/**
 * Print everything needed to add one model, without reading the data file.
 *
 *   node scripts/scaffold-model.mjs "Kimi K3"
 *
 * `src/FrontierModelsTable.jsx` is ~57,000 tokens. An agent that opens it to find
 * where a row goes pays for those tokens on that turn and on every turn after it,
 * and the first billed sweep cost $5 for one model largely that way. This prints
 * the line numbers to edit and one real row as a template — about 400 tokens —
 * so the agent can use `sed -i` at a known line instead of reading the file.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "src", "FrontierModelsTable.jsx");
const lines = readFileSync(FILE, "utf8").split("\n");
const example = process.argv[2] || "Kimi K3";

/** First line whose text matches, 1-indexed the way sed counts. */
const lineOf = (re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return -1;
};

const maps = {
  MODELS: lineOf(/^export const MODELS = \[/),
  SPECS: lineOf(/^export const SPECS = \{/),
  REPORTS: lineOf(/^export const REPORTS = \{/),
  HF_LINKS: lineOf(/^export const HF_LINKS = \{/),
  DIAGRAMS: lineOf(/^export const DIAGRAMS = \{/),
  ATTENTION_INFO: lineOf(/^const ATTENTION_INFO = \{|^export const ATTENTION_INFO = \{/),
};

console.log(`FILE: src/FrontierModelsTable.jsx (${lines.length} lines, ~57k tokens — do not read it whole)\n`);
console.log("MAP OPENING LINES — a new entry goes after the opening brace, or in name order:");
for (const [k, v] of Object.entries(maps)) console.log(`  ${k.padEnd(15)} line ${v}`);

const rowStart = lineOf(new RegExp(`^  \\{ name: "${example.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", provider:`));
if (rowStart > 0) {
  let end = rowStart;
  while (end < lines.length && !/^\s*\}\)?,\s*$|\" \},\s*$/.test(lines[end - 1])) end++;
  console.log(`\nTEMPLATE — the "${example}" entry, lines ${rowStart}-${end}:\n`);
  console.log(lines.slice(rowStart - 1, end).join("\n"));
}

for (const [map, re] of [
  ["SPECS", new RegExp(`^  "${example}": \\{ vocab:`)],
  ["REPORTS", new RegExp(`^  "${example}": \\{ label:`)],
  ["HF_LINKS", new RegExp(`^  "${example}": "`)],
  ["DIAGRAMS", new RegExp(`^  "${example}": \\{ slug:`)],
]) {
  const n = lineOf(re);
  if (n > 0) console.log(`\n${map} entry (line ${n}):\n${lines[n - 1]}`);
}

console.log(`
INSERT WITHOUT READING THE FILE:
  sed -n '<a>,<b>p' src/FrontierModelsTable.jsx     # read only the range you need
  grep -n '"<some model>"' src/FrontierModelsTable.jsx
  # then place the new entry with an editor call anchored on a nearby unique line.
Every map is keyed by the exact model name; a name in MODELS with no matching key
in SPECS/REPORTS/HF_LINKS is what scripts/verify/maps.mjs exists to catch.`);

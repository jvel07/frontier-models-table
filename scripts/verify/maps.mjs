/**
 * Structural integrity of the lookup maps — no browser needed.
 *
 * Catches the class of bug where an entry lands in the wrong map, a duplicate key
 * silently shadows an earlier one, or a model's `attn` string is edited without
 * updating the ATTENTION_INFO key that describes it. None of these are syntax
 * errors, so the build stays green while the page quietly loses information.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const t = readFileSync(resolve(ROOT, "src", "FrontierModelsTable.jsx"), "utf8");

let fail = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) fail++;
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
};

const block = (name) => {
  const s = t.indexOf(`const ${name} = {`);
  const e = t.indexOf("\n};", s);
  if (s < 0 || e < s) throw new Error(`${name} not found`);
  return t.slice(s, e);
};

const modelsBlock = t.slice(t.indexOf("const MODELS = ["), t.indexOf("\n];", t.indexOf("const MODELS = [")));
const modelNames = new Set([...modelsBlock.matchAll(/\n {2}\{ name: "([^"]+)"/g)].map((m) => m[1]));
console.log(`models: ${modelNames.size}\n`);

const SPECS = { HF_LINKS: ["str"], DIAGRAMS: ["obj", ["slug", "title"]], REPORTS: ["obj", ["label", "url"]] };
for (const [name, [kind, required]] of Object.entries(SPECS)) {
  const b = block(name);
  const entries = kind === "str"
    ? [...b.matchAll(/\n {2}"([^"]+)": "([^"]*)"/g)].map((m) => [m[1], m[2]])
    : [...b.matchAll(/\n {2}"([^"]+)": \{([^}]*)\}/g)].map((m) => [m[1], m[2]]);
  const keys = entries.map(([k]) => k);
  const dupes = [...new Set(keys.filter((k) => keys.filter((x) => x === k).length > 1))];
  const unknown = keys.filter((k) => !modelNames.has(k));
  if (dupes.length) ok(`${name}: duplicate keys`, false, dupes.join(", "));
  if (unknown.length) ok(`${name}: keys matching no model`, false, unknown.join(", "));
  if (kind === "obj") {
    for (const [k, body] of entries) {
      // blank string literals first so "https://…" isn't read as a field named https
      const fields = [...body.replace(/"[^"]*"/g, '""').matchAll(/(\w+)\s*:/g)].map((m) => m[1]).sort();
      if (fields.join(",") !== [...required].sort().join(","))
        ok(`${name}['${k}'] field shape`, false, `got ${fields.join(",")}`);
    }
  }
  ok(`${name}: ${keys.length} entries, ${new Set(keys).size} unique`, !dupes.length && !unknown.length);
}

// every attn value must resolve to a description
const ai = t.indexOf("const ATTENTION_INFO");
const attnKeys = new Set([...t.slice(ai, t.indexOf("const ARCH_PAPERS")).matchAll(/\n {2}"([^"]+)": \{/g)].map((m) => m[1]));
const attnUsed = new Set([...modelsBlock.matchAll(/attn: "([^"]+)"/g)].map((m) => m[1]));
const orphans = [...attnUsed].filter((a) => !attnKeys.has(a));
ok(`every attn value has a description (${attnUsed.size - orphans.length}/${attnUsed.size})`,
  orphans.length === 0, orphans.join(", "));

// diagram slugs need their local fallback files
const slugs = [...block("DIAGRAMS").matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
const missing = slugs.flatMap((s) => ["thumbnails", "full"]
  .filter((sub) => !existsSync(resolve(ROOT, "public", "diagrams", sub, `${s}.webp`)))
  .map((sub) => `${sub}/${s}.webp`));
ok(`local diagram fallbacks present (${slugs.length} slugs)`, missing.length === 0, missing.join(", "));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${fail} structural problem(s)`);
process.exit(fail ? 1 : 0);

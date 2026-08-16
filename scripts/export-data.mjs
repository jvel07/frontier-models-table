/**
 * Emit the atlas as data, so it can be used rather than only read.
 *
 * Writes into public/data/, which Vite copies verbatim into the build, so the files
 * sit at a stable URL next to the site and need no server:
 *
 *   /data/models.json    every model, every recorded field, plus derived metrics
 *   /data/models.csv     the same flattened one row per model, for spreadsheets
 *   /data/schema.json    field-by-field description of the above
 *
 * Derived fields are namespaced under `derived` and carry their own `formula`, so a
 * consumer can never mistake a computed number for something a lab published — the
 * distinction the whole atlas is built on.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  disclosedTokens, trainingFlops, tokensPerParam, kvBytesPerToken,
  weightBytes, disclosure, openness, parseCount,
} from "../src/metrics.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const OUT = resolve(ROOT, "public", "data");

// The component is the single source of truth; pull the maps straight out of it.
const src = readFileSync(resolve(ROOT, "src", "FrontierModelsTable.jsx"), "utf8");
const grab = (name, open = "{", close = "}") => {
  const start = src.indexOf(`export const ${name} = ${open}`);
  if (start < 0) throw new Error(`${name} not found`);
  const from = src.indexOf(open, start);
  let depth = 0, inStr = null, esc = false, comment = false;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (comment) { if (c === "\n") comment = false; continue; }
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { comment = true; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (!depth) return new Function(`return ${src.slice(from, i + 1)};`)(); }
  }
  throw new Error(`${name} not terminated`);
};

const MODELS = grab("MODELS", "[", "]");
const SPECS = grab("SPECS");
const REPORTS = grab("REPORTS");
const HF_LINKS = grab("HF_LINKS");

const VERSION = new Date().toISOString().slice(0, 10);

const rows = MODELS.map((m) => {
  const spec = SPECS[m.name] || null;
  const report = REPORTS[m.name] || null;
  const hf = HF_LINKS[m.name] || null;
  const ctx = { spec, report, hfRepo: hf };

  const tok = disclosedTokens(m);
  const flops = trainingFlops(m);
  const tpp = tokensPerParam(m);
  const kv = kvBytesPerToken(m, spec);
  const disc = disclosure(m, ctx);
  const open = openness(m, hf);

  return {
    ...m,
    spec,
    huggingface: hf ? `https://huggingface.co/${hf}` : null,
    report: report ? report.url : null,
    derived: {
      _note: "Computed from the fields above, not published by the lab.",
      totalParams: parseCount(m.params),
      activeParams: parseCount(m.active),
      disclosedTrainingTokens: tok ? tok.tokens : null,
      disclosedTokensAreApproximate: tok ? tok.approx : null,
      trainingFlops: flops ? flops.flops : null,
      trainingFlopsFormula: "6 * activeParams * disclosedTrainingTokens",
      tokensPerParam: tpp ? tpp.ratio : null,
      tokensPerParamFormula: "disclosedTrainingTokens / totalParams",
      kvCacheBytesPerTokenFp16: kv && kv.bytes ? kv.bytes : null,
      kvCacheFormula: kv && kv.bytes
        ? `2 * layers * kvHeads * headDim * 2 bytes; head_dim ${kv.assumedHeadDim
            ? "assumed hidden/qHeads, not published for this model" : "as published in config.json"}`
        : (kv && kv.unsupported) || null,
      weightBytesFp16: weightBytes(m),
      disclosureScore: disc.met,
      disclosureTotal: disc.total,
      disclosureFields: Object.fromEntries(disc.fields.map((f) => [f.key, f.met])),
      opennessTier: open.tier,
      opennessVerbs: open.verbs,
      licenseClass: open.licenseClass,
    },
  };
});

const payload = {
  name: "The Model Atlas",
  description: "How frontier and small language models are actually built.",
  url: "https://jvel07.github.io/frontier-models-table/",
  version: VERSION,
  license: "Data compiled from primary sources; see each model's report field.",
  citation: {
    bibtex: `@misc{modelatlas${VERSION.slice(0, 4)},
  title  = {The Model Atlas: how frontier and small language models are actually built},
  author = {{The Model Atlas}},
  year   = {${VERSION.slice(0, 4)}},
  note   = {Snapshot ${VERSION}},
  url    = {https://jvel07.github.io/frontier-models-table/}
}`,
  },
  count: rows.length,
  models: rows,
};

const CSV_COLS = [
  ["name", (r) => r.name], ["provider", (r) => r.provider], ["released", (r) => r.released],
  ["class", (r) => r.type], ["architecture", (r) => r.arch],
  ["total_params", (r) => r.params], ["active_params", (r) => r.active],
  ["total_params_n", (r) => r.derived.totalParams], ["active_params_n", (r) => r.derived.activeParams],
  ["attention", (r) => r.attn], ["modality", (r) => r.modality],
  ["context", (r) => r.context], ["max_output", (r) => r.maxOut],
  ["license", (r) => r.license], ["license_class", (r) => r.derived.licenseClass],
  ["open_weights", (r) => r.open], ["openness_tier", (r) => r.derived.opennessTier],
  ["intelligence_aa", (r) => r.intel],
  ["coding_agent_aa", (r) => r.codingAgent], ["coding_agent_harness", (r) => r.codingAgentVia],
  ["agentic_aa", (r) => r.agentic],
  ["layers", (r) => r.spec && r.spec.layers], ["hidden", (r) => r.spec && r.spec.hidden],
  ["heads", (r) => r.spec && r.spec.heads], ["head_dim", (r) => r.spec && r.spec.headDim],
  ["experts", (r) => r.spec && r.spec.experts], ["ffn", (r) => r.spec && r.spec.ffn],
  ["activation", (r) => r.spec && r.spec.activation], ["norm", (r) => r.spec && r.spec.norm],
  ["vocab", (r) => r.spec && r.spec.vocab], ["positional", (r) => r.spec && r.spec.posEmb],
  ["disclosed_tokens", (r) => r.derived.disclosedTrainingTokens],
  ["training_flops", (r) => r.derived.trainingFlops],
  ["tokens_per_param", (r) => r.derived.tokensPerParam],
  ["kv_bytes_per_token_fp16", (r) => r.derived.kvCacheBytesPerTokenFp16],
  ["disclosure_score", (r) => r.derived.disclosureScore],
  ["disclosure_total", (r) => r.derived.disclosureTotal],
  ["report_url", (r) => r.report], ["huggingface", (r) => r.huggingface],
];

const esc = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [CSV_COLS.map((c) => c[0]).join(",")]
  .concat(rows.map((r) => CSV_COLS.map((c) => esc(c[1](r))).join(",")))
  .join("\n");

const schema = {
  version: VERSION,
  note: "Fields under `derived` are computed by this project, not published by the lab. Everything else is recorded from a primary source; a null means no source stated it, never zero.",
  fields: {
    name: "Model name as the atlas records it. Primary key.",
    provider: "Lab that trained it.",
    released: "YYYY/MM of public release.",
    type: "Atlas tiering: Frontier, Mid or SLM.",
    arch: "Architecture family. 'Undisclosed' or '(reported)' where unconfirmed.",
    params: "Total parameters as published, e.g. '1T'. '—' = not disclosed.",
    active: "Parameters active per token. Equals total on dense models.",
    attn: "Attention mechanism. Key into the attention menu.",
    modality: "Input modalities.",
    context: "Max input window in tokens.",
    maxOut: "Max output tokens, null where unpublished.",
    license: "Licence string as published.",
    open: "Whether weights are downloadable.",
    intel: "Artificial Analysis Intelligence Index. Third-party.",
    codingAgent: "Artificial Analysis Coding Agent Index v1.3. Third-party. Scores an agent harness driving the model, not the model alone, so it is only meaningful together with codingAgentVia.",
    codingAgentVia: "The agent harness that produced codingAgent — the highest-scoring pairing AA publishes for this model.",
    agentic: "Artificial Analysis Agentic Index. Third-party. Shares two of its component evaluations with the Intelligence Index, so the two are not independent.",
    training: "Array of stages: {label, tokens, detail, curriculum}. null = none published.",
    trainingSource: "Set when the pipeline shown belongs to another model; those tokens are never counted as disclosed.",
    note: "Prose written by this project.",
    spec: "Read from the model's own config.json on Hugging Face: layers, hidden, heads, headDim (head_dim as published, which is usually not hidden/heads), experts, ffn (dense and per-expert intermediate_size), activation (hidden_act verbatim), norm, vocab, window, posEmb.",
    report: "URL of the technical report or model card.",
    huggingface: "Weights repo, where one exists.",
    derived: "Computed metrics; each carries the formula used.",
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "models.json"), JSON.stringify(payload, null, 1));
writeFileSync(resolve(OUT, "models.csv"), csv);
writeFileSync(resolve(OUT, "schema.json"), JSON.stringify(schema, null, 1));

const withFlops = rows.filter((r) => r.derived.trainingFlops).length;
console.log(`[export-data] ${rows.length} models -> public/data/{models.json,models.csv,schema.json} (${withFlops} with derivable FLOPs)`);

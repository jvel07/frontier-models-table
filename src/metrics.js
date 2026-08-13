/**
 * Derived metrics.
 *
 * Everything here is *computed*, never sourced — which makes it a different kind of
 * claim from the rest of the atlas and is why it lives in its own file. The data
 * rules say to omit rather than infer; these functions do not add facts about a
 * model, they arithmetic over facts already recorded, and every consumer is expected
 * to label the result as derived and show the formula.
 *
 * Two rules followed throughout:
 *   - Return null rather than a guess. A missing input means no number, not a zero.
 *   - Never derive across a disclosure boundary. A model whose pipeline is inherited
 *     (trainingSource set) contributes no token total of its own, exactly as the
 *     comparison view refuses to count those tokens as disclosed.
 */

/** "105B" -> 105e9, "1T" -> 1e12, "8B (4.5B eff.)" -> 8e9, "—" -> null. */
export function parseCount(s) {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const txt = String(s).replace(/[,\s]/g, "");
  if (!txt || txt === "—" || /^N\/?A$/i.test(txt)) return null;
  // "3×~40B" — a stage run for several epochs; multiply out.
  const mult = txt.match(/^(\d+(?:\.\d+)?)[x×]~?(\d+(?:\.\d+)?)([KMBT])/i);
  if (mult) return parseFloat(mult[1]) * scale(parseFloat(mult[2]), mult[3]);
  // Not anchored: several stages are written as prose ("Up to 9T"), and the figure
  // is the first number in the string either way.
  const m = txt.match(/[>~<≈+]*(\d+(?:\.\d+)?)([KMBT])?/i);
  if (!m) return null;
  return scale(parseFloat(m[1]), m[2]);
}

const scale = (n, unit) => {
  switch ((unit || "").toUpperCase()) {
    case "T": return n * 1e12;
    case "B": return n * 1e9;
    case "M": return n * 1e6;
    case "K": return n * 1e3;
    default: return n;
  }
};

/** True when a token string is hedged ("~40T", ">30T", "32T+") rather than exact. */
export const isApprox = (s) => s != null && /[~><≈+]|up to/i.test(String(s));

/**
 * Total disclosed pre-training-ish tokens. Only stages that published a number are
 * summed, so the result is a floor, not a total — and a model showing someone else's
 * pipeline contributes nothing.
 */
export function disclosedTokens(model) {
  if (!model.training || model.trainingSource) return null;
  let sum = 0, any = false, approx = false;
  for (const st of model.training) {
    const v = parseCount(st.tokens);
    if (v == null) continue;
    sum += v; any = true;
    if (isApprox(st.tokens)) approx = true;
  }
  return any ? { tokens: sum, approx } : null;
}

/**
 * Training compute, C ≈ 6ND.
 *
 * N is *active* parameters, not total: on a sparse model only the routed experts run
 * for a given token, which is the whole point of the architecture. Using total params
 * would overstate a 1T/32B model by ~30x.
 */
export function trainingFlops(model) {
  const d = disclosedTokens(model);
  const n = parseCount(model.active);
  if (!d || n == null) return null;
  return { flops: 6 * n * d.tokens, approx: d.approx || isApprox(model.active) };
}

/**
 * Tokens per parameter — the Chinchilla ratio. ~20:1 was the compute-optimal finding;
 * everything shipped since trains far past it, because the cost that matters in
 * production is inference, not training.
 */
export function tokensPerParam(model) {
  const d = disclosedTokens(model);
  const n = parseCount(model.params);
  if (!d || !n) return null;
  return { ratio: d.tokens / n, approx: d.approx };
}

/** "64 Q / 8 KV (GQA 8:1)" -> { q: 64, kv: 8 }. */
export function parseHeads(spec) {
  if (!spec || !spec.heads) return null;
  const q = spec.heads.match(/(\d+)\s*Q/);
  const kv = spec.heads.match(/(\d+)\s*KV/);
  if (!q) return null;
  return { q: +q[1], kv: kv ? +kv[1] : +q[1] };
}

/**
 * KV cache bytes per token.
 *
 * Deliberately refuses several cases rather than printing a wrong number:
 *
 *   - MLA caches a low-rank latent, not K and V per head, so heads x head_dim does
 *     not describe its cache at all.
 *   - Linear-attention and SSM layers carry a fixed-size recurrent state that does
 *     not grow per token, so a per-token figure is meaningless for them.
 *   - head_dim is used as published when SPECS records it, and only falls back to
 *     hidden / q_heads when it does not. That fallback is the usual construction and
 *     nothing more: of the models whose config.json publishes head_dim, most
 *     contradict it. Gemma 4 (31B) is 5,376 / 32 = 168 by construction and 256 in
 *     the file; Laguna XS 2.1 is 42.7 against a published 128, a three-fold error in
 *     a cache size someone might size a machine against. The fallback stays flagged.
 */
export function kvBytesPerToken(model, spec, bytesPerElem = 2) {
  if (!spec) return null;
  const attn = model.attn || "";
  if (/MLA/i.test(attn)) return { unsupported: "MLA caches a compressed latent, not per-head K/V" };
  if (/DeltaNet|Mamba|KDA|linear/i.test(attn))
    return { unsupported: "hybrid: linear layers carry a fixed state that does not grow per token" };
  const h = parseHeads(spec);
  const hidden = parseCount(spec.hidden);
  const layers = spec.layers;
  if (!h || !layers) return null;
  const published = spec.headDim;
  if (!published && !hidden) return null;
  const headDim = published || hidden / h.q;
  return {
    bytes: 2 * layers * h.kv * headDim * bytesPerElem,
    headDim,
    assumedHeadDim: !published,
    layers, kvHeads: h.kv,
  };
}

/** Weight bytes at a given precision — total params, since all of them must be resident. */
export function weightBytes(model, bytesPerElem = 2) {
  const n = parseCount(model.params);
  return n == null ? null : n * bytesPerElem;
}

/* ----------------------------------------------------------------- openness -- */

/**
 * The open-weights test from "Open Weights and American AI Leadership"
 * (NVIDIA et al., 24 July 2026): a model anyone can *download, inspect, modify and
 * run on their own infrastructure*.
 *
 * The letter's subject is availability of weights, not documentation — so this is
 * scored separately from the disclosure fields below, and the two are shown as
 * independent axes. A model can satisfy every verb here and still tell you nothing
 * about how it was built, which is the more interesting thing the atlas can show.
 */
export const OPEN_VERBS = ["download", "inspect", "modify", "run"];

// License families, by how much they restrict the "modify" and "run" verbs.
const PERMISSIVE = /^(Apache 2\.0|MIT)$/i;
const CONDITIONAL = /^(Modified MIT|OpenMDW|Kimi .*License)/i;
const COMMUNITY = /Community/i;

export function licenseClass(license) {
  if (!license) return "unknown";
  if (PERMISSIVE.test(license)) return "permissive";
  if (CONDITIONAL.test(license)) return "conditional";
  if (COMMUNITY.test(license)) return "community";
  if (/Proprietary/i.test(license)) return "proprietary";
  return "other";
}

export function openness(model, hasHfRepo) {
  const cls = licenseClass(model.license);
  const weights = model.open === true;
  const verbs = {
    // "Download" is the one verb with a checkable artifact: a repo you can pull.
    download: weights && !!hasHfRepo,
    inspect: weights,
    modify: weights && cls !== "proprietary",
    run: weights,
  };
  const met = OPEN_VERBS.filter((v) => verbs[v]).length;
  return {
    verbs, met, total: OPEN_VERBS.length, licenseClass: cls,
    // The letter draws one line — downloadable and runnable on your own infrastructure.
    // "restricted" marks weights that clear that bar but carry use limits on top.
    tier: !weights ? "closed" : cls === "community" ? "restricted" : "open",
  };
}

/* --------------------------------------------------------------- disclosure -- */

/**
 * What the lab actually told you, as twelve yes/no fields in four groups.
 *
 * This is the axis the NVIDIA letter does not cover and the atlas is unusually well
 * placed to score, because every field below is one the atlas already had to decide
 * whether to fill in or leave blank.
 */
export const DISCLOSURE_FIELDS = [
  { key: "arch", group: "Architecture", label: "Architecture family",
    test: (m) => m.arch && !/Undisclosed/i.test(m.arch) && !/reported/i.test(m.arch) },
  { key: "params", group: "Architecture", label: "Total parameters",
    test: (m) => m.params && m.params !== "—" },
  { key: "active", group: "Architecture", label: "Active parameters",
    test: (m) => m.active && m.active !== "—" },
  { key: "attn", group: "Architecture", label: "Attention mechanism",
    test: (m) => m.attn && !/Undisclosed/i.test(m.attn) },

  { key: "config", group: "Configuration", label: "Layer/head configuration",
    test: (m, ctx) => !!ctx.spec },
  { key: "pos", group: "Configuration", label: "Positional scheme",
    test: (m, ctx) => !!(ctx.spec && ctx.spec.posEmb) },
  { key: "vocab", group: "Configuration", label: "Vocabulary size",
    test: (m, ctx) => !!(ctx.spec && ctx.spec.vocab) },
  { key: "context", group: "Configuration", label: "Context window",
    test: (m) => m.context != null },

  { key: "pipeline", group: "Training", label: "Training stages",
    test: (m) => Array.isArray(m.training) && m.training.length > 0 && !m.trainingSource },
  { key: "tokens", group: "Training", label: "Token budget",
    test: (m) => disclosedTokens(m) != null },
  { key: "curriculum", group: "Training", label: "Data curriculum",
    test: (m) => Array.isArray(m.training) && !m.trainingSource &&
      m.training.some((s) => s.curriculum) },

  { key: "report", group: "Provenance", label: "Technical report",
    test: (m, ctx) => !!ctx.report },
];

export function disclosure(model, ctx = {}) {
  const fields = DISCLOSURE_FIELDS.map((f) => ({
    key: f.key, group: f.group, label: f.label, met: !!f.test(model, ctx),
  }));
  const met = fields.filter((f) => f.met).length;
  return { fields, met, total: fields.length, pct: met / fields.length };
}

/** Roll disclosure + openness up to the lab. */
export function byProvider(models, ctx) {
  const out = new Map();
  for (const m of models) {
    const d = disclosure(m, ctx(m));
    const o = openness(m, ctx(m).hfRepo);
    let e = out.get(m.provider);
    if (!e) {
      e = { provider: m.provider, models: [], disclosedFields: 0, totalFields: 0, open: 0, restricted: 0, closed: 0 };
      out.set(m.provider, e);
    }
    e.models.push({ model: m, disclosure: d, openness: o });
    e.disclosedFields += d.met;
    e.totalFields += d.total;
    e[o.tier] += 1;
  }
  return [...out.values()]
    .map((e) => ({ ...e, pct: e.totalFields ? e.disclosedFields / e.totalFields : 0 }))
    .sort((a, b) => b.pct - a.pct || b.models.length - a.models.length);
}

/* ------------------------------------------------------------------ format -- */

export const fmtFlops = (f) => {
  if (f == null) return "—";
  const e = Math.floor(Math.log10(f));
  const mant = f / 10 ** e;
  return `${mant.toFixed(1)}e${e}`;
};

export const fmtBytes = (b) => {
  if (b == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
};

export const fmtTokensShort = (n) => {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(n % 1e12 === 0 ? 0 : 1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return String(n);
};

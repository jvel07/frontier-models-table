import React, { useMemo } from "react";
import { ProviderMark } from "./providerIcons.jsx";
import {
  MODELS, SPECS, REPORTS, HF_LINKS, DIAGRAMS, ARCH_COLORS, TYPE_COLORS,
  ATTENTION_INFO, DIAGRAM_BASE, LOCAL_DIAGRAM_BASE, DIAGRAM_CREDIT,
  S, mono, serif, fmtTokens, totalTokens, positionalPapers,
} from "./FrontierModelsTable.jsx";

/**
 * Side-by-side technical comparison of up to 4 models.
 *
 * The rows are deliberately modelled as discrete, named axes (attention, positional
 * scheme, decoder topology, tokenizer, per-stage training budget…) rather than prose.
 * That is what makes them diffable here, and it is also the substrate the planned
 * "synthesise a new architecture from these models" feature will recombine — each
 * AXES entry below is one dimension that could be independently swapped between
 * parents. `pick` returns the raw comparable value; `render` is presentation only.
 */

const MAX = 4;

const sparsity = (m) => {
  const p = parseFloat(m.params), a = parseFloat(m.active);
  if (!isFinite(p) || !isFinite(a) || m.params === "—" || m.active === "—") return null;
  const unit = (s) => (/T$/.test(s) ? 1000 : 1);
  const pv = p * unit(m.params), av = a * unit(m.active);
  if (!pv) return null;
  const pct = (av / pv) * 100;
  return `${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}% active`;
};

const spec = (m, f) => (SPECS[m.name] || {})[f] || null;

/**
 * Per-value glosses. `hint` explains what an axis measures; `gloss` explains what
 * a *particular* value implies, because the interesting rows mean different things
 * depending on what they say — "96 Q / 96 KV (MHA)" and "64 Q / 4 KV (GQA 16:1)"
 * have opposite consequences for KV-cache cost and need opposite explanations.
 */
function glossHeads(v) {
  if (!v) return null;
  const mha = /\(MHA\)/.test(v);
  const gqa = v.match(/GQA (\d+):1/);
  if (mha) return "Multi-Head Attention: every query head keeps its own key/value pair. Nothing is shared, so the KV cache is as large as it gets — costly at long context.";
  if (gqa) return `Grouped-Query Attention: ${gqa[1]} query heads share one key/value head, so the KV cache is about ${gqa[1]}× smaller than MHA for the same head count.`;
  if (/GQA/.test(v)) return "Grouped-Query Attention: several query heads share each key/value head, shrinking the KV cache.";
  return null;
}

function glossPos(v) {
  if (!v) return null;
  const bits = [];
  if (/^NoPE|no rope_theta/i.test(v))
    bits.push("No positional embedding at all — order has to be carried by the layer dynamics themselves rather than injected into the token representations.");
  if (/partial RoPE \((\d+)% of head dims\)/.test(v)) {
    const pct = v.match(/partial RoPE \((\d+)% of head dims\)/)[1];
    bits.push(`Only ${pct}% of each head's dimensions get rotated; the remainder carry no positional signal, which helps the model generalise past its trained length.`);
  }
  if (/MLA head split/.test(v))
    bits.push("Multi-head Latent Attention splits each head in two: a small rotated slice carries position, the larger un-rotated slice is what gets compressed into the latent KV cache.");
  if (/θ=/.test(v) && !/^NoPE/i.test(v))
    bits.push("θ is RoPE's base frequency — a larger value rotates more slowly with distance, which is how a model is stretched to longer context.");
  if (/yarn/i.test(v))
    bits.push("YaRN rescales those frequencies at inference to reach beyond the trained window.");
  if (/NoPE on \d+ of \d+ layers/.test(v))
    bits.push("Some layers deliberately skip RoPE entirely, a mix that tends to extrapolate better than rotating every layer.");
  return bits.length ? bits.join(" ") : null;
}

function glossLayerMix(v) {
  if (!v) return null;
  const kinds = [];
  if (/full attention/.test(v)) kinds.push("full attention layers let every token see all previous tokens (quadratic cost)");
  if (/sliding-window/.test(v)) kinds.push("sliding-window layers only look back a fixed span, so cost stays linear");
  if (/linear attention/.test(v)) kinds.push("linear-attention layers keep a fixed-size recurrent state instead of a growing cache");
  if (/Mamba/.test(v)) kinds.push("Mamba layers are state-space blocks with no attention at all");
  if (!kinds.length) return null;
  return kinds.join("; ") + ". Interleaving them buys long-context throughput while keeping some layers fully global.";
}

function glossExperts(v) {
  if (!v) return null;
  const routed = v.match(/(\d+) routed/);
  const active = v.match(/(\d+) active/);
  const shared = /shared/.test(v);
  if (!routed) return null;
  let s = `Mixture-of-Experts: ${routed[1]} expert FFNs exist`;
  s += active
    ? `, but a router fires only ${active[1]} per token — so total parameters scale with ${routed[1]} while compute scales with ${active[1]}.`
    : `; a router selects a subset per token, so capacity grows without compute growing with it.`;
  if (shared) s += " Shared experts run for every token regardless of routing, holding the knowledge all tokens need.";
  return s;
}

// One row of the comparison. `group` buckets rows into sections.
const AXES = [
  { group: "Identity", label: "Provider", pick: (m) => m.provider },
  { group: "Identity", label: "Released", pick: (m) => m.released },
  { group: "Identity", label: "Class", pick: (m) => m.type,
    hint: "Our own tiering: Frontier, Mid, or SLM (small language model)" },
  { group: "Identity", label: "Licence", pick: (m) => m.license },
  { group: "Identity", label: "Weights", pick: (m) => (m.open ? "Open" : "Proprietary"),
    hint: "Whether you can download and run the model yourself" },
  { group: "Identity", label: "Intelligence (AA)", pick: (m) => (m.intel == null ? null : String(m.intel)),
    hint: "Artificial Analysis Intelligence Index v4.1 — a composite of 9 evaluations. Higher is better; the scale is not a percentage." },

  { group: "Scale", label: "Total params", pick: (m) => (m.params === "—" ? null : m.params),
    hint: "Every weight in the model. Sets how much memory it takes to hold." },
  { group: "Scale", label: "Active params", pick: (m) => (m.active === "—" ? null : m.active),
    hint: "Weights that actually run for a given token. Sets speed and cost. On a dense model this equals the total." },
  { group: "Scale", label: "Sparsity", pick: sparsity,
    hint: "Active ÷ total. Lower means a bigger model runs at a smaller model's cost." },
  { group: "Scale", label: "Layers", pick: (m) => (spec(m, "layers") ? String(spec(m, "layers")) : null),
    hint: "Depth: how many transformer blocks a token passes through" },
  { group: "Scale", label: "Hidden size", pick: (m) => spec(m, "hidden"),
    hint: "Width of the residual stream — the vector carried between layers" },

  { group: "Architecture", label: "Family", pick: (m) => m.arch },
  { group: "Architecture", label: "Layer composition", pick: (m) => spec(m, "layerMix"),
    hint: "Which layer types the stack interleaves, counted from layer_types in config.json",
    gloss: (m) => glossLayerMix(spec(m, "layerMix")) },
  { group: "Architecture", label: "Experts", pick: (m) => spec(m, "experts"),
    hint: "Routed · active per token · always-on shared",
    gloss: (m) => glossExperts(spec(m, "experts")) },

  { group: "Attention", label: "Mechanism", pick: (m) => m.attn,
    hint: "How each token decides what to look at. Ratios in brackets count layers, not heads.",
    // The main table only exposes this on hover, which is no use on a phone and
    // no use at all when you are reading two mechanisms side by side.
    gloss: (m) => (ATTENTION_INFO[m.attn] || {}).desc || null },
  { group: "Attention", label: "Heads", pick: (m) => spec(m, "heads"),
    hint: "Query heads / key-value heads. Fewer KV heads means a smaller cache to carry at long context.",
    gloss: (m) => glossHeads(spec(m, "heads")) },
  { group: "Attention", label: "Sliding window", pick: (m) => spec(m, "window"),
    hint: "On windowed layers, how many previous tokens a token may attend to. Blank means those layers are fully global." },

  { group: "Positional encoding", label: "Scheme", pick: (m) => spec(m, "posEmb"), wide: true,
    hint: "How the model knows token order. Read from rope_theta, partial_rotary_factor and per-layer rope_parameters in config.json.",
    gloss: (m) => glossPos(spec(m, "posEmb")) },
  { group: "Positional encoding", label: "Papers",
    pick: (m) => { const p = positionalPapers(m); return p.length ? p.map((x) => x.label).join("\n") : null; },
    hint: "The paper introducing each scheme this model uses",
    links: (m) => positionalPapers(m) },

  { group: "Tokenizer", label: "Vocabulary", pick: (m) => spec(m, "vocab"),
    hint: "Rows in the embedding table (vocab_size). A larger vocabulary packs more characters into each token, which matters most for non-English text and code." },

  { group: "Context", label: "Context window", pick: (m) => fmtTokens(m.context),
    hint: "Longest input the model accepts" },
  { group: "Context", label: "Max output", pick: (m) => (m.maxOut == null ? null : fmtTokens(m.maxOut)),
    hint: "Longest single response it will generate" },
  { group: "Context", label: "Modality", pick: (m) => m.modality,
    hint: "Input types accepted. Image means still pictures, video means frame sequences — a model can take images without taking video. Every model here outputs text only." },

  // A borrowed pipeline must not be counted as this model's own disclosure.
  { group: "Training", label: "Disclosed stages",
    pick: (m) => (m.trainingSource ? "Not reported" : m.training ? String(m.training.length) : null),
    hint: "How many training phases the lab described for this model. More stages means more disclosure, not necessarily more training.",
    gloss: (m) => (m.trainingSource
      ? "The stages shown below are a predecessor's, published for that model rather than this one."
      : null) },
  { group: "Training", label: "Disclosed tokens",
    pick: (m) => {
      if (m.trainingSource) return "Not reported";
      const tt = totalTokens(m.training);
      return tt ? `~${tt.total}${tt.hasEst ? " (incl. est.)" : ""}` : null;
    },
    hint: "Sum of the per-stage budgets this lab published. A blank means none were, not that training was small." },
];

const GROUPS = [...new Set(AXES.map((a) => a.group))];

function ValueCell({ value, shared, wide, gloss, links }) {
  if (!value && !(links && links.length)) return <td style={SC.cellEmpty}>—</td>;
  return (
    <td style={{ ...SC.cell, ...(wide ? SC.cellWide : {}), ...(shared ? SC.cellShared : {}) }}>
      {links && links.length ? (
        <span style={SC.linkStack}>
          {links.map((p, i) => (
            <a key={i} style={S.link} href={p.url} target="_blank" rel="noopener noreferrer">
              {p.label} ↗
            </a>
          ))}
        </span>
      ) : (
        <span style={SC.valueText}>{value}</span>
      )}
      {gloss && <span style={SC.gloss}>{gloss}</span>}
    </td>
  );
}

export default function CompareView({ names, onBack }) {
  const models = useMemo(
    () => names.map((n) => MODELS.find((m) => m.name === n)).filter(Boolean).slice(0, MAX),
    [names]
  );

  const missing = names.filter((n) => !MODELS.some((m) => m.name === n));

  if (models.length === 0) {
    return (
      <div style={S.page}>
        <div style={S.shell}>
          <button type="button" style={SC.back} onClick={onBack}>← Back to the atlas</button>
          <h1 style={S.title}>Nothing to compare</h1>
          <p style={S.sub}>
            {missing.length
              ? `No model in the atlas matches ${missing.map((m) => `“${m}”`).join(", ")}.`
              : "Pick two to four models from the table to compare them."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <div style={SC.topBar}>
          <button type="button" style={SC.back} onClick={onBack}>
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" aria-hidden="true" style={SC.backLogo} />
            ← Back to the atlas
          </button>
          <span style={SC.count}>{models.length} of {MAX} models</span>
        </div>

        <header style={{ marginBottom: 24 }}>
          <div style={S.eyebrow}>Side by side</div>
          <h1 style={{ ...S.title, fontSize: "clamp(26px, 4vw, 40px)" }}>
            {models.map((m) => m.name).join("  ·  ")}
          </h1>
          <p style={S.sub}>
            <span style={SC.legendSwatch} aria-hidden="true" />
            Highlighted cells are where two or more of these models <em>agree</em> —
            with three or four models nearly everything differs, so shared ground is the
            more useful signal. A blank cell means no published source states that value,
            not that the model lacks the feature.
          </p>
        </header>

        {missing.length > 0 && (
          <div style={SC.warn}>
            Not found in the atlas, so omitted: {missing.join(", ")}
          </div>
        )}

        <div style={SC.wrap}>
          <table style={SC.table}>
            <thead>
              <tr>
                <th style={{ ...SC.th, ...SC.thAxis }}>Axis</th>
                {models.map((m) => {
                  const ac = ARCH_COLORS[m.arch] || "var(--fallback)";
                  const tc = TYPE_COLORS[m.type] || {};
                  return (
                    <th key={m.name} style={SC.th}>
                      <div style={SC.modelName}>
                        {m.name}
                        <ProviderMark provider={m.provider} size={16} style={{ marginLeft: 8 }} />
                      </div>
                      <div style={SC.modelMeta}>
                        <span style={{ ...S.pill, color: tc.fg }}>
                          <span style={{ ...S.pillDot, background: tc.dot }} />{m.type}
                        </span>
                        <span style={{ ...S.archTag, color: ac, borderColor: ac + "55" }}>{m.arch}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <React.Fragment key={g}>
                  <tr>
                    <td colSpan={models.length + 1} style={SC.groupRow}>{g}</td>
                  </tr>
                  {AXES.filter((a) => a.group === g).map((axis) => {
                    const vals = models.map((m) => axis.pick(m));
                    // Mark AGREEMENT, not difference. In a 3–4 way comparison almost
                    // every row differs, so a "differs" highlight lights up the whole
                    // table and says nothing; two models landing on the same value is
                    // the rarer, more informative signal — and it is what the planned
                    // synthesis feature keys off (shared trait vs. point of divergence).
                    const counts = vals.reduce((acc, v) => {
                      if (v) acc.set(v, (acc.get(v) || 0) + 1);
                      return acc;
                    }, new Map());
                    return (
                      <tr key={axis.label}>
                        <th scope="row" style={SC.axisCell}>
                          {axis.label}
                          {axis.hint && <span style={SC.axisHint}>{axis.hint}</span>}
                        </th>
                        {vals.map((v, i) => (
                          <ValueCell key={i} value={v} shared={v && counts.get(v) > 1}
                            wide={axis.wide} gloss={axis.gloss ? axis.gloss(models[i]) : null}
                            links={axis.links ? axis.links(models[i]) : null} />
                        ))}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Training pipelines: too structural for the grid above, so shown as parallel columns */}
        <section style={{ marginTop: 40 }}>
          <div style={S.eyebrow}>Training pipelines</div>
          <p style={{ ...S.sub, marginBottom: 20 }}>
            Stage-by-stage, as published. Token budgets appear only where the provider
            disclosed them; a pipeline with no budgets is not a smaller pipeline.
          </p>
          <div style={SC.pipeCols}>
            {models.map((m) => (
              <div key={m.name} style={SC.pipeCol}>
                <div style={SC.pipeHead}>{m.name}</div>
                {m.trainingSource && (
                  <div style={S.provenance}>
                    <span style={S.provenanceTag}>Not this model's own figures</span>
                    <p style={S.provenanceText}>{m.trainingSource}</p>
                  </div>
                )}
                {m.training ? (
                  m.training.map((st, i) => (
                    <div key={i} style={SC.pipeStage}>
                      <div style={SC.pipeStageHead}>
                        <span style={S.stageNum}>{i + 1}</span>
                        <span style={SC.pipeStageName}>{st.label}</span>
                      </div>
                      {st.tokens && (
                        <span style={{ ...S.stageTokens, ...(String(st.tokens).startsWith("~") ? S.stageTokensEst : {}) }}>
                          {st.tokens} tokens{String(st.tokens).startsWith("~") ? " (est.)" : ""}
                        </span>
                      )}
                      <p style={SC.pipeText}>{st.detail}</p>
                      {st.curriculum && (
                        <div style={S.curriculum}>
                          <span style={S.curriculumLabel}>Data curriculum</span>
                          <p style={S.curriculumText}>{st.curriculum}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={SC.pipeNA}>
                    {m.open
                      ? "No detailed training breakdown published."
                      : "Closed model — no training stages published."}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Architecture diagrams, where the gallery has one */}
        {models.some((m) => DIAGRAMS[m.name]) && (
          <section style={{ marginTop: 40 }}>
            <div style={S.eyebrow}>Architecture diagrams</div>
            <div style={SC.diagRow}>
              {models.map((m) => {
                const d = DIAGRAMS[m.name];
                return (
                  <div key={m.name} style={SC.diagCell}>
                    <div style={SC.pipeHead}>{m.name}</div>
                    {d ? (
                      <a href={`${DIAGRAM_BASE}/images/architectures/${d.slug}.webp`}
                        target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                        <img
                          src={`${DIAGRAM_BASE}/images/architectures/thumbnails/${d.slug}.webp`}
                          alt={`Architecture diagram of ${d.title}`}
                          loading="lazy"
                          style={SC.diagImg}
                          onError={(e) => {
                            if (!e.currentTarget.dataset.fellBack) {
                              e.currentTarget.dataset.fellBack = "1";
                              e.currentTarget.src = `${LOCAL_DIAGRAM_BASE}/thumbnails/${d.slug}.webp`;
                            }
                          }}
                        />
                      </a>
                    ) : (
                      <p style={SC.pipeNA}>No diagram published.</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={S.diagramCredit}>
              Diagrams © <a style={S.creditLink} href={DIAGRAM_CREDIT} target="_blank" rel="noopener noreferrer">
                Sebastian Raschka</a> · LLM Architecture Gallery
            </div>
          </section>
        )}

        <section style={{ marginTop: 40, marginBottom: 20 }}>
          <div style={S.eyebrow}>Sources</div>
          <div style={SC.srcGrid}>
            {models.map((m) => (
              <div key={m.name} style={SC.srcCell}>
                <div style={SC.pipeHead}>{m.name}</div>
                {REPORTS[m.name] ? (
                  <a style={S.link} href={REPORTS[m.name].url} target="_blank" rel="noopener noreferrer">
                    {REPORTS[m.name].label} ↗
                  </a>
                ) : <span style={S.linkNA}>none published</span>}
                {m.open && HF_LINKS[m.name] && (
                  <a style={S.link} href={`https://huggingface.co/${HF_LINKS[m.name]}`}
                    target="_blank" rel="noopener noreferrer">{HF_LINKS[m.name]} ↗</a>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const SC = {
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 16, marginBottom: 22 },
  back: { display: "inline-flex", alignItems: "center", gap: 9,
    background: "transparent", border: `1px solid var(--line)`, borderRadius: 999,
    padding: "7px 16px 7px 9px", cursor: "pointer", fontFamily: mono, fontSize: 11,
    letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-soft)" },
  backLogo: { width: 22, height: "auto", display: "block", flexShrink: 0 },
  count: { fontFamily: mono, fontSize: 11.5, color: "var(--ink-faint)" },
  legendSwatch: { display: "inline-block", width: 11, height: 11, borderRadius: 3,
    background: "var(--tok-ok-bg)", border: "1px solid var(--tok-ok-fg)",
    marginRight: 8, verticalAlign: "baseline" },
  warn: { padding: "10px 14px", borderRadius: 9, background: "var(--tok-est-bg)",
    border: `1px solid var(--tok-est-line)`, color: "var(--tok-est-fg)",
    fontSize: 13, marginBottom: 18 },
  wrap: { overflowX: "auto", border: `1px solid var(--line)`, borderRadius: 14,
    background: "var(--card)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: { textAlign: "left", padding: "16px 16px 14px", borderBottom: `1px solid var(--line)`,
    verticalAlign: "top", minWidth: 210 },
  thAxis: { minWidth: 190, width: 190 },
  modelName: { fontFamily: serif, fontSize: 19, fontWeight: 500, color: "var(--ink)",
    marginBottom: 8, lineHeight: 1.2 },
  modelMeta: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  groupRow: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.14em",
    textTransform: "uppercase", color: "var(--clay)", padding: "18px 16px 7px",
    background: "var(--detail-bg)", borderTop: `1px solid var(--line)` },
  axisCell: { textAlign: "left", fontWeight: 500, color: "var(--ink-soft)",
    padding: "12px 16px", verticalAlign: "top", borderBottom: `1px solid var(--line-soft)`,
    fontSize: 13, width: 190 },
  axisHint: { display: "block", fontSize: 11, color: "var(--ink-faint)", fontWeight: 400,
    marginTop: 3, lineHeight: 1.45 },
  cell: { padding: "12px 16px", verticalAlign: "top", color: "var(--ink)",
    borderBottom: `1px solid var(--line-soft)`, lineHeight: 1.6 },
  cellWide: { fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-soft)" },
  valueText: { display: "block" },
  linkStack: { display: "flex", flexDirection: "column", gap: 7, fontSize: 12 },
  // Plain-language explanation of what this particular value implies.
  gloss: { display: "block", marginTop: 7, fontSize: 11.5, lineHeight: 1.6,
    color: "var(--ink-faint)", paddingLeft: 9, borderLeft: `2px solid var(--line)` },
  cellShared: { background: "var(--tok-ok-bg)", boxShadow: "inset 2px 0 0 var(--tok-ok-fg)" },
  cellEmpty: { padding: "12px 16px", verticalAlign: "top", color: "var(--ink-faint)",
    borderBottom: `1px solid var(--line-soft)` },
  pipeCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 },
  pipeCol: { minWidth: 0 },
  pipeHead: { fontFamily: mono, fontSize: 11, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 10,
    paddingBottom: 8, borderBottom: `1px solid var(--line)` },
  pipeStage: { background: "var(--card)", border: `1px solid var(--line)`, borderRadius: 10,
    padding: "13px 15px", marginBottom: 10 },
  pipeStageHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  pipeStageName: { fontSize: 13.5, fontWeight: 650, color: "var(--ink)" },
  pipeText: { margin: 0, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-soft)" },
  pipeNA: { margin: 0, fontSize: 13, fontStyle: "italic", color: "var(--ink-faint)", lineHeight: 1.6 },
  diagRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 },
  diagCell: { minWidth: 0 },
  diagImg: { width: "100%", height: "auto", display: "block", borderRadius: 9,
    border: `1px solid var(--line)`, background: "var(--card)" },
  srcGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 },
  srcCell: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0, fontSize: 12.5 },
};

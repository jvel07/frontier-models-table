import React, { useMemo } from "react";
import {
  MODELS, SPECS, REPORTS, HF_LINKS, DIAGRAMS, ARCH_COLORS, TYPE_COLORS,
  ATTENTION_INFO, DIAGRAM_BASE, LOCAL_DIAGRAM_BASE, DIAGRAM_CREDIT,
  S, mono, serif, fmtTokens, totalTokens,
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

// One row of the comparison. `group` buckets rows into sections.
const AXES = [
  { group: "Identity", label: "Provider", pick: (m) => m.provider },
  { group: "Identity", label: "Released", pick: (m) => m.released },
  { group: "Identity", label: "Class", pick: (m) => m.type },
  { group: "Identity", label: "Licence", pick: (m) => m.license },
  { group: "Identity", label: "Weights", pick: (m) => (m.open ? "Open" : "Proprietary") },
  { group: "Identity", label: "Intelligence (AA)", pick: (m) => (m.intel == null ? null : String(m.intel)),
    hint: "Artificial Analysis Intelligence Index v4.1" },

  { group: "Scale", label: "Total params", pick: (m) => (m.params === "—" ? null : m.params) },
  { group: "Scale", label: "Active params", pick: (m) => (m.active === "—" ? null : m.active) },
  { group: "Scale", label: "Sparsity", pick: sparsity, hint: "Share of weights that fire per token" },
  { group: "Scale", label: "Layers", pick: (m) => (spec(m, "layers") ? String(spec(m, "layers")) : null) },
  { group: "Scale", label: "Hidden size", pick: (m) => spec(m, "hidden") },

  { group: "Architecture", label: "Family", pick: (m) => m.arch },
  { group: "Architecture", label: "Layer composition", pick: (m) => spec(m, "layerMix"),
    hint: "Counted from layer_types in config.json" },
  { group: "Architecture", label: "Experts", pick: (m) => spec(m, "experts"),
    hint: "Routed · active per token · shared" },

  { group: "Attention", label: "Mechanism", pick: (m) => m.attn },
  { group: "Attention", label: "Heads", pick: (m) => spec(m, "heads"),
    hint: "Query / key-value heads; the ratio is the GQA grouping" },
  { group: "Attention", label: "Sliding window", pick: (m) => spec(m, "window") },

  { group: "Positional encoding", label: "Scheme", pick: (m) => spec(m, "posEmb"), wide: true,
    hint: "Read from rope_theta, partial_rotary_factor and per-layer rope_parameters in config.json" },

  { group: "Tokenizer", label: "Vocabulary", pick: (m) => spec(m, "vocab"),
    hint: "vocab_size from config.json" },

  { group: "Context", label: "Context window", pick: (m) => fmtTokens(m.context) },
  { group: "Context", label: "Max output", pick: (m) => (m.maxOut == null ? null : fmtTokens(m.maxOut)) },
  { group: "Context", label: "Modality", pick: (m) => m.modality },

  { group: "Training", label: "Disclosed stages", pick: (m) => (m.training ? String(m.training.length) : null) },
  { group: "Training", label: "Disclosed tokens", pick: (m) => {
      const tt = totalTokens(m.training);
      return tt ? `~${tt.total}${tt.hasEst ? " (incl. est.)" : ""}` : null;
    } },
];

const GROUPS = [...new Set(AXES.map((a) => a.group))];

function ValueCell({ value, shared, wide }) {
  if (!value) return <td style={SC.cellEmpty}>—</td>;
  return (
    <td style={{ ...SC.cell, ...(wide ? SC.cellWide : {}), ...(shared ? SC.cellShared : {}) }}>
      {value}
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
                      <div style={SC.modelName}>{m.name}</div>
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
                          <ValueCell key={i} value={v} shared={v && counts.get(v) > 1} wide={axis.wide} />
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

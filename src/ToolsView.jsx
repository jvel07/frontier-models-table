import React, { useMemo, useState } from "react";
import { ProviderMark } from "./providerIcons.jsx";
import SiteNav from "./SiteNav.jsx";
import { MODELS, SPECS, S, mono, serif } from "./FrontierModelsTable.jsx";
import { kvBytesPerToken, weightBytes, parseCount, parseHeads, fmtBytes } from "./metrics.js";

/**
 * The working end of the atlas: things you compute rather than read.
 *
 * Everything here runs off the same recorded fields as the table. Where a number
 * cannot be derived honestly the tool says so instead of printing something — MLA
 * caches a latent rather than per-head K/V, and hybrid stacks carry a fixed
 * recurrent state, so a per-token cache figure is simply not defined for them.
 */

const DTYPES = [
  { key: "fp16", label: "fp16 / bf16", bytes: 2 },
  { key: "fp8", label: "fp8", bytes: 1 },
  { key: "int4", label: "int4", bytes: 0.5 },
];

const GPUS = [
  { key: "h100", label: "H100 80GB", gb: 80 },
  { key: "a100", label: "A100 80GB", gb: 80 },
  { key: "l40s", label: "L40S 48GB", gb: 48 },
  { key: "rtx4090", label: "RTX 4090 24GB", gb: 24 },
];

const GB = 1024 ** 3;

/* ------------------------------------------------------------ calculator -- */

function Calculator() {
  const usable = useMemo(
    () => MODELS.filter((m) => SPECS[m.name] && parseCount(m.params))
      .sort((a, b) => a.name.localeCompare(b.name)), []);
  const [name, setName] = useState(() => (usable.find((m) => /Kimi K2.6/.test(m.name)) || usable[0]).name);
  const [ctxLen, setCtxLen] = useState(131072);
  const [batch, setBatch] = useState(1);
  const [wDtype, setWDtype] = useState("fp16");
  const [kvDtype, setKvDtype] = useState("fp16");
  const [gpu, setGpu] = useState("h100");

  const model = MODELS.find((m) => m.name === name);
  const spec = SPECS[name];
  const wBytes = DTYPES.find((d) => d.key === wDtype).bytes;
  const kBytes = DTYPES.find((d) => d.key === kvDtype).bytes;
  const card = GPUS.find((g) => g.key === gpu);

  const weights = weightBytes(model, wBytes);
  const kv = kvBytesPerToken(model, spec, kBytes);
  const kvTotal = kv && kv.bytes ? kv.bytes * ctxLen * batch : null;
  const total = weights != null && kvTotal != null ? weights + kvTotal : null;
  const cards = total != null ? Math.ceil(total / (card.gb * GB)) : null;
  const maxCtx = kv && kv.bytes && weights != null
    ? Math.max(0, Math.floor(((card.gb * GB) - weights) / (kv.bytes * batch)))
    : null;

  return (
    <section style={T.panel}>
      <h2 style={T.h2}>Memory calculator</h2>
      <p style={T.blurb}>
        What it actually costs to hold a model and its cache. Weights scale with total
        parameters — every expert has to be resident even on a sparse model, which is the tax
        you pay for MoE — while the KV cache scales with context and batch.
      </p>

      <div style={T.grid}>
        <label style={T.field}>
          <span style={T.label}>Model</span>
          <select style={T.input} value={name} onChange={(e) => setName(e.target.value)}>
            {usable.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        </label>
        <label style={T.field}>
          <span style={T.label}>Context tokens</span>
          <input style={T.input} type="number" min="1024" step="1024" value={ctxLen}
            onChange={(e) => setCtxLen(Math.max(1, +e.target.value || 1))} />
        </label>
        <label style={T.field}>
          <span style={T.label}>Batch (concurrent sequences)</span>
          <input style={T.input} type="number" min="1" value={batch}
            onChange={(e) => setBatch(Math.max(1, +e.target.value || 1))} />
        </label>
        <label style={T.field}>
          <span style={T.label}>Weight precision</span>
          <select style={T.input} value={wDtype} onChange={(e) => setWDtype(e.target.value)}>
            {DTYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label style={T.field}>
          <span style={T.label}>KV cache precision</span>
          <select style={T.input} value={kvDtype} onChange={(e) => setKvDtype(e.target.value)}>
            {DTYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label style={T.field}>
          <span style={T.label}>Accelerator</span>
          <select style={T.input} value={gpu} onChange={(e) => setGpu(e.target.value)}>
            {GPUS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
      </div>

      {kv && kv.unsupported ? (
        <div style={T.warn} data-calc="unsupported">
          <strong style={T.warnHead}>No per-token cache figure for this model.</strong>{" "}
          {kv.unsupported}. Weights alone come to {fmtBytes(weights)} at {wDtype}. Serving cost
          here is dominated by the parts the atlas does not record, so a number would be
          invented rather than derived.
        </div>
      ) : total == null ? (
        <div style={T.warn} data-calc="incomplete">
          Not enough is published about this model's layer and head configuration to derive a
          cache size.
        </div>
      ) : (
        <>
          <div style={T.results} data-calc="ok">
            {[
              ["Weights", fmtBytes(weights), `${model.params} at ${wDtype}`],
              ["KV cache", fmtBytes(kvTotal), `${(ctxLen / 1024).toFixed(0)}K × ${batch} seq`],
              ["Total", fmtBytes(total), `${cards} × ${card.label.split(" ")[0]}`],
              ["Longest context on one card", maxCtx ? `${(maxCtx / 1024).toFixed(0)}K` : "—",
                `batch ${batch}, weights resident`],
            ].map(([k, v, sub]) => (
              <div key={k} style={T.result}>
                <div style={T.resultLabel}>{k}</div>
                <div style={T.resultValue}>{v}</div>
                <div style={T.resultSub}>{sub}</div>
              </div>
            ))}
          </div>
          <p style={T.formula}>
            KV bytes/token = 2 × {kv.layers} layers × {kv.kvHeads} KV heads × {kv.headDim} head
            dim × {kBytes} bytes = <strong>{fmtBytes(kv.bytes)}</strong> per token.
            {kv.assumedHeadDim && " Head dimension is taken as hidden ÷ query heads, the usual construction, since the atlas does not record it separately."}
            {" "}Activations, fragmentation and framework overhead are not included, so treat
            the total as a floor.
          </p>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- synthesis -- */

const AXES = [
  { key: "attn", label: "Attention", get: (m) => m.attn },
  { key: "arch", label: "Topology", get: (m) => m.arch },
  { key: "experts", label: "Experts", get: (m) => (SPECS[m.name] || {}).experts },
  { key: "layers", label: "Depth", get: (m) => (SPECS[m.name] || {}).layers },
  { key: "hidden", label: "Width", get: (m) => (SPECS[m.name] || {}).hidden },
  { key: "heads", label: "Heads", get: (m) => (SPECS[m.name] || {}).heads },
  { key: "posEmb", label: "Positional", get: (m) => (SPECS[m.name] || {}).posEmb },
  { key: "vocab", label: "Vocabulary", get: (m) => (SPECS[m.name] || {}).vocab },
  { key: "window", label: "Local window", get: (m) => (SPECS[m.name] || {}).window },
];

/**
 * The recombination CompareView's axes were always shaped for: take each dimension
 * from whichever parent you prefer and read the result back as a config sketch.
 *
 * It is a sketch, not a trainable config — the atlas records nine axes, and a real
 * config.json carries several dozen. What it is good for is seeing whether a
 * combination anyone has actually shipped exists, and where your choices are mutually
 * inconsistent.
 */
function Synthesis() {
  const parents = useMemo(
    () => MODELS.filter((m) => SPECS[m.name]).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [picked, setPicked] = useState(() => {
    const seed = ["Kimi K3", "Gemma 4 (31B)", "DeepSeek V4 Pro"].filter((n) => SPECS[n]);
    return seed.length >= 2 ? seed : parents.slice(0, 3).map((m) => m.name);
  });
  const [choice, setChoice] = useState({});

  const chosen = picked.map((n) => MODELS.find((m) => m.name === n)).filter(Boolean);
  const pick = (axis) => choice[axis] || (chosen[0] && chosen[0].name);

  const config = AXES.map((a) => {
    const from = MODELS.find((m) => m.name === pick(a.key));
    return { axis: a, from, value: from ? a.get(from) : null };
  });

  const asJson = useMemo(() => {
    const o = { _note: "Sketch assembled from the Model Atlas. Not a trainable config." };
    for (const c of config) if (c.value != null) o[c.axis.key] = { value: String(c.value), from: c.from.name };
    return JSON.stringify(o, null, 2);
  }, [config]);

  const kvNote = (() => {
    const attn = config.find((c) => c.axis.key === "attn");
    const heads = config.find((c) => c.axis.key === "heads");
    if (!attn || !attn.value) return null;
    if (/MLA/i.test(attn.value) && heads && heads.from.name !== attn.from.name)
      return "Head counts taken from a non-MLA parent will not describe an MLA cache — MLA splits each head into a rotated slice and a compressed one.";
    if (/DeltaNet|KDA|Mamba/i.test(attn.value))
      return "A linear or hybrid attention choice makes the layer count a mix, not a single number: the ratio of linear to full layers is the design decision, and the atlas records it in Layer composition rather than Depth.";
    return null;
  })();

  return (
    <section style={T.panel}>
      <h2 style={T.h2}>Architecture synthesis</h2>
      <p style={T.blurb}>
        Pick parents, then take each axis from whichever one you want. This is the
        recombination the comparison view's discrete axes were built for — useful for
        checking whether a combination you are considering has ever actually been shipped,
        and for catching choices that contradict each other.
      </p>

      <div style={T.parents}>
        {parents.slice(0, 400).length > 0 && (
          <select style={{ ...T.input, maxWidth: 260 }} value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v && !picked.includes(v) && picked.length < 4) setPicked([...picked, v]);
            }}>
            <option value="">Add a parent…</option>
            {parents.filter((m) => !picked.includes(m.name))
              .map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
          </select>
        )}
        {chosen.map((m) => (
          <span key={m.name} style={T.parentChip}>
            <ProviderMark provider={m.provider} />
            {m.name}
            <button style={T.chipX} onClick={() => {
              setPicked(picked.filter((n) => n !== m.name));
              setChoice(Object.fromEntries(Object.entries(choice).filter(([, v]) => v !== m.name)));
            }} aria-label={`Remove ${m.name}`}>×</button>
          </span>
        ))}
      </div>

      {chosen.length < 2 ? (
        <div style={T.warn}>Pick at least two parents to recombine.</div>
      ) : (
        <>
          <div style={T.synthWrap}>
            <table style={T.synthTable}>
              <thead>
                <tr>
                  <th style={T.sth}>Axis</th>
                  <th style={T.sth}>Taken from</th>
                  <th style={T.sth}>Value</th>
                </tr>
              </thead>
              <tbody>
                {config.map((c) => (
                  <tr key={c.axis.key} style={T.str} data-axis={c.axis.key}>
                    <td style={T.std}>{c.axis.label}</td>
                    <td style={T.std}>
                      <div style={S.segGroup}>
                        {chosen.map((m) => (
                          <button key={m.name}
                            onClick={() => setChoice({ ...choice, [c.axis.key]: m.name })}
                            style={{ ...S.seg, fontSize: 11.5,
                              ...(pick(c.axis.key) === m.name ? S.segOn : {}) }}>
                            {m.name.length > 16 ? m.name.slice(0, 15) + "…" : m.name}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...T.std, ...T.stdValue }}>{c.value == null ? "—" : String(c.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {kvNote && <div style={T.warn}><strong style={T.warnHead}>Inconsistent.</strong> {kvNote}</div>}

          <details style={T.details}>
            <summary style={T.summary}>Read it back as JSON</summary>
            <pre style={T.pre}>{asJson}</pre>
          </details>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ data -- */

function DataSection() {
  const base = import.meta.env.BASE_URL;
  const bibtex = `@misc{modelatlas,
  title  = {The Model Atlas: how frontier and small language models are actually built},
  author = {{The Model Atlas}},
  year   = {2026},
  url    = {https://jvel07.github.io/frontier-models-table/}
}`;
  return (
    <section style={T.panel} id="data">
      <h2 style={T.h2}>Take the data</h2>
      <p style={T.blurb}>
        Every model, every recorded field, and the derived metrics, regenerated on each build.
        Fields under <code style={T.code}>derived</code> are computed by this project and carry
        the formula used, so nothing computed can be mistaken for something a lab published —
        the distinction the whole atlas rests on. A null means no source stated it, never zero.
      </p>
      <div style={T.files}>
        {[
          ["models.json", "Full records, nested, with derived metrics", `${base}data/models.json`],
          ["models.csv", "One flat row per model, for spreadsheets", `${base}data/models.csv`],
          ["schema.json", "What every field means", `${base}data/schema.json`],
        ].map(([name, desc, href]) => (
          <a key={name} style={T.file} href={href} download>
            <span style={T.fileName}>{name}</span>
            <span style={T.fileDesc}>{desc}</span>
          </a>
        ))}
      </div>
      <div style={T.snippet}>
        <div style={T.snippetHead}>Python</div>
        <pre style={T.pre}>{`import pandas as pd
df = pd.read_csv("https://jvel07.github.io/frontier-models-table/data/models.csv")
df[df.open_weights].sort_values("tokens_per_param", ascending=False).head()`}</pre>
      </div>
      <div style={T.snippet}>
        <div style={T.snippetHead}>Citation</div>
        <pre style={T.pre}>{bibtex}</pre>
      </div>
    </section>
  );
}

export default function ToolsView() {
  return (
    <div style={S.page}>
      <div style={S.shell}>
        <SiteNav current="tools" />
        <header style={{ marginBottom: 20 }}>
          <div style={S.eyebrow}>Tools</div>
          <h1 style={{ ...S.title, fontSize: "clamp(30px, 5vw, 56px)" }}>Work with it</h1>
          <p style={S.sub}>
            The atlas as something to compute with rather than only read: what a model costs to
            hold in memory, what happens if you recombine two of them, and the whole dataset as
            a file.
          </p>
        </header>
        <Calculator />
        <Synthesis />
        <DataSection />
        <footer style={{ ...S.footer, marginTop: 34 }}>
          <span>
            The calculator derives cache size from layer and head counts read from each model's
            config.json. It excludes activations, fragmentation and framework overhead, and it
            refuses to produce a figure for MLA and hybrid models rather than applying a formula
            that does not describe them.
          </span>
        </footer>
      </div>
    </div>
  );
}

const T = {
  panel: { marginTop: 38 },
  h2: { fontFamily: serif, fontSize: "clamp(20px, 2.5vw, 27px)", fontWeight: 500,
    color: "var(--ink)", margin: "0 0 6px" },
  blurb: { color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.62, maxWidth: 700,
    margin: "0 0 18px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12,
    marginBottom: 18 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase",
    color: "var(--ink-faint)" },
  input: { padding: "9px 11px", borderRadius: 6, border: "1px solid var(--line)",
    background: "var(--card)", color: "var(--ink)", fontSize: 13.5, fontFamily: "inherit",
    width: "100%", boxSizing: "border-box" },
  results: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12, marginBottom: 14 },
  result: { border: "1px solid var(--line)", borderRadius: 10, background: "var(--card)",
    padding: "13px 15px" },
  resultLabel: { fontFamily: mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
    color: "var(--ink-faint)" },
  resultValue: { fontFamily: serif, fontSize: 25, color: "var(--ink)", margin: "5px 0 3px" },
  resultSub: { fontFamily: mono, fontSize: 10.5, color: "var(--ink-faint)" },
  formula: { fontFamily: mono, fontSize: 11.5, lineHeight: 1.65, color: "var(--ink-soft)",
    background: "var(--detail-bg)", border: "1px solid var(--line)", borderRadius: 8,
    padding: "11px 13px", margin: 0 },
  warn: { border: "1px solid var(--line)", borderLeft: "3px solid var(--clay)", borderRadius: 8,
    background: "var(--detail-bg)", padding: "12px 14px", color: "var(--ink-soft)",
    fontSize: 13.5, lineHeight: 1.6, marginTop: 12 },
  warnHead: { color: "var(--clay)" },
  parents: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 },
  parentChip: { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--line)",
    borderRadius: 20, padding: "5px 6px 5px 11px", fontSize: 13, background: "var(--card)",
    color: "var(--ink)" },
  chipX: { border: "none", background: "none", color: "var(--ink-faint)", cursor: "pointer",
    fontSize: 15, lineHeight: 1, padding: "0 5px" },
  synthWrap: { overflow: "auto", border: "1px solid var(--line)", borderRadius: 10,
    background: "var(--card)" },
  synthTable: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  sth: { textAlign: "left", padding: "10px 13px", fontFamily: mono, fontSize: 10,
    letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-soft)",
    borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" },
  str: { borderBottom: "1px solid var(--line-soft)" },
  std: { padding: "9px 13px", color: "var(--ink)", verticalAlign: "middle" },
  stdValue: { fontFamily: mono, fontSize: 11.5, color: "var(--ink-soft)" },
  details: { marginTop: 14 },
  summary: { cursor: "pointer", fontFamily: mono, fontSize: 12, color: "var(--ink-soft)" },
  pre: { fontFamily: mono, fontSize: 11.5, lineHeight: 1.6, color: "var(--ink)",
    background: "var(--detail-bg)", border: "1px solid var(--line)", borderRadius: 8,
    padding: "12px 14px", overflow: "auto", margin: "8px 0 0" },
  files: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12, marginBottom: 18 },
  file: { display: "block", border: "1px solid var(--line)", borderRadius: 10,
    background: "var(--card)", padding: "14px 16px", textDecoration: "none" },
  fileName: { display: "block", fontFamily: mono, fontSize: 13.5, color: "var(--clay)" },
  fileDesc: { display: "block", fontSize: 12.5, color: "var(--ink-soft)", marginTop: 5,
    lineHeight: 1.5 },
  snippet: { marginTop: 14 },
  snippetHead: { fontFamily: mono, fontSize: 10.5, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "var(--ink-faint)" },
  code: { fontFamily: mono, fontSize: 12.5, background: "var(--detail-bg)", padding: "1px 5px",
    borderRadius: 4 },
};

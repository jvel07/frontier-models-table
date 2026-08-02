import React, { useMemo, useState } from "react";
import { ProviderMark } from "./providerIcons.jsx";
import SiteNav from "./SiteNav.jsx";
import {
  MODELS, REPORTS, ATTENTION_INFO, ARCH_PAPERS, positionalPapers,
  S, mono, serif,
} from "./FrontierModelsTable.jsx";

/**
 * Every paper the atlas cites, one row each, against the models that use its work.
 *
 * The mapping is derived from the existing citation maps rather than hand-written,
 * so a paper can never drift out of sync with the models pointing at it:
 *
 *   REPORTS[name]          the model's own technical report  -> that one model
 *   ATTENTION_INFO[attn]   the mechanism's founding paper    -> every model using it
 *   ARCH_PAPERS[arch]      the topology's founding papers    -> every model using it
 *   positionalPapers(m)    matched against the model's posEmb from its config.json
 *
 * Grouping is by URL, not by label: the same paper is cited under slightly different
 * labels in different maps (Switch Transformer appears three ways), and grouping by
 * label would list it three times as if they were separate works.
 */

const KINDS = [
  { key: "report", short: "Reports", label: "Technical report" },
  { key: "attention", short: "Attention", label: "Attention" },
  { key: "arch", short: "Arch", label: "Architecture" },
  { key: "position", short: "Position", label: "Positional" },
];

function collect() {
  const byUrl = new Map();
  const add = (paper, model, kind) => {
    if (!paper || !paper.url) return;
    let e = byUrl.get(paper.url);
    if (!e) {
      e = { url: paper.url, label: paper.label, kinds: new Set(), models: [] };
      byUrl.set(paper.url, e);
    }
    // Keep the longest label seen: the fuller one names the paper, the short one
    // is usually just an id.
    if (paper.label && paper.label.length > e.label.length) e.label = paper.label;
    e.kinds.add(kind);
    if (!e.models.some((m) => m.name === model.name)) e.models.push(model);
  };

  for (const m of MODELS) {
    add(REPORTS[m.name], m, "report");
    add((ATTENTION_INFO[m.attn] || {}).paper, m, "attention");
    for (const p of ARCH_PAPERS[m.arch] || []) add(p, m, "arch");
    for (const p of positionalPapers(m)) add(p, m, "position");
  }

  return [...byUrl.values()].sort(
    (a, b) => b.models.length - a.models.length || a.label.localeCompare(b.label)
  );
}

const arxivId = (url) => (url.match(/arxiv\.org\/(?:abs|pdf)\/([\d.]+)/) || [])[1] || null;

export default function PapersView() {
  const papers = useMemo(collect, []);
  const [kind, setKind] = useState("All");
  const [q, setQ] = useState("");

  const rows = useMemo(() => papers.filter((p) => {
    if (kind !== "All" && !p.kinds.has(kind)) return false;
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return p.label.toLowerCase().includes(needle) ||
      p.models.some((m) => m.name.toLowerCase().includes(needle) ||
        m.provider.toLowerCase().includes(needle));
  }), [papers, kind, q]);

  const cited = new Set();
  for (const p of papers) for (const m of p.models) cited.add(m.name);

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <SiteNav current="papers" />

        <header style={{ marginBottom: 26 }}>
          <div style={S.eyebrow}>Bibliography</div>
          <h1 style={{ ...S.title, fontSize: "clamp(30px, 5vw, 56px)" }}>Papers</h1>
          <p style={S.sub}>
            Every paper this atlas cites, against the models that use its work. A model
            appears beside a paper for one of four reasons: it is that model's own technical
            report, or the paper introduced the attention mechanism, the architecture, or the
            positional scheme the model is recorded as using. Rows are ordered by how many
            models rest on them, which is a rough map of what the current generation is
            actually built out of.
          </p>
        </header>

        <div style={P.controls}>
          <input style={S.search} placeholder="Search paper, model or provider…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          {/* These labels are longer than the atlas's filters, so the group has to be
              allowed to wrap or it runs off a narrow screen. */}
          <div style={{ ...S.segGroup, flexWrap: "wrap" }}>
            {["All", ...KINDS.map((k) => k.key)].map((k) => {
              const label = k === "All" ? "All" : KINDS.find((x) => x.key === k).short;
              return (
                <button key={k} onClick={() => setKind(k)}
                  style={{ ...S.seg, ...(kind === k ? S.segOn : {}) }}>{label}</button>
              );
            })}
          </div>
        </div>

        <div style={S.count}>
          {rows.length} paper{rows.length === 1 ? "" : "s"} · {cited.size} of {MODELS.length} models
          cite at least one
        </div>

        <div style={P.wrap}>
          <table style={P.table}>
            <thead>
              <tr>
                <th style={{ ...P.th, ...P.thPaper }}>Paper</th>
                <th style={P.th}>Models</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const id = arxivId(p.url);
                return (
                  <tr key={p.url} style={P.tr} data-paper={p.url}>
                    <td style={{ ...P.td, ...P.tdPaper }}>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" style={P.link}>
                        {p.label}
                      </a>
                      <div style={P.meta}>
                        {[...p.kinds].map((k) => (
                          <span key={k} style={P.tag}>
                            {KINDS.find((x) => x.key === k)?.label || k}
                          </span>
                        ))}
                        {id && <span style={P.arxiv}>arXiv:{id}</span>}
                      </div>
                    </td>
                    <td style={P.td}>
                      <div style={P.models}>
                        {p.models.map((m) => (
                          <span key={m.name} style={P.model} title={m.provider}>
                            <ProviderMark provider={m.provider} />
                            {m.name}
                          </span>
                        ))}
                      </div>
                      <div style={P.countCell}>{p.models.length}</div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td style={P.td} colSpan={2}>Nothing matches that search.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer style={{ ...S.footer, marginTop: 30 }}>
          <span>
            A model is listed beside a paper because the atlas records it as using that
            work — its own report, its attention mechanism, its architecture family, or the
            positional scheme read from its config.json. It is not a claim that the authors
            were involved in the model, nor that the model's builders cited the paper
            themselves.
          </span>
          <span>
            Papers are grouped by URL rather than by title, because the same work is cited
            under different labels in different parts of the atlas. Closed models with no
            published report contribute only the papers behind whatever architecture and
            attention they are reported to use, and the fully undisclosed ones contribute
            none at all.
          </span>
        </footer>
      </div>
    </div>
  );
}

const P = {
  controls: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 },
  wrap: { overflow: "auto", maxHeight: "clamp(380px, 74vh, 1000px)",
    border: "1px solid var(--line)", borderRadius: 10, background: "var(--card)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { position: "sticky", top: 0, zIndex: 2, background: "var(--card)",
    textAlign: "left", padding: "12px 16px", fontFamily: mono, fontSize: 11,
    letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-soft)",
    borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" },
  thPaper: { width: "44%" },
  tr: { borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" },
  td: { padding: "14px 16px", color: "var(--ink)", lineHeight: 1.5 },
  tdPaper: { borderRight: "1px solid var(--line-soft)" },
  link: { color: "var(--ink)", textDecoration: "none", fontFamily: serif, fontSize: 15.5,
    lineHeight: 1.35, borderBottom: "1px solid var(--clay-soft)" },
  meta: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" },
  tag: { fontFamily: mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
    color: "var(--ink-soft)", border: "1px solid var(--line)", borderRadius: 4,
    padding: "2px 6px", whiteSpace: "nowrap" },
  arxiv: { fontFamily: mono, fontSize: 10.5, color: "var(--ink-faint)" },
  models: { display: "flex", flexWrap: "wrap", gap: "7px 10px" },
  model: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13,
    color: "var(--ink)", whiteSpace: "nowrap" },
  countCell: { marginTop: 9, fontFamily: mono, fontSize: 10.5, color: "var(--ink-faint)" },
};

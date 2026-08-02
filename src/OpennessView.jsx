import React, { useMemo, useState } from "react";
import { ProviderMark } from "./providerIcons.jsx";
import SiteNav from "./SiteNav.jsx";
import { MODELS, SPECS, REPORTS, HF_LINKS, S, mono, serif } from "./FrontierModelsTable.jsx";
import {
  disclosure, openness, byProvider, DISCLOSURE_FIELDS, OPEN_VERBS,
} from "./metrics.js";

/**
 * Openness, on two axes that are usually collapsed into one and should not be.
 *
 * The horizontal axis is the test from "Open Weights and American AI Leadership"
 * (NVIDIA and others, 24 July 2026): can anyone download, inspect, modify and run
 * this on their own infrastructure? That letter is about the availability of weights.
 *
 * The vertical axis is the one the letter does not address and this atlas is unusually
 * well placed to score: did the lab say how the thing was built? Twelve fields, each
 * one the atlas already had to either fill in from a primary source or leave blank.
 *
 * Keeping them apart is the point. Open weights with no documentation is a real and
 * common position, and so is a detailed report for a model nobody can download.
 */

const LETTER = {
  title: "Open Weights and American AI Leadership",
  date: "24 July 2026",
  url: "https://images.nvidia.com/pdf/Open-Weights-and-American-AI-Leadership.pdf",
};

const VERB_LABEL = {
  download: "Download",
  inspect: "Inspect",
  modify: "Modify",
  run: "Run on your own infrastructure",
};

const TIER = {
  open: { label: "Open weights", color: "var(--open-fg)" },
  restricted: { label: "Open, with use restrictions", color: "var(--arch-dense)" },
  closed: { label: "Closed", color: "var(--arch-undisclosed)" },
};

const ctxFor = (m) => ({
  spec: SPECS[m.name] || null,
  report: REPORTS[m.name] || null,
  hfRepo: HF_LINKS[m.name] || null,
});

/** Scatter: openness across, disclosure up. The quadrants are the argument. */
function Quadrant({ points }) {
  const W = 660, H = 380, PAD = 46;
  const x = (tier) => PAD + ({ closed: 0, restricted: 0.5, open: 1 }[tier]) * (W - PAD * 2);
  const y = (pct) => H - PAD - pct * (H - PAD * 2);
  // Jitter within a tier column so overlapping models stay countable.
  const spread = (i, n) => (n <= 1 ? 0 : (i / (n - 1) - 0.5) * 92);

  const cols = { closed: [], restricted: [], open: [] };
  for (const p of points) cols[p.openness.tier].push(p);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="Models plotted by weight availability against documentation disclosure">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--line)" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="var(--line)" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={PAD} y1={y(t)} x2={W - PAD} y2={y(t)} stroke="var(--line-soft)" strokeDasharray="2 4" />
          <text x={PAD - 8} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--ink-faint)"
            fontFamily={mono}>{Math.round(t * 100)}%</text>
        </g>
      ))}
      {Object.entries(cols).map(([tier, list]) =>
        list.map((p, i) => (
          <circle key={p.model.name} cx={x(tier) + spread(i, list.length)} cy={y(p.disclosure.pct)}
            r={4.5} fill={TIER[tier].color} opacity="0.75">
            <title>{`${p.model.name} — ${p.disclosure.met}/${p.disclosure.total} fields, ${TIER[tier].label}`}</title>
          </circle>
        ))
      )}
      {Object.entries(TIER).map(([k, v]) => (
        <text key={k} x={x(k)} y={H - PAD + 18} textAnchor="middle" fontSize="9.5"
          fill="var(--ink-faint)" fontFamily={mono}>{v.label}</text>
      ))}
      <text x={12} y={PAD - 16} fontSize="9.5" fill="var(--ink-faint)" fontFamily={mono}>
        documentation disclosed →
      </text>
    </svg>
  );
}

export default function OpennessView() {
  const [sort, setSort] = useState("disclosure");

  const scored = useMemo(() => MODELS.map((m) => ({
    model: m,
    disclosure: disclosure(m, ctxFor(m)),
    openness: openness(m, HF_LINKS[m.name]),
  })), []);

  const labs = useMemo(() => byProvider(MODELS, ctxFor), []);

  const rows = useMemo(() => {
    const r = [...scored];
    if (sort === "disclosure") r.sort((a, b) => b.disclosure.met - a.disclosure.met ||
      a.model.name.localeCompare(b.model.name));
    else r.sort((a, b) => b.openness.met - a.openness.met ||
      b.disclosure.met - a.disclosure.met);
    return r;
  }, [scored, sort]);

  const tally = { open: 0, restricted: 0, closed: 0 };
  for (const s of scored) tally[s.openness.tier]++;
  const fullyDoc = scored.filter((s) => s.disclosure.pct === 1).length;
  const noDoc = scored.filter((s) => s.disclosure.met <= 3).length;

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <SiteNav current="openness" />

        <header style={{ marginBottom: 26 }}>
          <div style={S.eyebrow}>Openness</div>
          <h1 style={{ ...S.title, fontSize: "clamp(30px, 5vw, 56px)" }}>
            Open weights is not the same as open about it
          </h1>
          <p style={S.sub}>
            The industry letter <a href={LETTER.url} target="_blank" rel="noopener noreferrer"
              style={O.inlineLink}>{LETTER.title}</a> ({LETTER.date}) defines an open-weight
            model as one anyone can <em>download, inspect, modify and run on their own
            infrastructure</em>. That is a test about the availability of weights, and it is
            the horizontal axis below.
          </p>
          <p style={{ ...S.sub, marginTop: 14 }}>
            It says nothing about whether the lab told you how the model was built — which is
            the axis this atlas can score, because every one of the twelve fields below is one
            we already had to either source or leave blank. The two come apart constantly:
            {" "}{tally.open + tally.restricted} of {MODELS.length} models here publish weights,
            but only {fullyDoc} document all twelve fields, and {noDoc} disclose three or fewer.
          </p>
        </header>

        <div style={O.statRow}>
          {Object.entries(TIER).map(([k, v]) => (
            <div key={k} style={O.stat}>
              <div style={{ ...O.statNum, color: v.color }}>{tally[k]}</div>
              <div style={O.statLabel}>{v.label}</div>
            </div>
          ))}
          <div style={O.stat}>
            <div style={O.statNum}>{fullyDoc}</div>
            <div style={O.statLabel}>Document all 12 fields</div>
          </div>
        </div>

        <section style={O.panel}>
          <h2 style={O.h2}>The two axes, plotted</h2>
          <p style={O.blurb}>
            Each dot is a model. Left to right is the letter's test; bottom to top is how much
            of its construction is on the record. The top-right corner is the only place a
            model is both usable and understandable.
          </p>
          <Quadrant points={scored} />
        </section>

        <section style={O.panel}>
          <h2 style={O.h2}>By lab</h2>
          <p style={O.blurb}>
            Averaged across every model a lab has in the atlas. This is a measure of what they
            published, not of quality — and not of intent: a lab with one heavily documented
            open model scores above one with five partly documented ones.
          </p>
          <div style={O.labs}>
            {labs.map((l) => (
              <div key={l.provider} style={O.lab} data-lab={l.provider}>
                <div style={O.labHead}>
                  <ProviderMark provider={l.provider} />
                  <span style={O.labName}>{l.provider}</span>
                  <span style={O.labCount}>{l.models.length}</span>
                </div>
                <div style={O.barTrack}>
                  <div style={{ ...O.barFill, width: `${l.pct * 100}%` }} />
                </div>
                <div style={O.labMeta}>
                  {Math.round(l.pct * 100)}% disclosed
                  {l.open > 0 && <span style={O.chipOpen}>{l.open} open</span>}
                  {l.restricted > 0 && <span style={O.chipRestricted}>{l.restricted} restricted</span>}
                  {l.closed > 0 && <span style={O.chipClosed}>{l.closed} closed</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={O.panel}>
          <h2 style={O.h2}>Every model, field by field</h2>
          <div style={O.controls}>
            <div style={{ ...S.segGroup, flexWrap: "wrap" }}>
              {[["disclosure", "By disclosure"], ["openness", "By openness"]].map(([k, label]) => (
                <button key={k} onClick={() => setSort(k)}
                  style={{ ...S.seg, ...(sort === k ? S.segOn : {}) }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={O.wrap}>
            <table style={O.table}>
              <thead>
                <tr>
                  <th style={{ ...O.th, ...O.thName }}>Model</th>
                  <th style={O.th}>Weights</th>
                  {DISCLOSURE_FIELDS.map((f) => (
                    <th key={f.key} style={{ ...O.th, ...O.thTick }} title={f.label}>
                      <span style={O.vert}>{f.label}</span>
                    </th>
                  ))}
                  <th style={O.th}>Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ model, disclosure: d, openness: o }) => (
                  <tr key={model.name} style={O.tr} data-model={model.name}>
                    <td style={{ ...O.td, ...O.tdName }}>
                      <ProviderMark provider={model.provider} />
                      {model.name}
                    </td>
                    <td style={O.td}>
                      <span style={{ ...O.tier, color: TIER[o.tier].color,
                        borderColor: TIER[o.tier].color }}>
                        {o.met}/{o.total}
                      </span>
                    </td>
                    {d.fields.map((f) => (
                      <td key={f.key} style={{ ...O.td, ...O.tdTick }}
                        title={`${f.label}: ${f.met ? "disclosed" : "not disclosed"}`}>
                        <span style={f.met ? O.yes : O.no} aria-label={f.met ? "yes" : "no"}>
                          {f.met ? "●" : "·"}
                        </span>
                      </td>
                    ))}
                    <td style={{ ...O.td, ...O.tdScore }}>{d.met}/{d.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={O.panel}>
          <h2 style={O.h2}>What each column means</h2>
          <div style={O.legendGrid}>
            <div>
              <div style={O.legendHead}>The letter's four verbs</div>
              <ul style={O.list}>
                {OPEN_VERBS.map((v) => <li key={v} style={O.li}>{VERB_LABEL[v]}</li>)}
              </ul>
              <p style={O.fine}>
                Scored from whether weights are published and whether the licence permits
                derivatives. A community licence still clears the letter's bar — you can
                download and run it — but carries acceptable-use and scale conditions that a
                permissive licence does not, so it is shown separately rather than merged.
              </p>
            </div>
            <div>
              <div style={O.legendHead}>The twelve disclosure fields</div>
              <ul style={O.list}>
                {DISCLOSURE_FIELDS.map((f) => (
                  <li key={f.key} style={O.li}>
                    <span style={O.groupTag}>{f.group}</span> {f.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer style={{ ...S.footer, marginTop: 30 }}>
          <span>
            A field counts as disclosed when the atlas could fill it from a primary source. It
            is therefore a measure of what a lab published, filtered through what we found — if
            a report exists and we missed it, that shows here as a lab being less open than it
            is. Corrections are welcome and the underlying data is downloadable.
          </span>
          <span>
            Architecture recorded as "reported" rather than confirmed does not count as
            disclosed, and neither does a training pipeline inherited from another model: the
            comparison view already refuses to count those tokens, and the same rule applies
            here. The letter is cited for its definition of an open-weight model only; nothing
            on this page implies its signatories endorse this scoring.
          </span>
        </footer>
      </div>
    </div>
  );
}

const O = {
  inlineLink: { color: "var(--clay)", textDecoration: "none",
    borderBottom: "1px solid var(--clay-soft)" },
  statRow: { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 26 },
  stat: { flex: "1 1 150px", border: "1px solid var(--line)", borderRadius: 10,
    background: "var(--card)", padding: "14px 16px" },
  statNum: { fontFamily: serif, fontSize: 30, lineHeight: 1.1, color: "var(--ink)" },
  statLabel: { fontFamily: mono, fontSize: 10.5, color: "var(--ink-faint)", marginTop: 6,
    letterSpacing: "0.04em" },
  panel: { marginTop: 34 },
  h2: { fontFamily: serif, fontSize: "clamp(20px, 2.5vw, 27px)", fontWeight: 500,
    color: "var(--ink)", margin: "0 0 6px" },
  blurb: { color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.6, maxWidth: 680,
    margin: "0 0 18px" },
  labs: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 },
  lab: { border: "1px solid var(--line)", borderRadius: 10, background: "var(--card)",
    padding: "13px 15px" },
  labHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 9 },
  labName: { fontSize: 14, color: "var(--ink)", fontWeight: 500 },
  labCount: { marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: "var(--ink-faint)" },
  barTrack: { height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden" },
  barFill: { height: "100%", background: "var(--clay)", borderRadius: 3 },
  labMeta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 9,
    fontFamily: mono, fontSize: 10, color: "var(--ink-faint)" },
  chipOpen: { color: "var(--open-fg)" },
  chipRestricted: { color: "var(--arch-dense)" },
  chipClosed: { color: "var(--arch-undisclosed)" },
  controls: { marginBottom: 12 },
  wrap: { overflow: "auto", maxHeight: "clamp(360px, 70vh, 900px)",
    border: "1px solid var(--line)", borderRadius: 10, background: "var(--card)" },
  table: { borderCollapse: "collapse", fontSize: 13, width: "100%" },
  th: { position: "sticky", top: 0, zIndex: 2, background: "var(--card)", textAlign: "left",
    padding: "10px 10px", fontFamily: mono, fontSize: 10, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "var(--ink-soft)",
    borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" },
  thName: { minWidth: 190 },
  thTick: { width: 26, padding: "10px 3px" },
  vert: { display: "inline-block", writingMode: "vertical-rl", transform: "rotate(180deg)",
    fontSize: 9.5, letterSpacing: "0.06em", maxHeight: 108 },
  tr: { borderBottom: "1px solid var(--line-soft)" },
  td: { padding: "8px 10px", color: "var(--ink)", whiteSpace: "nowrap" },
  tdName: { display: "flex", alignItems: "center", gap: 7 },
  tdTick: { textAlign: "center", padding: "8px 3px" },
  tdScore: { fontFamily: mono, fontSize: 11.5, color: "var(--ink-soft)" },
  tier: { fontFamily: mono, fontSize: 10.5, border: "1px solid", borderRadius: 4,
    padding: "2px 7px" },
  yes: { color: "var(--clay)", fontSize: 13 },
  no: { color: "var(--dim)", fontSize: 13 },
  legendGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 24 },
  legendHead: { fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "var(--ink-soft)", marginBottom: 10 },
  list: { margin: 0, paddingLeft: 18, color: "var(--ink)", fontSize: 13.5, lineHeight: 1.75 },
  li: { marginBottom: 2 },
  groupTag: { fontFamily: mono, fontSize: 9.5, color: "var(--ink-faint)",
    textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 6 },
  fine: { color: "var(--ink-faint)", fontSize: 12.5, lineHeight: 1.6, marginTop: 12 },
};

import React, { useMemo, useState } from "react";
import { ProviderMark } from "./providerIcons.jsx";
import SiteNav from "./SiteNav.jsx";
import { MODELS, SPECS, REPORTS, HF_LINKS, S, mono, display } from "./FrontierModelsTable.jsx";
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

const TIER_ORDER = ["closed", "restricted", "open"];

/**
 * Scatter: weight availability across, documentation up. The corner is the argument.
 *
 * The horizontal axis is categorical — three tiers, not a continuum — so a model's
 * position inside its column carries no meaning beyond which column it is in. Points
 * are therefore laid out as a swarm: everything at the same disclosure level sits in
 * one row, centred on its column, which keeps a stack of fourteen countable. The old
 * version spread them by index across a fixed span, which put half the closed models
 * outside the plot area and drew the 0% row on top of the axis.
 *
 * The vertical axis is counted in fields, not percentages: the score is met/12, and
 * a tick reading 25% is a rounder number than the data actually has.
 */
function Quadrant({ points }) {
  const [tip, setTip] = useState(null);
  const W = 960, H = 470, L = 74, R = 26, T = 24, B = 66;
  const bandW = (W - L - R) / 3;
  const yFloor = H - B - 18, yTop = T + 12;
  const bandX = (i) => L + (i + 0.5) * bandW;
  const y = (pct) => yFloor - pct * (yFloor - yTop);
  const total = points[0]?.disclosure.total || 12;
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((total * i) / 4));

  const laid = useMemo(() => {
    const out = [];
    TIER_ORDER.forEach((tier, ti) => {
      const rows = new Map();
      for (const p of points) {
        if (p.openness.tier !== tier) continue;
        if (!rows.has(p.disclosure.met)) rows.set(p.disclosure.met, []);
        rows.get(p.disclosure.met).push(p);
      }
      for (const list of rows.values()) {
        list.sort((a, b) => a.model.name.localeCompare(b.model.name));
        const gap = Math.min(13, (bandW - 30) / Math.max(1, list.length - 1));
        list.forEach((p, i) => out.push({
          ...p, tier,
          cx: bandX(ti) + (i - (list.length - 1) / 2) * gap,
          cy: y(p.disclosure.pct),
        }));
      }
    });
    return out;
  }, [points]);

  const counts = TIER_ORDER.map((t) => points.filter((p) => p.openness.tier === t).length);
  const hovered = tip && laid.find((p) => p.model.name === tip.name);

  return (
    <figure style={O.fig}>
      <div style={O.figScroll}>
        <svg viewBox={`0 0 ${W} ${H}`} style={O.svg} role="img"
          aria-label="Models plotted by weight availability against documentation disclosure. Every model and every field is listed in the table below."
          onMouseLeave={() => setTip(null)}>
          <desc>
            Each dot is one model, positioned by its weight-availability tier across and
            the number of documentation fields it discloses up. The table below lists the
            same data field by field.
          </desc>

          {ticks.map((n) => (
            <g key={n}>
              <line x1={L} y1={y(n / total)} x2={W - R} y2={y(n / total)}
                stroke="var(--line-soft)" strokeDasharray="2 5" />
              <text x={L - 10} y={y(n / total) + 3.5} textAnchor="end" fontSize="10"
                fill="var(--ink-faint)" fontFamily={mono}>{n}</text>
            </g>
          ))}
          {[1, 2].map((i) => (
            <line key={i} x1={L + i * bandW} y1={T} x2={L + i * bandW} y2={H - B}
              stroke="var(--line-soft)" />
          ))}
          <line x1={L} y1={T} x2={L} y2={H - B} stroke="var(--line)" />
          <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--line)" />

          {hovered && (
            <line x1={L} y1={hovered.cy} x2={W - R} y2={hovered.cy}
              stroke={TIER[hovered.tier].color} strokeDasharray="3 4" opacity="0.55" />
          )}

          {laid.map((p) => (
            <g key={p.model.name}
              onMouseEnter={(e) => setTip({ p, name: p.model.name, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setTip({ p, name: p.model.name, x: e.clientX, y: e.clientY })}>
              <circle cx={p.cx} cy={p.cy} r="5.5" fill={TIER[p.tier].color}
                stroke="var(--card)" strokeWidth="1.6"
                opacity={tip && tip.name !== p.model.name ? 0.22 : 0.92} />
              <circle cx={p.cx} cy={p.cy} r="9" fill="transparent" />
            </g>
          ))}
          {hovered && (
            <circle cx={hovered.cx} cy={hovered.cy} r="7.5" fill={TIER[hovered.tier].color}
              stroke="var(--ink)" strokeWidth="1.5" pointerEvents="none" />
          )}

          {TIER_ORDER.map((k, i) => (
            <g key={k}>
              <circle cx={bandX(i) - measure(TIER[k].label) / 2 - 9} cy={H - B + 17} r="3.5"
                fill={TIER[k].color} />
              <text x={bandX(i) + 5} y={H - B + 21} textAnchor="middle" fontSize="11"
                fill="var(--ink-soft)" fontFamily={mono}>{TIER[k].label}</text>
              <text x={bandX(i)} y={H - B + 38} textAnchor="middle" fontSize="10"
                fill="var(--ink-faint)" fontFamily={mono}>
                {counts[i]} {counts[i] === 1 ? "model" : "models"}
              </text>
            </g>
          ))}
          <text transform={`rotate(-90 20 ${(T + H - B) / 2})`} x={20} y={(T + H - B) / 2}
            textAnchor="middle" fontSize="10.5" fill="var(--ink-faint)" fontFamily={mono}>
            documentation fields disclosed, of {total}
          </text>
        </svg>
      </div>
      <figcaption style={O.cap}>
        Dots are spread sideways only so that a stack of them stays countable; position
        within a column carries no meaning.
      </figcaption>
      {tip && (
        <div style={{ ...S.tooltip, ...O.tipBox,
          left: Math.min(tip.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 280),
          top: Math.min(tip.y + 16, (typeof window !== "undefined" ? window.innerHeight : 800) - 120) }}>
          <div style={O.tipName}>{tip.p.model.name}</div>
          <div style={O.tipMeta}>{tip.p.model.provider}
            {tip.p.model.released ? ` · ${tip.p.model.released}` : ""}</div>
          <div style={O.tipLine}>
            <span style={{ color: TIER[tip.p.tier].color }}>●</span> {TIER[tip.p.tier].label}
            {" · "}{tip.p.openness.met}/{tip.p.openness.total} verbs
          </div>
          <div style={O.tipLine}>
            {tip.p.disclosure.met} of {tip.p.disclosure.total} documentation fields disclosed
          </div>
        </div>
      )}
    </figure>
  );
}

// SVG has no text metrics before layout, so the legend dot is placed off an estimate
// of the label's width in monospace at 11px — the font is fixed-pitch, so it is exact
// enough to sit the dot a constant gap from the first character.
const measure = (s) => s.length * 6.6;

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
            Each dot is a model — hover one to see which. Left to right is the letter's test;
            bottom to top is how much of its construction is on the record, counted in fields
            rather than rounded to percentages. The top-right corner is the only place a model
            is both usable and understandable.
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
  statNum: { fontFamily: display, fontSize: 30, lineHeight: 1.1, color: "var(--ink)" },
  statLabel: { fontFamily: mono, fontSize: 10.5, color: "var(--ink-faint)", marginTop: 6,
    letterSpacing: "0.04em" },
  panel: { marginTop: 34 },
  fig: { margin: 0, border: "1px solid var(--line)", borderRadius: 10,
    background: "var(--card)", padding: "16px 14px 10px" },
  // The plot is drawn at a fixed aspect, so on a phone it would otherwise scale its
  // labels down to nothing. Scrolling inside the figure keeps them legible without
  // widening the page.
  figScroll: { overflowX: "auto" },
  svg: { display: "block", width: "100%", minWidth: 560, height: "auto" },
  cap: { fontSize: 11.5, color: "var(--ink-faint)", margin: "10px 4px 2px", lineHeight: 1.55 },
  tipBox: { maxWidth: 260, padding: "11px 13px" },
  tipName: { fontFamily: display, fontSize: 15, marginBottom: 2 },
  tipMeta: { fontFamily: mono, fontSize: 10.5, opacity: 0.72, marginBottom: 7 },
  tipLine: { fontFamily: mono, fontSize: 10.5, lineHeight: 1.7 },
  h2: { fontFamily: display, fontSize: "clamp(20px, 2.5vw, 27px)", fontWeight: 500,
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
    padding: "10px 10px", fontFamily: mono, fontSize: 10, letterSpacing: "0.03em",
    textTransform: "uppercase", color: "var(--ink-soft)",
    borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" },
  thName: { minWidth: 190 },
  thTick: { width: 26, padding: "10px 3px" },
  vert: { display: "inline-block", writingMode: "vertical-rl", transform: "rotate(180deg)",
    fontSize: 9.5, letterSpacing: "0.02em", maxHeight: 108 },
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
  legendHead: { fontFamily: mono, fontSize: 11, letterSpacing: "0.03em", textTransform: "uppercase",
    color: "var(--ink-soft)", marginBottom: 10 },
  list: { margin: 0, paddingLeft: 18, color: "var(--ink)", fontSize: 13.5, lineHeight: 1.75 },
  li: { marginBottom: 2 },
  groupTag: { fontFamily: mono, fontSize: 9.5, color: "var(--ink-faint)",
    textTransform: "uppercase", letterSpacing: "0.02em", marginRight: 6 },
  fine: { color: "var(--ink-faint)", fontSize: 12.5, lineHeight: 1.6, marginTop: 12 },
};

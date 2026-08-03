import React, { useMemo } from "react";
import SiteNav from "./SiteNav.jsx";
import { MODELS, SPECS, S, mono, serif } from "./FrontierModelsTable.jsx";
import { parseCount, tokensPerParam, trainingFlops, fmtFlops, fmtTokensShort } from "./metrics.js";

/**
 * The atlas is a snapshot; this page is the derivative.
 *
 * Everything here is plotted from data already in MODELS and SPECS — no new facts,
 * only arithmetic over recorded ones. Points are omitted rather than interpolated
 * when a field is missing, so a sparse chart is an honest statement about how little
 * gets published, not a rendering bug.
 */

const monthOf = (released) => {
  const [y, m] = String(released).split("/").map(Number);
  return y * 12 + (m - 1);
};
const labelOf = (t) => `${Math.floor(t / 12)}/${String((t % 12) + 1).padStart(2, "0")}`;

// `arch` records channel mixing only — dense FFN vs routed experts. Attention has
// its own topology and its own field; colouring by a mechanism name here would be
// reading a column for something it does not hold.
const ARCH_COLOR = (arch) =>
  /Undisclosed/i.test(arch) ? "var(--arch-undisclosed)"
    : /reported/i.test(arch) ? "var(--arch-reported)"
    : /MoE/i.test(arch) ? "var(--arch-moe)"
    : "var(--arch-dense)";

/** Scatter over release date, with a log option because these span many decades. */
function Scatter({ points, yLabel, log = false, fmtY = String, caption, refLine, maxY }) {
  const W = 680, H = 320, L = 54, R = 34, T = 16, B = 40;
  if (!points.length) return null;
  const xs = points.map((p) => p.t);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const vals = points.map((p) => p.v);
  const tf = (v) => (log ? Math.log10(Math.max(v, 1e-9)) : v);
  let y0 = Math.min(...vals.map(tf)), y1 = Math.max(...vals.map(tf));
  if (refLine != null) { y0 = Math.min(y0, tf(refLine)); y1 = Math.max(y1, tf(refLine)); }
  const pad = (y1 - y0) * 0.08 || 1;
  y0 -= pad;
  // Headroom above the data, except where the quantity has a real ceiling: an axis
  // reading 132% on a percentage is a rendering artefact, not a data point.
  y1 = maxY != null ? tf(maxY) : y1 + pad;
  const px = (t) => L + ((t - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const py = (v) => H - B - ((tf(v) - y0) / (y1 - y0)) * (H - T - B);

  const ticks = [];
  for (let i = 0; i <= 4; i++) ticks.push(y0 + ((y1 - y0) * i) / 4);
  const xticks = [];
  for (let t = Math.ceil(x0 / 6) * 6; t <= x1; t += 6) xticks.push(t);

  return (
    <figure style={C.fig}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={caption}>
        {ticks.map((tv, i) => (
          <g key={i}>
            <line x1={L} y1={py(log ? 10 ** tv : tv)} x2={W - R} y2={py(log ? 10 ** tv : tv)}
              stroke="var(--line-soft)" strokeDasharray="2 4" />
            <text x={L - 7} y={py(log ? 10 ** tv : tv) + 3} textAnchor="end" fontSize="9"
              fill="var(--ink-faint)" fontFamily={mono}>
              {fmtY(log ? 10 ** tv : tv)}
            </text>
          </g>
        ))}
        {xticks.map((t) => (
          <text key={t} x={px(t)} y={H - B + 15} textAnchor="middle" fontSize="9"
            fill="var(--ink-faint)" fontFamily={mono}>{labelOf(t)}</text>
        ))}
        {refLine != null && (
          <>
            <line x1={L} y1={py(refLine)} x2={W - R} y2={py(refLine)} stroke="var(--clay)"
              strokeDasharray="5 4" opacity="0.8" />
            <text x={W - R} y={py(refLine) - 5} textAnchor="end" fontSize="9" fill="var(--clay)"
              fontFamily={mono}>Chinchilla ≈ 20:1</text>
          </>
        )}
        {points.map((p) => (
          <circle key={p.name} cx={px(p.t)} cy={py(p.v)} r="4.2" fill={p.color} opacity="0.78">
            <title>{`${p.name} — ${fmtY(p.v)} (${p.released})`}</title>
          </circle>
        ))}
        <text x={4} y={11} fontSize="9.5" fill="var(--ink-faint)" fontFamily={mono}>{yLabel}</text>
      </svg>
      <figcaption style={C.cap}>{caption}</figcaption>
    </figure>
  );
}

/** Share of releases per period using each mechanism — adoption, not counts. */
function Adoption({ rows, caption }) {
  const W = 680, H = 260, L = 54, R = 150, T = 14, B = 34;
  const periods = rows.periods;
  const px = (i) => L + (i / Math.max(1, periods.length - 1)) * (W - L - R);
  const py = (v) => H - B - v * (H - T - B);
  return (
    <figure style={C.fig}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={caption}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={L} y1={py(v)} x2={W - R} y2={py(v)} stroke="var(--line-soft)" strokeDasharray="2 4" />
            <text x={L - 7} y={py(v) + 3} textAnchor="end" fontSize="9" fill="var(--ink-faint)"
              fontFamily={mono}>{Math.round(v * 100)}%</text>
          </g>
        ))}
        {periods.map((p, i) => (
          <text key={p} x={px(i)} y={H - B + 14} textAnchor="middle" fontSize="9"
            fill="var(--ink-faint)" fontFamily={mono}>{p}</text>
        ))}
        {rows.series.map((s) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth="2" opacity="0.85"
              points={s.values.map((v, i) => `${px(i)},${py(v)}`).join(" ")} />
            <text x={W - R + 8} y={py(s.values[s.values.length - 1]) + 3} fontSize="10"
              fill={s.color} fontFamily={mono}>{s.key}</text>
          </g>
        ))}
      </svg>
      <figcaption style={C.cap}>{caption}</figcaption>
    </figure>
  );
}

export default function TrendsView() {
  const data = useMemo(() => {
    const withDate = MODELS.filter((m) => /^\d{4}\/\d{2}$/.test(m.released || ""));

    const sparsity = withDate.map((m) => {
      const p = parseCount(m.params), a = parseCount(m.active);
      if (!p || !a || m.params === "—" || m.active === "—") return null;
      return { name: m.name, t: monthOf(m.released), released: m.released,
        v: (a / p) * 100, color: ARCH_COLOR(m.arch) };
    }).filter(Boolean);

    const context = withDate.filter((m) => m.context).map((m) => ({
      name: m.name, t: monthOf(m.released), released: m.released,
      v: m.context, color: ARCH_COLOR(m.arch),
    }));

    const vocab = withDate.map((m) => {
      const s = SPECS[m.name];
      const v = s && parseCount(s.vocab);
      return v ? { name: m.name, t: monthOf(m.released), released: m.released, v,
        color: ARCH_COLOR(m.arch) } : null;
    }).filter(Boolean);

    const tpp = withDate.map((m) => {
      const r = tokensPerParam(m);
      return r ? { name: m.name, t: monthOf(m.released), released: m.released, v: r.ratio,
        color: ARCH_COLOR(m.arch) } : null;
    }).filter(Boolean);

    const flops = withDate.map((m) => {
      const f = trainingFlops(m);
      return f ? { name: m.name, t: monthOf(m.released), released: m.released, v: f.flops,
        color: ARCH_COLOR(m.arch) } : null;
    }).filter(Boolean);

    // Adoption by half-year, as a share of that period's releases.
    const bucket = (m) => {
      const [y, mo] = m.released.split("/").map(Number);
      return `${String(y).slice(2)}H${mo <= 6 ? 1 : 2}`;
    };
    const periods = [...new Set(withDate.map(bucket))].sort();
    const family = (m) =>
      /Undisclosed/i.test(m.attn) ? "Undisclosed"
        : /MLA/i.test(m.attn) ? "MLA"
        : /DeltaNet|KDA|Mamba/i.test(m.attn) ? "Linear/hybrid"
        : /Sliding|window/i.test(m.attn) ? "Sliding+global"
        : /Sparse|DSA|MSA/i.test(m.attn) ? "Sparse"
        : "GQA/MHA";
    const fams = ["GQA/MHA", "Sliding+global", "MLA", "Linear/hybrid", "Sparse", "Undisclosed"];
    const famColor = {
      "GQA/MHA": "var(--arch-dense)", "Sliding+global": "var(--arch-moe)",
      "MLA": "var(--arch-deltanet)", "Linear/hybrid": "var(--arch-kda)",
      "Sparse": "var(--arch-mamba)", "Undisclosed": "var(--arch-undisclosed)",
    };
    const series = fams.map((f) => ({
      key: f, color: famColor[f],
      values: periods.map((p) => {
        const inP = withDate.filter((m) => bucket(m) === p);
        return inP.length ? inP.filter((m) => family(m) === f).length / inP.length : 0;
      }),
    })).filter((s) => s.values.some((v) => v > 0));

    return { sparsity, context, vocab, tpp, flops, adoption: { periods, series } };
  }, []);

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <SiteNav current="trends" />

        <header style={{ marginBottom: 26 }}>
          <div style={S.eyebrow}>Trends</div>
          <h1 style={{ ...S.title, fontSize: "clamp(30px, 5vw, 56px)" }}>
            What the field is converging on
          </h1>
          <p style={S.sub}>
            The atlas records where things stand; these are the same numbers plotted against
            time. Nothing here is a new fact — every point is arithmetic over a field already
            in the table, and a model is left off a chart when it never published the input.
            The gaps are the honest part: only {data.flops.length} of {MODELS.length} models
            disclose enough to place on the compute chart at all.
          </p>
        </header>

        <section style={C.panel}>
          <h2 style={C.h2}>Sparsity: how much of a model actually runs</h2>
          <p style={C.blurb}>
            Active parameters as a percentage of total. Dense models sit at 100% by definition;
            the sparse frontier has been driving this down hard, which is what lets a
            trillion-parameter model serve at a mid-size model's cost.
          </p>
          <Scatter points={data.sparsity} yLabel="% of params active per token" log maxY={100}
            fmtY={(v) => `${v < 1 ? v.toFixed(1) : Math.round(v)}%`}
            caption="Log scale, capped at 100% — a dense model runs all of itself. Colour is architecture family." />
        </section>

        <section style={C.panel}>
          <h2 style={C.h2}>Context window</h2>
          <p style={C.blurb}>
            Maximum input tokens. The spread at any given moment is now wider than the growth
            over the whole period — a 128K model and a 10M model ship in the same quarter,
            because the window is a product decision as much as an architectural one.
          </p>
          <Scatter points={data.context} yLabel="max input tokens" log fmtY={fmtTokensShort}
            caption="Log scale." />
        </section>

        <section style={C.panel}>
          <h2 style={C.h2}>Training tokens per parameter</h2>
          <p style={C.blurb}>
            The Chinchilla result put the compute-optimal ratio near 20:1. Almost nothing ships
            near it any more: once a model is going to be served billions of times, training
            far past the optimum buys inference-time savings that dwarf the extra training
            cost. The small models are the extreme case — they are trained hardest of all.
          </p>
          <Scatter points={data.tpp} yLabel="tokens per parameter" log refLine={20}
            fmtY={(v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}:1`}
            caption="Log scale, against the Chinchilla compute-optimal ratio." />
        </section>

        <section style={C.panel}>
          <h2 style={C.h2}>Training compute</h2>
          <p style={C.blurb}>
            Estimated as 6 × active parameters × disclosed tokens. Active rather than total,
            because on a sparse model only the routed experts run for a given token. This is a
            floor: stages that published no token count contribute nothing, so every point is
            at least this large and probably larger.
          </p>
          <Scatter points={data.flops} yLabel="training FLOPs (estimated)" log fmtY={fmtFlops}
            caption="Log scale. Derived, not published — see the formula above." />
        </section>

        <section style={C.panel}>
          <h2 style={C.h2}>Attention, by share of releases</h2>
          <p style={C.blurb}>
            What each half-year's releases actually used, as a proportion of that period rather
            than a raw count, so a busy quarter does not swamp a quiet one. The rise of the
            linear and hybrid families is the clearest architectural shift in the data.
          </p>
          <Adoption rows={data.adoption} caption="Share of models released in each half-year." />
        </section>

        <section style={C.panel}>
          <h2 style={C.h2}>Vocabulary size</h2>
          <p style={C.blurb}>
            Read from each model's own config.json, so only open-weight models appear. The
            drift upward is mostly multilingual coverage — a bigger vocabulary buys shorter
            sequences in non-English text, at the cost of a larger embedding table.
          </p>
          <Scatter points={data.vocab} yLabel="vocab entries" fmtY={(v) => fmtTokensShort(v)}
            caption="Linear scale. Open-weight models only." />
        </section>

        <footer style={{ ...S.footer, marginTop: 34 }}>
          <span>
            Every chart omits models that never published the input rather than estimating it,
            so point counts differ between charts and none of them is a complete census. Token
            budgets inherited from another model are excluded, as everywhere else in the atlas.
          </span>
          <span>
            Training FLOPs and tokens-per-parameter are computed by this project, not published
            by any lab. The underlying numbers, and these derivations, are in the downloadable
            dataset.
          </span>
        </footer>
      </div>
    </div>
  );
}

const C = {
  panel: { marginTop: 36 },
  h2: { fontFamily: serif, fontSize: "clamp(20px, 2.5vw, 27px)", fontWeight: 500,
    color: "var(--ink)", margin: "0 0 6px" },
  blurb: { color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.62, maxWidth: 700,
    margin: "0 0 16px" },
  fig: { margin: 0, border: "1px solid var(--line)", borderRadius: 10, background: "var(--card)",
    padding: "14px 12px 10px" },
  cap: { fontSize: 11.5, color: "var(--ink-faint)", marginTop: 8, paddingLeft: 4 },
};

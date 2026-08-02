import React from "react";
import { MODELS, ATTENTION_INFO, S, mono, serif } from "./FrontierModelsTable.jsx";

/**
 * The attention menu — one page explaining every attention mechanism the atlas
 * actually records, from the problem each one solves rather than from its name.
 *
 * Two deliberate constraints:
 *
 * 1. The figures are drawn here, as inline SVG, not taken from the papers. Paper
 *    figures are the authors' work under their own licence, arXiv publishes no
 *    stable per-figure image URL, and this project's rule is to verify every link
 *    by fetching it. Drawing them means they are ours to relicense, theme-aware,
 *    and survive being offline — the same reason `public/diagrams` mirrors the
 *    gallery images locally. Each mechanism still cites its foundational paper.
 *
 * 2. Citations are reused from ATTENTION_INFO rather than written fresh. Those
 *    arXiv ids were resolved against the arXiv API when they were added; inventing
 *    new ones here would put unverified citations on a public page.
 *
 * EXPLAIN is keyed by the exact `attn` string, exactly like ATTENTION_INFO, so
 * scripts/verify/attention.mjs can assert that every mechanism in use has an
 * explanation and no explanation is orphaned.
 */

const INK = "var(--ink)";
const SOFT = "var(--ink-soft)";
const FAINT = "var(--ink-faint)";
const LINE = "var(--line)";
const CLAY = "var(--clay)";

/* ---------------------------------------------------------------- figures -- */

/**
 * The attention matrix: row i is a token deciding what to look at, column j is a
 * token it could look at. One picture covers full, windowed, strided and block
 * attention — only the mask changes, which is the point being made.
 */
function Grid({ n = 14, cell, caption, size = 13 }) {
  const g = size, pad = 1;
  const w = n * g;
  const rects = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = j > i ? "off" : cell(i, j);
      if (k === "off") continue;
      rects.push(
        <rect key={`${i}-${j}`} x={j * g} y={i * g} width={g - pad} height={g - pad} rx={1.5}
          fill={k === "on" ? CLAY : "var(--line)"}
          opacity={k === "on" ? 0.92 : 1} />
      );
    }
  }
  return (
    <figure style={F.fig}>
      <svg viewBox={`-1 -1 ${w + 2} ${w + 2}`} width="100%" style={{ maxWidth: 250 }} role="img"
        aria-label={caption}>
        {rects}
      </svg>
      <figcaption style={F.cap}>{caption}</figcaption>
    </figure>
  );
}

/** Query heads collapsing onto a smaller number of shared key/value heads. */
function Heads({ q = 8, kv = 2, caption }) {
  const w = 260, topY = 16, botY = 92, r = 7;
  const qx = (i) => 14 + i * ((w - 28) / (q - 1));
  const kx = (i) => 14 + (i + 0.5) * ((w - 28) / kv);
  const per = q / kv;
  return (
    <figure style={F.fig}>
      <svg viewBox={`0 0 ${w} 118`} width="100%" style={{ maxWidth: 300 }} role="img" aria-label={caption}>
        {Array.from({ length: q }, (_, i) => (
          <line key={`l${i}`} x1={qx(i)} y1={topY + r} x2={kx(Math.floor(i / per))} y2={botY - r}
            stroke={LINE} strokeWidth="1.5" />
        ))}
        {Array.from({ length: q }, (_, i) => (
          <circle key={`q${i}`} cx={qx(i)} cy={topY} r={r} fill={CLAY} opacity="0.9" />
        ))}
        {Array.from({ length: kv }, (_, i) => (
          <rect key={`k${i}`} x={kx(i) - 20} y={botY - 10} width="40" height="20" rx="4"
            fill="var(--line)" stroke={FAINT} strokeWidth="1" />
        ))}
        <text x={w / 2} y="113" textAnchor="middle" fontSize="9.5" fill={FAINT} fontFamily={mono}>
          {q} query heads · {kv} shared K/V
        </text>
      </svg>
      <figcaption style={F.cap}>{caption}</figcaption>
    </figure>
  );
}

/** Wide K/V squeezed through a narrow latent and expanded again. */
function Latent({ caption }) {
  const box = (x, h, label, fill) => (
    <g>
      <rect x={x} y={54 - h / 2} width="34" height={h} rx="4" fill={fill} stroke={FAINT} strokeWidth="1" />
      <text x={x + 17} y="102" textAnchor="middle" fontSize="9" fill={FAINT} fontFamily={mono}>{label}</text>
    </g>
  );
  return (
    <figure style={F.fig}>
      <svg viewBox="0 0 250 112" width="100%" style={{ maxWidth: 290 }} role="img" aria-label={caption}>
        {box(12, 74, "K/V", "var(--line)")}
        {box(108, 20, "latent", CLAY)}
        {box(204, 74, "K/V", "var(--line)")}
        <path d="M50 22 L104 46 M50 90 L104 66" stroke={FAINT} strokeWidth="1.3" fill="none" />
        <path d="M146 46 L200 22 M146 66 L200 90" stroke={FAINT} strokeWidth="1.3" fill="none" />
        <text x="125" y="18" textAnchor="middle" fontSize="9" fill={FAINT} fontFamily={mono}>cached</text>
        <path d="M125 24 L125 40" stroke={CLAY} strokeWidth="1.3" markerEnd="" />
      </svg>
      <figcaption style={F.cap}>{caption}</figcaption>
    </figure>
  );
}

/** A cache that grows with the sequence, against a state that does not. */
function StateVsCache({ caption }) {
  const t = [0, 1, 2, 3, 4, 5];
  return (
    <figure style={F.fig}>
      <svg viewBox="0 0 260 124" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={caption}>
        <text x="0" y="10" fontSize="9.5" fill={FAINT} fontFamily={mono}>KV cache</text>
        {t.map((i) => (
          <rect key={i} x={i * 42} y={18} width="34" height={6 + i * 5} rx="2" fill="var(--line)" />
        ))}
        <text x="0" y="80" fontSize="9.5" fill={FAINT} fontFamily={mono}>recurrent state</text>
        {t.map((i) => (
          <rect key={i} x={i * 42} y={88} width="34" height="18" rx="2" fill={CLAY} opacity="0.85" />
        ))}
        <text x="130" y="120" textAnchor="middle" fontSize="9" fill={FAINT} fontFamily={mono}>
          tokens read →
        </text>
      </svg>
      <figcaption style={F.cap}>{caption}</figcaption>
    </figure>
  );
}

/** A stack of layers, coloured by kind — the shape most hybrids actually have. */
function LayerStack({ layers, legend, caption }) {
  const h = 9, gap = 2.5;
  return (
    <figure style={F.fig}>
      <svg viewBox={`0 0 178 ${layers.length * (h + gap) + 18}`} width="100%" style={{ maxWidth: 210 }}
        role="img" aria-label={caption}>
        {layers.map((k, i) => (
          <rect key={i} x="0" y={i * (h + gap)} width={k === 1 ? 118 : 78} height={h} rx="2"
            fill={k === 1 ? CLAY : "var(--line)"} opacity={k === 1 ? 0.9 : 1} />
        ))}
        <text x="0" y={layers.length * (h + gap) + 12} fontSize="9" fill={FAINT} fontFamily={mono}>
          {legend}
        </text>
      </svg>
      <figcaption style={F.cap}>{caption}</figcaption>
    </figure>
  );
}

const band = (w) => (i, j) => (i - j < w ? "on" : "dim");
const everyNth = (n, w) => (i, j) => (i - j < w || j % n === 0 ? "on" : "dim");
const alt = (n) => Array.from({ length: n }, (_, i) => ((i + 1) % 6 === 0 ? 1 : 0));

/* --------------------------------------------------------------- content -- */

/**
 * Keyed by the exact `attn` string used in MODELS. `why` is the problem, `how` is
 * the mechanism, `cost` is what it gives up — every one of these trades something,
 * and a page that only lists benefits teaches nothing.
 */
const EXPLAIN = {
  "Grouped-query attention": {
    family: "share",
    how: [
      "Attention works by having every head write down notes about each token it has read — a key and a value — and keep them for as long as the conversation lasts. That pile of notes is the KV cache, and with 64 heads you are keeping 64 separate piles.",
      "Grouped-query attention makes the heads share. The heads still ask different questions, because each keeps its own query. They just consult a filing cabinet held in common: 64 questioners, 8 cabinets, 8 questioners per cabinet.",
    ],
    cost: "The shared notes cannot be tailored to any one head, so each head is reading a slightly less suitable summary than it would have written for itself. In practice the loss is small and the memory saving is large, which is why almost everything uses it.",
    fig: <Heads q={8} kv={2} caption="Eight query heads sharing two key/value heads — a 4:1 group." />,
  },

  "MLA (Multi-head Latent Attn)": {
    family: "share",
    how: [
      "Sharing notes between heads only goes so far. Multi-head Latent Attention asks a different question: why store the notes at all, when you could store a compressed summary and rebuild the notes when you need them?",
      "Each token's keys and values are squeezed through a deliberately narrow bottleneck into a small latent vector. That vector is what gets cached. When a later token wants to attend, the full keys and values are reconstructed from it on the spot.",
    ],
    cost: "You trade memory for arithmetic — the expansion is real work done on every step. And position cannot survive the squeeze, so a small slice of each head is left uncompressed to carry it, which is why MLA configs report a split like 64 RoPE dims and 128 NoPE dims.",
    fig: <Latent caption="Keys and values compressed to a latent, cached, then rebuilt on demand." />,
  },

  "Sliding-window + global": {
    family: "less",
    how: [
      "Most of what a word needs in order to be understood is sitting right next to it. Full attention ignores that: every token dutifully re-reads the entire history, whether or not it was ever going to matter.",
      "So most layers are given a window — they may look back a fixed span, say 512 or 1024 tokens, and no further. Every sixth layer or so is left global and may see everything. Local layers do the cheap work; the occasional global layer carries information across the long distances.",
    ],
    cost: "Anything that has to travel further than the window can only do so by riding through a global layer, so long-range facts pass through a narrow channel. Set the ratio too aggressively and the model stops being able to connect distant things at all.",
    fig: <Grid cell={band(4)} caption="A windowed layer: only the band near the diagonal is read." />,
  },

  "Sparse + long-context": {
    family: "less",
    how: [
      "The same intuition as a sliding window, but the choice of what to read is learned rather than fixed by position — the model selects which earlier tokens are worth attending to and skips the rest.",
      "This is the label the atlas uses for closed frontier models — Grok and Gemini — where the vendor has said the attention is sparse and built for very long context but has not published the mechanism.",
    ],
    cost: "Nothing here is verifiable from a technical report. Treat this row as the vendor's own characterisation, not as a described algorithm; the atlas records it as reported and no further.",
    fig: <Grid cell={everyNth(4, 2)} caption="Schematic only: a few selected columns plus the local band." />,
  },

  "MSA sparse attention": {
    family: "less",
    how: [
      "MiniMax's own sparse attention, used to reach a one-million-token window. Like other sparse schemes it reads a chosen subset of the history rather than all of it, keeping the cost of a very long context tractable.",
    ],
    cost: "MiniMax reports the mechanism and the window but not a full accounting of what the sparsity gives up, so the atlas does not claim one.",
    fig: <Grid cell={everyNth(5, 2)} caption="A sparse read: most of the history is skipped each step." />,
  },

  "MLA + DeepSeek Sparse Attn": {
    family: "less",
    how: [
      "Two savings stacked. MLA shrinks what each cached token costs to store; DeepSeek Sparse Attention shrinks how many of those tokens get read at all.",
      "They compose well because they attack different halves of the same bill — one is about memory per token, the other about work per step.",
    ],
    cost: "Two approximations layered on one another, each individually small. The combined effect on quality is harder to attribute than either alone.",
    fig: <Grid cell={everyNth(4, 3)} caption="Sparse selection on top of a latent-compressed cache." />,
  },

  "DSA + MLA (IndexShare)": {
    family: "less",
    how: [
      "GLM-5.2's refinement of the same pairing. Choosing which tokens to read is itself work — you have to score the candidates — and doing that independently in every layer duplicates effort.",
      "IndexShare computes the selection once and reuses it, so the cost of deciding what to read is paid a handful of times rather than once per layer. Zhipu reports it cuts per-token FLOPs by 2.9x at a one-million-token context.",
    ],
    cost: "Layers no longer choose independently what to attend to. Sharing an index assumes the layers want roughly the same tokens, which is a real assumption about how the stack behaves.",
    fig: <Grid cell={everyNth(4, 2)} caption="One selection index, computed once and shared across layers." />,
  },

  "Hybrid: CSA + HCA": {
    family: "less",
    how: [
      "DeepSeek V4 pairs two attention types in one stack rather than applying a single compromise everywhere — some layers run one, some the other, so the model can be cheap in most places and exact where it matters.",
    ],
    cost: "Hybrids are harder to serve: two kinds of layer mean two code paths, two memory profiles, and a stack whose cost is no longer uniform with depth.",
    fig: <LayerStack layers={alt(18)} legend="two layer types, interleaved"
      caption="A hybrid stack: the cheap layer type dominates, punctuated by the exact one." />,
  },

  "Mamba-2 SSM + GQA attn": {
    family: "remember",
    how: [
      "Every mechanism above still keeps a cache that grows as the sequence grows. A state-space model refuses to. It reads tokens one at a time and folds each into a fixed-size state — the state is the same size after a million tokens as after ten.",
      "That makes long-context cost flat instead of climbing. The catch is that a fixed state cannot hold everything, so Nemotron keeps a minority of ordinary attention layers to restore exact recall of specific earlier tokens.",
    ],
    cost: "A recurrent state is a lossy summary. Anything it did not think worth keeping is simply gone, which is precisely what the interleaved attention layers are there to rescue.",
    fig: <StateVsCache caption="A KV cache grows with every token; a recurrent state does not." />,
  },

  "Gated DeltaNet + gated attn": {
    family: "remember",
    how: [
      "Linear attention keeps a fixed-size memory, but a naive one just keeps adding to it until everything blurs together. The delta rule fixes that: when a new fact arrives, the memory is updated by the difference between what it already predicts and what it should — write the correction, not another copy.",
      "The gate decides how much of the old memory to keep at each step, so the model can deliberately forget. Qwen interleaves these layers with ordinary gated attention, on the same reasoning as Nemotron: fixed-size memory for the bulk, real attention for exact recall.",
    ],
    cost: "Writing corrections into a bounded memory means old detail is genuinely overwritten. What survives is whatever the gate judged worth keeping, and that judgement is learned, not guaranteed.",
    fig: <StateVsCache caption="Bounded memory, updated by correction rather than accumulation." />,
  },

  "KDA + full attn (69:24 layers)": {
    family: "remember",
    how: [
      "Kimi K3 takes the same bargain to its most explicit form. Of its 93 layers, 69 are Kimi Delta Attention — linear, gated, fixed-size state — and 24 are full softmax attention, roughly one exact layer for every three cheap ones.",
      "Moonshot reports this cuts KV-cache memory by up to 75% and decodes up to six times faster at a million tokens. The unusual part is that K3 uses no positional embedding at all: order is carried implicitly by the recurrence's own gating and decay.",
    ],
    cost: "The ratio is a tuned guess. Too few full-attention layers and exact long-range recall degrades; too many and the memory saving evaporates.",
    fig: <LayerStack layers={alt(24)} legend="69 KDA · 24 full attention"
      caption="Roughly three linear layers per exact one, through 93 layers." />,
  },

  "iRoPE (interleaved RoPE/NoPE)": {
    family: "position",
    how: [
      "Rotary position embedding rotates each token's representation by an amount that depends on where it sits. It works well — until you ask the model to read further than it was trained on, where the rotations reach angles it has never seen.",
      "Llama 4 interleaves. Some layers get the rotation, others get none at all and must infer order from context. The layers without it have nothing to extrapolate incorrectly, which is what lets Scout claim a ten-million-token window.",
    ],
    cost: "A window that long is a claim about the architecture, not a promise about recall. Being able to accept ten million tokens and being able to use them are different things.",
    fig: <LayerStack layers={alt(20)} legend="rotated · unrotated, interleaved"
      caption="Position injected in some layers, deliberately withheld in others." />,
  },

  "GQA + periodic NoPE": {
    family: "position",
    how: [
      "The same idea at small scale, and stated plainly enough to verify: SmolLM3 applies rotary position to most layers and skips it on every fourth, nine of its thirty-six.",
      "It is worth knowing that this is a documented choice. A config file that simply lacks a rope_theta is not evidence of NoPE — that claim needs the technical report, which is why the atlas records it here and not by inference.",
    ],
    cost: "Layers without position have to recover order from content alone. That is cheap and helps length generalisation, but it is not free of any cost — it is a bet that context carries enough of the ordering.",
    fig: <LayerStack layers={Array.from({ length: 20 }, (_, i) => ((i + 1) % 4 === 0 ? 1 : 0))}
      legend="every 4th layer without position"
      caption="Rotation applied to most layers, withheld on a fixed cycle." />,
  },
};

const FAMILIES = [
  { key: "share", title: "Share the notes",
    blurb: "Keep attending to everything, but store less per token." },
  { key: "less", title: "Read less of the page",
    blurb: "Keep the cache, but stop reading all of it on every step." },
  { key: "remember", title: "Remember instead of re-reading",
    blurb: "Refuse the growing cache outright and carry a fixed-size state." },
  { key: "position", title: "Where position comes in",
    blurb: "Not a saving at all — a different bet about reading past the training length." },
];

/* ------------------------------------------------------------------ page -- */

export default function AttentionView({ onBack }) {
  const users = React.useMemo(() => {
    const by = {};
    for (const m of MODELS) (by[m.attn] = by[m.attn] || []).push(m.name);
    return by;
  }, []);

  const undisclosed = (users["Undisclosed"] || []).length;

  return (
    <div style={S.page}>
      <div style={S.shell}>
        <button type="button" style={A.back} onClick={onBack}>
          <img src={`${import.meta.env.BASE_URL}logo-atlas.png`} alt="" aria-hidden="true" style={A.backLogo} />
          ← Back to the atlas
        </button>

        <header style={{ marginBottom: 30 }}>
          <div style={S.eyebrow}>The attention menu</div>
          <h1 style={{ ...S.title, fontSize: "clamp(28px, 4.4vw, 44px)" }}>
            Every way these models avoid re-reading the page
          </h1>
          <p style={S.sub}>
            Nearly every mechanism below is an answer to one problem, so it is worth stating the
            problem first. Attention lets each token look at every token before it. That is why
            transformers work, and it costs two things that both grow with the length of the text:
            the work of comparing everything to everything, and a pile of stored keys and values —
            the KV cache — that has to be carried for as long as the context lasts. Double the
            context and the reading roughly quadruples while the cache doubles.
          </p>
          <p style={{ ...S.sub, marginTop: 14 }}>
            Every mechanism here buys that cost down, and every one of them pays for it somewhere.
            The interesting question is never whether a scheme is faster — they all are — but what
            it agreed to give up. Those trades are grouped below by the kind of bargain they strike.
          </p>
        </header>

        <div style={A.problemRow}>
          <Grid cell={() => "on"} caption="Full attention: every token reads the whole history." />
          <Grid cell={band(4)} caption="A window: the same stack, reading a fixed span." />
          <Grid cell={everyNth(4, 2)} caption="Sparse: a chosen few, plus what is nearby." />
        </div>

        {FAMILIES.map((fam) => {
          const entries = Object.entries(EXPLAIN)
            .filter(([, v]) => v.family === fam.key)
            .filter(([k]) => users[k]);
          if (!entries.length) return null;
          return (
            <section key={fam.key} style={A.family}>
              <h2 style={A.familyTitle}>{fam.title}</h2>
              <p style={A.familyBlurb}>{fam.blurb}</p>

              {entries.map(([key, v]) => {
                const info = ATTENTION_INFO[key] || {};
                const models = users[key] || [];
                return (
                  <article key={key} style={A.card} data-attn={key}>
                    <div style={A.cardBody}>
                      <h3 style={A.cardTitle}>{key}</h3>
                      <div style={A.usedBy}>
                        {models.length} model{models.length === 1 ? "" : "s"}: {models.join(" · ")}
                      </div>
                      {v.how.map((p, i) => <p key={i} style={A.para}>{p}</p>)}
                      <p style={A.cost}><span style={A.costLabel}>What it gives up.</span> {v.cost}</p>
                      {info.paper && (
                        <a style={A.paper} href={info.paper.url} target="_blank" rel="noreferrer">
                          {info.paper.label} ↗
                        </a>
                      )}
                    </div>
                    <div style={A.cardFig}>{v.fig}</div>
                  </article>
                );
              })}
            </section>
          );
        })}

        <section style={A.family}>
          <h2 style={A.familyTitle}>And the ones nobody will tell you about</h2>
          <p style={A.familyBlurb}>
            {undisclosed} of the {MODELS.length} models in the atlas publish no attention mechanism at
            all — the Claude, GPT and Muse Spark lines among them. They are certainly doing something
            from this menu, and possibly something not on it. The atlas records “Undisclosed” rather
            than guessing, because a plausible guess on a page like this is indistinguishable from a
            fact.
          </p>
        </section>

      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- styles -- */

const F = {
  fig: { margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  cap: { fontSize: 11.5, lineHeight: 1.45, color: FAINT, textAlign: "center", maxWidth: 260 },
};

const A = {
  back: { display: "inline-flex", alignItems: "center", gap: 9, background: "none", border: "none",
    color: SOFT, fontSize: 13.5, cursor: "pointer", padding: "6px 0", marginBottom: 22,
    fontFamily: "inherit" },
  backLogo: { width: 20, height: 20, borderRadius: 4 },
  problemRow: { display: "flex", flexWrap: "wrap", gap: 30, justifyContent: "center",
    padding: "26px 0 34px", borderBottom: `1px solid ${LINE}`, marginBottom: 8 },
  family: { marginTop: 44 },
  familyTitle: { fontFamily: serif, fontSize: "clamp(21px, 2.6vw, 28px)", fontWeight: 500,
    color: INK, margin: "0 0 6px", letterSpacing: "-0.01em" },
  familyBlurb: { color: SOFT, fontSize: 14.5, lineHeight: 1.6, maxWidth: 640, margin: "0 0 22px" },
  card: { display: "flex", gap: 30, alignItems: "flex-start", flexWrap: "wrap",
    background: "var(--card)", border: `1px solid ${LINE}`, borderRadius: 10,
    padding: "22px 24px", marginBottom: 16, boxShadow: "var(--shadow)" },
  cardBody: { flex: "1 1 340px", minWidth: 0 },
  cardFig: { flex: "0 1 260px", display: "flex", justifyContent: "center", paddingTop: 6 },
  cardTitle: { fontFamily: mono, fontSize: 14, fontWeight: 600, color: INK, margin: "0 0 6px",
    letterSpacing: "-0.01em" },
  usedBy: { fontFamily: mono, fontSize: 11, color: FAINT, marginBottom: 14, lineHeight: 1.5 },
  para: { color: INK, fontSize: 14.5, lineHeight: 1.68, margin: "0 0 12px" },
  cost: { color: SOFT, fontSize: 13.5, lineHeight: 1.6, margin: "14px 0 0",
    borderLeft: `2px solid ${CLAY}`, paddingLeft: 12 },
  costLabel: { color: CLAY, fontWeight: 600 },
  paper: { display: "inline-block", marginTop: 14, fontFamily: mono, fontSize: 11.5,
    color: SOFT, textDecoration: "none", borderBottom: `1px solid ${LINE}` },
};

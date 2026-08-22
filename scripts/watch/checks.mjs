/**
 * The checks themselves. Each returns { findings, checked, skipped }.
 *
 * A finding means "a human should look at this". None of these ever edit data —
 * the whole design is that automation detects and proposes, and a person merges,
 * because the atlas's value is that a human decided each field was sourced.
 */
import { get, ogTitle, arxivId, isPdf, INCONCLUSIVE, systemic } from "./lib.mjs";

/**
 * Every outbound citation still resolves, and still points at what we said it did.
 * A dead report link is a small problem; a live link that now points somewhere else
 * is a much larger one, which is why the title is compared rather than the status.
 */
export async function checkLinks(maps) {
  const targets = [];
  for (const [model, r] of Object.entries(maps.REPORTS)) targets.push({ model, url: r.url, kind: "report" });
  for (const [model, repo] of Object.entries(maps.HF_LINKS))
    targets.push({ model, url: `https://huggingface.co/${repo}`, kind: "weights", repo });

  // Fetch each distinct URL once. Several models legitimately cite one page — the
  // three GPT-5.6 variants share an OpenAI announcement — and fetching it per model
  // both triples the requests and lets a rate-limiting host answer differently each
  // time: one run returned 404 twice and 403 once for that single URL, reported as
  // two dead links plus one unreachable target rather than one page nobody could
  // judge. One request, one verdict, all the models that share it named together.
  const byUrl = new Map();
  for (const t of targets) {
    if (!byUrl.has(t.url)) byUrl.set(t.url, []);
    byUrl.get(t.url).push(t);
  }

  const findings = [];
  let checked = 0, skipped = 0;
  const results = [];
  for (const [url, group] of byUrl) results.push({ t: group[0], group, res: await get(url) });

  const blocked = systemic(results.map((r) => r.res));
  if (blocked) return { findings: [], checked: 0, skipped: results.length, blocked };

  for (const { t, group, res } of results) {
    if (INCONCLUSIVE.has(res.status)) { skipped++; continue; }
    checked++;
    const title = ogTitle(res.body);
    const who = group.map((g) => g.model).join(", ");
    if (!res.ok) {
      findings.push({ subject: `${who} (${t.kind})`, url: t.url,
        detail: `HTTP ${res.status}` });
      continue;
    }
    // HF serves a 404 body under a 401 for missing repos; the title is the tell.
    if (t.kind === "weights") {
      const wanted = t.repo.split("/").pop().toLowerCase();
      if (!title || !title.toLowerCase().includes(wanted.slice(0, 8))) {
        findings.push({ subject: `${who} (weights)`, url: t.url,
          detail: `og:title is ${title ? `"${title}"` : "missing"}, which does not look like \`${t.repo}\` — the repo may have moved or been withdrawn` });
      }
    } else if (!title && !isPdf(res)) {
      findings.push({ subject: `${who} (report)`, url: t.url,
        detail: "page returned 200 but carries no title; may have become a redirect or a shell" });
    }
  }
  return { findings, checked, skipped };
}

/**
 * Resolve every arXiv id against the arXiv API and compare the paper's real title
 * with the label the atlas shows. A citation pointing at the wrong paper is worse
 * than no citation, and it is invisible on the page.
 */
/**
 * Words that appear in our labels because of how a label is written, not because of
 * what it cites. Matching on these would let any label pass against any paper.
 */
const LABEL_NOISE = new Set(["arxiv", "tech", "technical", "report", "paper", "preprint", "model", "card"]);

/**
 * Citations where the label and the title genuinely share nothing, and a human has
 * confirmed the pairing is right anyway. Mamba-2's paper is titled "Transformers are
 * SSMs"; no string comparison will ever reconcile those two, and re-reporting it
 * every morning is how a watcher gets muted. Each entry records who resolved it and
 * when, so a stale exemption can be re-checked rather than trusted forever.
 */
const RESOLVED = new Map([
  ["2405.21060", 'cited as Mamba-2; the paper is titled "Transformers are SSMs" (resolved by hand 2026-08-13)'],
]);

/** Distinctive tokens of a string: what is left once noise and version numbers go. */
const tokens = (s) =>
  s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !LABEL_NOISE.has(w));

export async function checkCitations(maps) {
  const cites = new Map();
  const add = (label, url) => { const id = arxivId(url); if (id && !cites.has(id)) cites.set(id, label); };
  for (const v of Object.values(maps.REPORTS)) add(v.label, v.url);
  for (const v of Object.values(maps.ATTENTION_INFO)) if (v.paper) add(v.paper.label, v.paper.url);
  for (const arr of Object.values(maps.ARCH_PAPERS)) for (const p of arr) add(p.label, p.url);
  for (const p of maps.POSITIONAL_PAPERS) add(p.label, p.url);

  const findings = [];
  let checked = 0, skipped = 0;
  const results = [];
  for (const [id, label] of cites)
    // https, not http: the http endpoint 301s to it, costing a round trip per id.
    results.push({ id, label, res: await get(`https://export.arxiv.org/api/query?id_list=${id}`) });

  const blocked = systemic(results.map((r) => r.res));
  if (blocked) return { findings: [], checked: 0, skipped: results.length, blocked };

  for (const { id, label, res } of results) {
    if (INCONCLUSIVE.has(res.status)) { skipped++; continue; }
    checked++;
    const m = res.body.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
    if (!m) {
      findings.push({ subject: `arXiv:${id}`, url: `https://arxiv.org/abs/${id}`,
        detail: `no such paper in the arXiv API — cited here as "${label}"` });
      continue;
    }
    const real = m[1].replace(/\s+/g, " ").trim();
    if (RESOLVED.has(id)) continue;
    // Compare in both directions. Matching only the title's long words against the
    // label missed the one token that identifies the paper — "GQA" is three letters,
    // "Kimi K3" is two short ones — so every correct-but-terse citation was reported:
    // the GQA, GLM-5 and Kimi K3 entries were all flagged while pointing at exactly
    // the right paper. A label is wrong only when nothing distinctive is shared
    // either way.
    const words = real.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const lab = label.toLowerCase();
    const overlap = words.filter((w) => lab.includes(w)).length
      + tokens(label).filter((w) => real.toLowerCase().includes(w)).length;
    if (words.length && overlap === 0) {
      findings.push({ subject: `arXiv:${id}`, url: `https://arxiv.org/abs/${id}`,
        detail: `cited as "${label}" but the paper is titled "${real}" — no shared terms, so check this is the intended reference` });
    }
  }
  return { findings, checked, skipped };
}

/**
 * SPECS is meant to be regenerated from each model's config.json rather than typed.
 * This checks it still matches the file it came from — a lab can and does re-upload
 * a corrected config after release.
 */
export async function checkSpecs(maps) {
  const findings = [];
  let checked = 0, skipped = 0;
  const seen = [];
  const num = (s) => (s == null ? null : Number(String(s).replace(/[^\d.]/g, "")) || null);

  for (const [model, repo] of Object.entries(maps.HF_LINKS)) {
    const spec = maps.SPECS[model];
    if (!spec) continue;
    const res = await get(`https://huggingface.co/${repo}/raw/main/config.json`);
    seen.push(res);
    if (INCONCLUSIVE.has(res.status) || !res.ok) { skipped++; continue; }
    let cfg;
    try { cfg = JSON.parse(res.body); } catch { skipped++; continue; }
    checked++;

    const text = cfg.text_config || cfg;   // multimodal configs nest the LM
    const cmp = [
      ["vocab", num(spec.vocab), text.vocab_size],
      ["layers", num(spec.layers), text.num_hidden_layers],
      ["hidden", num(spec.hidden), text.hidden_size],
    ];
    for (const [field, ours, theirs] of cmp) {
      if (ours == null || theirs == null) continue;
      if (ours !== theirs) {
        findings.push({ subject: `${model}.${field}`,
          url: `https://huggingface.co/${repo}/blob/main/config.json`,
          detail: `atlas says ${ours}, config.json now says ${theirs}` });
      }
    }
    // Fields the atlas does not yet carry but the config publishes — the backlog.
    const missing = [];
    if (text.rms_norm_eps != null && !spec.norm) missing.push("norm type");
    if (text.hidden_act && !spec.activation) missing.push(`activation (${text.hidden_act})`);
    if (text.intermediate_size && !spec.ffn) missing.push(`FFN size (${text.intermediate_size})`);
    if (text.head_dim && !spec.headDim) missing.push(`head_dim (${text.head_dim})`);
    if (missing.length) {
      findings.push({ subject: `${model} (new fields available)`,
        url: `https://huggingface.co/${repo}/blob/main/config.json`,
        detail: `config.json publishes ${missing.join(", ")} — not yet recorded` });
    }
  }
  const blocked = systemic(seen);
  if (blocked) return { findings: [], checked: 0, skipped: seen.length, blocked };
  return { findings, checked, skipped };
}

/**
 * Where a lab sits, and where the line between the two tiers falls.
 *
 * The atlas already grades every row `Frontier`, `Mid` or `SLM`, and the two
 * scheduled runs are that same axis: the daily run watches the handful of labs
 * training at the frontier, the weekly one watches everyone else plus the small
 * models the frontier labs ship on the side. Splitting them is what keeps the
 * daily issue short enough to act on — one run over all eighteen orgs filed 35
 * leads on 2026-08-20 and a list that long gets skimmed, not worked.
 */
const FRONTIER_ORGS = [
  "Qwen", "deepseek-ai", "moonshotai", "zai-org", "meta-llama", "google", "openai", "xai-org",
];

const OTHER_ORGS = [
  "nvidia", "mistralai", "microsoft", "CohereLabs", "MiniMaxAI", "sarvamai",
  "HuggingFaceTB", "allenai", "ibm-granite", "upstage",
];

/**
 * A frontier lab ships small models too — Gemma, Qwen's 27B, gpt-oss — and those
 * belong in the weekly pass, not the daily one. Total parameters is the only scale
 * signal Hugging Face publishes in a listing call, and 100B is where this table's
 * own `Frontier` rows start: the smallest is DeepSeek V4 Flash at 284B, the largest
 * `Mid` row is well under it.
 *
 * The threshold only ever *demotes*, never promotes. A 560B model from a lab outside
 * the frontier list is still the weekly run's business, not the daily one's — the
 * first cut of this gated on size alone and NVIDIA's 560B Nemotron teachers fell
 * through both runs, watched by neither. A repo that publishes no parameter count is
 * judged by its lab alone, because a missed frontier release costs more than a lead
 * that turns out to be a 7B checkpoint.
 */
const FRONTIER_MIN_PARAMS = 100e9;

/** Language models, including the natively multimodal ones. */
const LM_PIPELINES = new Set(["text-generation", "image-text-to-text"]);

/** Quantisations, repackaged builds and speculative-decoding drafts of a model. */
const REPACKAGED = /-(gguf|awq|gptq|mlx|int4|int8|fp8|nvfp4|nvfp8|bnb|onnx|dspark|dflash|bf16|fp16|eagle)\b|-executorch|^(eagle3|dflash|dspark)_/i;

/**
 * New releases from the labs already in the atlas. Hugging Face's model API is the
 * cheapest reliable signal: a lab that ships open weights lists them there long
 * before anyone writes it up.
 *
 * `expand[]=safetensors` returns the parameter count in the same listing request,
 * which is what makes the tier split free — no per-repo follow-up call.
 */
export async function watchReleases(maps, { tier = "frontier", sinceDays = 45 } = {}) {
  const orgs = tier === "frontier" ? FRONTIER_ORGS : [...FRONTIER_ORGS, ...OTHER_ORGS];
  const known = new Set(Object.values(maps.HF_LINKS).map((r) => r.toLowerCase()));
  const cutoff = Date.now() - sinceDays * 864e5;
  const hits = [];
  let checked = 0, skipped = 0;
  const seen = [];

  for (const org of orgs) {
    const res = await get(
      `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&sort=createdAt&direction=-1&limit=25`
      + `&expand[]=safetensors&expand[]=pipeline_tag&expand[]=createdAt&expand[]=downloads`,
      { headers: { accept: "application/json" } });
    seen.push(res);
    if (INCONCLUSIVE.has(res.status) || !res.ok) { skipped++; continue; }
    checked++;
    let list;
    try { list = JSON.parse(res.body); } catch { continue; }
    const frontierLab = FRONTIER_ORGS.includes(org);
    for (const m of list) {
      const id = String(m.modelId || m.id || "");
      if (!id || known.has(id.toLowerCase())) continue;
      const created = Date.parse(m.createdAt || m.lastModified || "");
      if (!created || created < cutoff) continue;
      // The atlas tracks language models; everything else is another site's job.
      // Without this the check reported embeddings, ASR, vision, DNA and music
      // models beside the LLMs. pipeline_tag is set by the lab, so it is the one
      // filter that does not guess from the name.
      if (!LM_PIPELINES.has(m.pipeline_tag)) continue;
      // Skip the long tail of quantisations, repackaged builds and finetunes of
      // things we already have: -NVFP4/-DSpark/-BF16 builds ship as separate
      // repos beside the model itself, and the model is the finding, not its
      // fifth container format.
      if (REPACKAGED.test(id)) continue;
      if (/base|instruct-v\d|-lora|-adapter/i.test(id) && known.has(id.split("-")[0].toLowerCase())) continue;
      // A dated snapshot of a repo the atlas already links is not a new model.
      // DeepSeek ships `DeepSeek-V4-Pro-0813` beside `DeepSeek-V4-Pro`, and filing
      // it every morning for the rest of the year is how a watcher gets muted. What
      // matters about a refreshed checkpoint is whether its numbers moved, and the
      // board check answers that from the score rather than from the repo name.
      if (known.has(id.replace(/-\d{4}$/, "").toLowerCase())) continue;
      // Which run this belongs to: a frontier lab's flagship is the daily pass,
      // everything else is the weekly one. A quantised repo's parameter total counts
      // tensors, not weights, so it is meaningless — but those are already gone.
      const params = m.safetensors?.total ?? null;
      const isFlagship = params == null || params >= FRONTIER_MIN_PARAMS;
      if ((tier === "frontier") !== (frontierLab && isFlagship)) continue;
      hits.push({ id, org, created, params, downloads: m.downloads ?? 0 });
    }
  }

  const blocked = systemic(seen);
  if (blocked) return { findings: [], checked: 0, skipped: seen.length, blocked };

  const findings = collapseSiblings(hits).sort((a, b) => a.subject.localeCompare(b.subject));
  return { findings: findings.slice(0, tier === "frontier" ? 15 : 30), checked, skipped };
}

/**
 * One release, one finding.
 *
 * A single launch lands as a row of near-identical repos — the five
 * `Nemotron-Labs-Teacher-{Chat,STEM,…}` variants published the same morning at the
 * same 560B — and filing one lead each buries the four other things the run found.
 * Siblings of a release share an exact parameter total and a publication day, which
 * no two genuinely different models do, so that pair is the grouping key; the
 * finding is named for what they have in common and names the rest.
 */
function collapseSiblings(hits) {
  const groups = new Map();
  for (const h of hits) {
    const day = new Date(h.created).toISOString().slice(0, 10);
    const key = `${h.org}|${h.params ?? "?"}|${day}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...h, day });
  }

  const out = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    const [first] = group;
    const size = first.params ? `${(first.params / 1e9).toFixed(0)}B params` : "parameter count not published";
    const downloads = group.reduce((n, g) => n + g.downloads, 0);
    const rest = group.length > 1
      ? ` — and ${group.length - 1} sibling repo(s) published the same day at the same size: ${group.slice(1).map((g) => g.id.split("/").pop()).join(", ")}`
      : "";
    out.push({
      subject: group.length > 1 ? `${commonPrefix(group.map((g) => g.id))}*` : first.id,
      url: `https://huggingface.co/${first.id}`,
      detail: `published ${first.day}, ${size}, ${downloads} downloads — not in the atlas${rest}`,
    });
  }
  return out;
}

/** The shared head of a group of repo ids, trimmed back to a separator. */
function commonPrefix(ids) {
  let i = 0;
  while (i < ids[0].length && ids.every((id) => id[i] === ids[0][i])) i++;
  return ids[0].slice(0, i).replace(/[-_ ]+$/, "") || ids[0];
}

/**
 * The frontier leaderboard, against what the atlas carries.
 *
 * Hugging Face cannot see a closed model, and the labs the daily run cares about
 * most — OpenAI, Anthropic, Google, xAI — release their flagships nowhere near it.
 * Artificial Analysis publishes its own ranked board, embedded as JSON in the page,
 * and the atlas already sources `intel` from exactly there, so one request answers
 * both questions worth asking: which ranked frontier models are missing entirely,
 * and which scores we recorded have since moved.
 *
 * The board is the *only* place a closed release shows up automatically. Everything
 * else here would have reported a clean run the week Gemini shipped.
 */
const AA_BOARD = "https://artificialanalysis.ai/models";

/** How far an AA score may drift before it is worth re-reading the row. */
const INTEL_TOLERANCE = 2;

export async function checkFrontierBoard(maps) {
  const res = await get(AA_BOARD);
  if (INCONCLUSIVE.has(res.status) || !res.ok) {
    return { findings: [], checked: 0, skipped: 1,
      blocked: `artificialanalysis.ai answered HTTP ${res.status}.` };
  }

  // AA server-renders its board into the page as JSON and repeats it per section,
  // so entries are deduplicated on the detail URL rather than the label.
  const board = new Map();
  for (const m of res.body.matchAll(/\{"label":"([^"]+)","intelligenceIndex":([0-9.]+|null),"detailsUrl":"([^"]+)"\}/g)) {
    board.set(m[3], { label: m[1], intel: m[2] === "null" ? null : +m[2], url: m[3] });
  }
  if (!board.size) {
    return { findings: [], checked: 0, skipped: 1,
      blocked: "the board is no longer embedded in the page in a shape this check can read." };
  }

  const byName = new Map(maps.MODELS.map((m) => [boardKey(m.name), m]));
  // AA pins the size into the label of an open-weights model — "Solar Open2 250B"
  // against this table's "Solar Open 2". Dropping a trailing size is tried only
  // after the exact key misses, and only lands on a row that carries no size of
  // its own, so "Qwen3.8 27B" can never fall through to a differently-sized row.
  // The size has to come off the label while it is still a word. Stripping it from
  // the flattened key instead makes "solaropen2250b" lose the model's own trailing
  // 2 along with the 250B, and "Solar Open" matches nothing.
  const match = (label) => byName.get(boardKey(label))
    ?? byName.get(boardKey(label.replace(/\s+\d+(\.\d+)?\s*[bmt]\s*$/i, "")));
  const findings = [];
  for (const entry of board.values()) {
    const ours = match(entry.label);
    if (!ours) {
      findings.push({ subject: entry.label, url: `https://artificialanalysis.ai${entry.url}`,
        detail: `ranked${entry.intel != null ? ` at ${entry.intel.toFixed(1)}` : ""} on the Artificial Analysis board, and no row here matches that name — either a release the atlas has not covered, or one it carries under a different name` });
      continue;
    }
    if (entry.intel == null) continue;
    // A row left unrated because AA had not tested it yet. `intel` may only come
    // from AA, so the board appearing is the one event that can fill that blank.
    if (ours.intel == null) {
      findings.push({ subject: `${ours.name} (unrated here)`, url: `https://artificialanalysis.ai${entry.url}`,
        detail: `the atlas records no intelligence index; the board now rates "${entry.label}" at ${entry.intel.toFixed(1)} — check the variant matches this row before recording it` });
      continue;
    }
    if (Math.abs(entry.intel - ours.intel) >= INTEL_TOLERANCE) {
      findings.push({ subject: `${ours.name} (intelligence index)`, url: `https://artificialanalysis.ai${entry.url}`,
        detail: `atlas records ${ours.intel}, the board now shows ${entry.intel.toFixed(1)} for "${entry.label}" — AA re-tests, so confirm which run the row should quote` });
    }
  }
  return { findings, checked: board.size, skipped: 0 };
}

/**
 * A board label reduced to the part that identifies the model.
 *
 * The two sides write the same model differently and neither is wrong: AA prefixes
 * the vendor ("Claude Opus 5"), suffixes the reasoning effort it measured ("(max)",
 * "(with fallback)") and pins the snapshot it tested ("DeepSeek V4 Pro 0813"), while
 * the atlas names the model. Matching is exact on what is left, never on a prefix:
 * "GLM-5.3" starts with "GLM-5", and quietly resolving a new release to the old row
 * is the one failure this check exists to prevent.
 */
const VENDOR_PREFIX = /^(claude|openai|google|meta|anthropic|alibaba|deepseek ai|zhipu|moonshot)\s+/i;
/**
 * A trailing parenthesis means one of two opposite things, and stripping both broke
 * the check the first time: AA appends the reasoning effort it measured — "(max)",
 * "(with fallback)" — while this table parenthesises a size, "Qwen3.8 (27B)". Drop
 * the qualifier, keep the size, and the two sides meet at "qwen3827b".
 */
const dropQualifier = (s) =>
  s.replace(/\s*\(([^)]*)\)\s*$/, (whole, inner) => (/\d\s*[bmt]\b/i.test(inner) ? whole : ""));
const boardKey = (label) =>
  dropQualifier(String(label))
    .replace(VENDOR_PREFIX, "")
    .replace(/\s+\d{4}$/, "")            // AA's snapshot stamp: "… V4 Pro 0813"
    .toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The architecture gallery's changelog feed.
 *
 * The diagrams on this site are hot-linked from Sebastian Raschka's LLM
 * Architecture Gallery, so when he publishes a card we may have a diagram to add,
 * and when he publishes a card for something we do not carry at all, that is a
 * release worth looking at from someone who has already read the architecture.
 *
 * Two kinds of finding, deliberately separated, because they cost a reviewer very
 * different amounts of work:
 *
 *   1. A card whose model is already in the atlas but has no DIAGRAMS entry. This
 *      is a five-minute job: confirm the image resolves, mirror it, add the entry.
 *   2. A card for a model the atlas does not have. This is a research pass, and
 *      the check says so rather than pretending the two are the same task.
 *
 * The slug is guessed from the changelog anchor and then *verified* against the
 * gallery's own structured data rather than trusted, because a guessed slug that
 * 404s would send a reviewer to add a broken image — the exact failure the
 * verify-every-link rule exists to prevent.
 */
const GALLERY = "https://sebastianraschka.com/llm-architecture-gallery";

export async function checkGallery(maps, sinceDays = 45) {
  const feed = await get(`${GALLERY}/rss.xml`);
  const index = await get(`${GALLERY}/`);
  if (INCONCLUSIVE.has(feed.status) || !feed.ok || !index.ok) {
    return { findings: [], checked: 0, skipped: 1, blocked: true };
  }

  // The gallery index carries a JSON-LD ItemList: every card's display name against
  // its "#card-<slug>" anchor. This is the authority for what is a card at all, and
  // it is what keeps the check quiet — changelog entries also announce explainers,
  // meta-analyses and batch updates ("Added May 10 architecture gallery updates"),
  // and none of those are a model. A name that is not in this list is not reported.
  const cards = new Map();
  for (const m of index.body.matchAll(/"name":"([^"]+)","url":"[^"]*#card-([a-z0-9.-]+)"/g)) {
    cards.set(m[1], m[2]);
  }
  if (!cards.size) return { findings: [], checked: 0, skipped: 1, blocked: true };

  const known = new Set(Object.keys(maps.DIAGRAMS));
  const slugs = new Set(Object.values(maps.DIAGRAMS).map((d) => d.slug));
  const cutoff = Date.now() - sinceDays * 864e5;
  const findings = [];
  const seen = new Set();

  for (const item of feed.body.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const tag = (t) => ((item.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const when = Date.parse(tag("pubDate"));
    if (!when || when < cutoff) continue;
    const title = tag("title");
    const date = new Date(when).toISOString().slice(0, 10);

    // Every card the entry names, found by looking for card names in the title
    // rather than by trying to parse the sentence. Titles are prose — "Added Kimi
    // K2.7 Code and MiniMax M3", "Mega update: Added Antares 1B, BTL-3, …" — and
    // matching against the known list is the only way that does not invent models.
    for (const [cardName, slug] of cards) {
      if (!title.includes(cardName) || seen.has(cardName)) continue;
      seen.add(cardName);
      const ours = matchModel(maps.MODELS, cardName);
      if (ours && (known.has(ours) || slugs.has(slug))) continue;
      findings.push(ours
        ? { subject: `${ours} — gallery card, no diagram here`,
            url: `${GALLERY}/#card-${slug}`,
            detail: `${date}: "${title}". Slug ${slug}; add to DIAGRAMS and mirror into public/diagrams/.` }
        : { subject: `${cardName} — in the gallery, not in the atlas`,
            url: `${GALLERY}/#card-${slug}`,
            detail: `${date}: "${title}". Needs the full research pass, not just a diagram.` });
    }
  }
  return { findings: findings.slice(0, 40), checked: 1, skipped: 0 };
}

/**
 * The atlas's name for a gallery card, or null.
 *
 * Names travel between the two with different punctuation and different amounts of
 * size in them: "Qwen3.8 27B" here is "Qwen3.8 (27B)" there, "Muse Glimmer 30B" is
 * "Muse Glimmer". An exact normalised match is tried first, then a prefix match —
 * but only when exactly one model matches, because "Muse Spark" is a prefix of
 * three of them and guessing which is worse than reporting nothing.
 */
function matchModel(models, cardName) {
  const want = norm(cardName);
  const exact = models.find((m) => norm(m.name) === want);
  if (exact) return exact.name;
  const prefix = models.filter((m) => want.startsWith(norm(m.name)));
  return prefix.length === 1 ? prefix[0].name : null;
}

// Punctuation and spacing differ on both sides; compare on letters and digits only.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

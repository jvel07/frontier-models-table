/**
 * Fetch everything a new atlas row needs, in one shot, without the agent
 * opening pages one at a time.
 *
 *   node scripts/fetch-model.mjs "Solar Open 2" --hf upstage/Solar-Open2-250B
 *   node scripts/fetch-model.mjs "Solar Open 2" --hf upstage/Solar-Open2-250B --aa solar-open2-250b
 *
 * The sweep agent used to spend a dozen turns on WebFetch calls — config.json,
 * then the model card, then three Artificial Analysis pages — re-reading the
 * whole conversation between each one. Each of those pages is kilobytes of
 * facts wrapped in megabytes of markup. This script fetches the same sources
 * and prints only the facts (~1,500 tokens), so research costs one tool call.
 *
 * Sources, in order:
 *   1. huggingface.co/api/models/<repo>  — release date, license tag, gating
 *   2. huggingface.co/<repo>/raw/main/config.json — the SPECS source of truth
 *   3. artificialanalysis.ai/models + the model's detail page — intel/agentic
 *      indexes and the fields AA reads off its own testing
 *
 * AA has no keyless API; the numbers come out of the JSON embedded in its
 * server-rendered pages. If AA stops embedding them, this prints what it found
 * and says so — a miss here means "rate it by hand this once", not "guess".
 */
import { argv } from "node:process";

const name = argv[2];
const flag = (f) => {
  const i = argv.indexOf(f);
  return i > 0 ? argv[i + 1] : null;
};
const hfRepo = flag("--hf");
const aaSlugOverride = flag("--aa");

if (!name || !hfRepo) {
  console.error('usage: node scripts/fetch-model.mjs "<atlas name>" --hf <org/repo> [--aa <aa-slug>]');
  process.exit(2);
}

const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) model-atlas-fetch/1.0" };
const get = async (url) => {
  const r = await fetch(url, { headers: UA, redirect: "follow" });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
};

// --- 1 & 2: Hugging Face -----------------------------------------------------
console.log(`=== Hugging Face: ${hfRepo} ===`);
try {
  const meta = JSON.parse(await get(`https://huggingface.co/api/models/${hfRepo}`));
  const tags = meta.tags || [];
  console.log(JSON.stringify({
    id: meta.id,
    createdAt: meta.createdAt,
    lastModified: meta.lastModified,
    gated: meta.gated ?? false,
    private: meta.private ?? false,
    pipeline_tag: meta.pipeline_tag ?? null,
    library_name: meta.library_name ?? null,
    license: (tags.find((t) => t.startsWith("license:")) || "license:(none)").slice(8),
    arxiv: tags.filter((t) => t.startsWith("arxiv:")).map((t) => t.slice(6)),
    other_tags: tags.filter((t) => !/^(license:|arxiv:|region:|endpoints_compatible)/.test(t)),
    downloads: meta.downloads,
    likes: meta.likes,
    cardData: meta.cardData ?? null,
  }, null, 1));
} catch (e) {
  console.log(`HF API failed: ${e.message}`);
}

console.log(`\n=== config.json (https://huggingface.co/${hfRepo}/raw/main/config.json) ===`);
try {
  const raw = await get(`https://huggingface.co/${hfRepo}/raw/main/config.json`);
  // Configs are small; print verbatim so nothing is summarised away.
  console.log(JSON.stringify(JSON.parse(raw), null, 1));
} catch (e) {
  console.log(`config.json failed: ${e.message}`);
}

// --- 3: Artificial Analysis --------------------------------------------------
console.log(`\n=== Artificial Analysis ===`);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
try {
  let slug = aaSlugOverride;
  let indexScore = null;
  if (!slug) {
    const html = await get("https://artificialanalysis.ai/models");
    const entries = [...html.matchAll(/\{"label":"([^"]+)","intelligenceIndex":([0-9.]+|null),"detailsUrl":"([^"]+)"\}/g)]
      .map((m) => ({ label: m[1], intelligenceIndex: m[2] === "null" ? null : +m[2], url: m[3] }));
    const want = norm(name);
    const seen = new Set();
    const hits = entries.filter((e) => {
      if (!(norm(e.label).includes(want) || want.includes(norm(e.label)))) return false;
      if (seen.has(e.url)) return false; // AA embeds the list twice per page
      seen.add(e.url);
      return true;
    });
    if (hits.length === 0) {
      console.log(`No AA entry matching "${name}". As of today AA has not rated it — intel/coding/agentic are null.`);
      process.exit(0);
    }
    if (hits.length > 1) {
      console.log(`Ambiguous — re-run with --aa <slug>. Candidates:`);
      for (const h of hits) console.log(`  ${h.label}  intel=${h.intelligenceIndex}  ${h.url}`);
      process.exit(2);
    }
    slug = hits[0].url.split("/").pop();
    indexScore = hits[0].intelligenceIndex;
    console.log(`Matched "${name}" -> "${hits[0].label}" (${hits[0].url})`);
  }

  const detail = (await get(`https://artificialanalysis.ai/models/${slug}`)).replace(/\\"/g, '"');
  const anchor = detail.indexOf(`"slug":"${slug}"`);
  if (anchor < 0) throw new Error("model record not embedded in detail page");
  // The record starts at the {"id":"..."} opening its object.
  const start = detail.lastIndexOf('{"id":"', anchor);
  const window = detail.slice(start, start + 12000);
  const field = (re) => {
    const m = window.match(re);
    return m ? (m[1] === "null" ? null : m[1].replace(/^"|"$/g, "")) : undefined;
  };
  const num = (f) => field(new RegExp(`"${f}":(-?[0-9.eE]+|null)`));
  const str = (f) => field(new RegExp(`"${f}":("(?:[^"]*)"|null|true|false)`));

  const out = {
    name: str("name"),
    slug,
    releaseDate: str("releaseDate"),
    intelligenceIndex: num("intelligenceIndex") ?? indexScore,
    intelligenceIndexIsEstimated: str("intelligenceIndexIsEstimated"),
    agenticIndex: num("agenticIndex"),
    parameters_B: num("parameters"),
    activeParameters_B: num("inferenceParametersActiveBillions"),
    contextWindowTokens: num("contextWindowTokens"),
    isOpenWeights: str("isOpenWeights"),
    licenseName: str("licenseName"),
    modelWeightsSourceUrl: str("modelWeightsSourceUrl"),
    price1mInputTokens: num("price1mInputTokens"),
    price1mOutputTokens: num("price1mOutputTokens"),
  };
  console.log(JSON.stringify(out, null, 1));

  // Benchmark subscores: print only the ones AA actually reports.
  const subs = ["gpqa", "hle", "scicode", "lcr", "critpt", "ifbench", "aime25", "livecodebench",
    "mmmuPro", "terminalbenchV21", "terminalbenchHard", "tau2", "tauBanking", "gdpval", "itBenchSre", "apexAgents"];
  const reported = subs.map((s) => [s, num(s)]).filter(([, v]) => v != null);
  console.log("subscores reported: " + (reported.length ? reported.map(([s, v]) => `${s}=${(+v).toFixed(3)}`).join(" ") : "none"));
  console.log('note: the Coding Agent Index is not embedded in this page. If the row needs it, fetch https://artificialanalysis.ai/' +
    'and search for the model under Coding Agents — one targeted fetch, not a crawl.');
} catch (e) {
  console.log(`AA lookup failed: ${e.message}`);
  console.log("Treat as unrated unless you check artificialanalysis.ai by hand this run.");
}

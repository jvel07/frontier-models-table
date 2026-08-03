/**
 * The checks themselves. Each returns { findings, checked, skipped }.
 *
 * A finding means "a human should look at this". None of these ever edit data —
 * the whole design is that automation detects and proposes, and a person merges,
 * because the atlas's value is that a human decided each field was sourced.
 */
import { get, ogTitle, arxivId, INCONCLUSIVE, systemic } from "./lib.mjs";

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

  const findings = [];
  let checked = 0, skipped = 0;
  const results = [];
  for (const t of targets) results.push({ t, res: await get(t.url) });

  const blocked = systemic(results.map((r) => r.res));
  if (blocked) return { findings: [], checked: 0, skipped: results.length, blocked };

  for (const { t, res } of results) {
    if (INCONCLUSIVE.has(res.status)) { skipped++; continue; }
    checked++;
    const title = ogTitle(res.body);
    if (!res.ok) {
      findings.push({ subject: `${t.model} (${t.kind})`, url: t.url,
        detail: `HTTP ${res.status}` });
      continue;
    }
    // HF serves a 404 body under a 401 for missing repos; the title is the tell.
    if (t.kind === "weights") {
      const wanted = t.repo.split("/").pop().toLowerCase();
      if (!title || !title.toLowerCase().includes(wanted.slice(0, 8))) {
        findings.push({ subject: `${t.model} (weights)`, url: t.url,
          detail: `og:title is ${title ? `"${title}"` : "missing"}, which does not look like \`${t.repo}\` — the repo may have moved or been withdrawn` });
      }
    } else if (!title) {
      findings.push({ subject: `${t.model} (report)`, url: t.url,
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
    results.push({ id, label, res: await get(`http://export.arxiv.org/api/query?id_list=${id}`) });

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
    // Compare on distinctive words rather than the whole string: our labels are
    // deliberately shorter than paper titles, so an exact match would always fail.
    const words = real.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const lab = label.toLowerCase();
    const overlap = words.filter((w) => lab.includes(w)).length;
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
 * New releases from the labs already in the atlas. Hugging Face's model API is the
 * cheapest reliable signal: a lab that ships open weights lists them there long
 * before anyone writes it up.
 */
const ORGS = [
  "Qwen", "deepseek-ai", "moonshotai", "zai-org", "meta-llama", "google", "nvidia",
  "mistralai", "microsoft", "CohereLabs", "MiniMaxAI", "sarvamai", "HuggingFaceTB",
  "allenai", "openai", "ibm-granite",
];

export async function watchReleases(maps, sinceDays = 45) {
  const known = new Set(Object.values(maps.HF_LINKS).map((r) => r.toLowerCase()));
  const cutoff = Date.now() - sinceDays * 864e5;
  const findings = [];
  let checked = 0, skipped = 0;
  const seen = [];

  for (const org of ORGS) {
    const res = await get(
      `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&sort=createdAt&direction=-1&limit=25`,
      { headers: { accept: "application/json" } });
    seen.push(res);
    if (INCONCLUSIVE.has(res.status) || !res.ok) { skipped++; continue; }
    checked++;
    let list;
    try { list = JSON.parse(res.body); } catch { continue; }
    for (const m of list) {
      const id = String(m.modelId || m.id || "");
      if (!id || known.has(id.toLowerCase())) continue;
      const created = Date.parse(m.createdAt || m.lastModified || "");
      if (!created || created < cutoff) continue;
      // Skip the long tail of quantisations and finetunes of things we already have.
      if (/-(gguf|awq|gptq|mlx|int4|int8|fp8|bnb|onnx)\b/i.test(id)) continue;
      if (/base|instruct-v\d|-lora|-adapter/i.test(id) && known.has(id.split("-")[0].toLowerCase())) continue;
      findings.push({ subject: id, url: `https://huggingface.co/${id}`,
        detail: `published ${new Date(created).toISOString().slice(0, 10)}, ${m.downloads ?? 0} downloads — not in the atlas` });
    }
  }
  const blocked = systemic(seen);
  if (blocked) return { findings: [], checked: 0, skipped: seen.length, blocked };
  findings.sort((a, b) => a.subject.localeCompare(b.subject));
  return { findings: findings.slice(0, 40), checked, skipped };
}

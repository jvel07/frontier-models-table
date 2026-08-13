/**
 * Shared helpers for the source-watching checks.
 *
 * These scripts are the one part of the project that must reach the open internet:
 * Hugging Face, arXiv, the labs' own blogs. They are written to run on a GitHub
 * Actions runner rather than in a session, because agent sandboxes are commonly
 * behind an egress policy that blocks exactly those hosts — every check here was
 * unrunnable from the session that wrote it.
 *
 * Consequently they are written defensively: every network call has a timeout, a
 * retry, and a failure mode that reports "could not check" rather than "broken".
 * A watcher that cries wolf on a flaky DNS lookup gets muted, and a muted watcher
 * is worse than none.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..", "..");

/** Pull an exported map straight out of the component, the single source of truth. */
export function loadMaps() {
  const src = readFileSync(resolve(ROOT, "src", "FrontierModelsTable.jsx"), "utf8");
  const grab = (name, open = "{", close = "}") => {
    const start = src.indexOf(`export const ${name} = ${open}`);
    if (start < 0) throw new Error(`${name} not found`);
    const from = src.indexOf(open, start);
    let depth = 0, inStr = null, esc = false, comment = false;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (comment) { if (c === "\n") comment = false; continue; }
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === "/" && src[i + 1] === "/") { comment = true; continue; }
      if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (!depth) return new Function(`return ${src.slice(from, i + 1)};`)(); }
    }
    throw new Error(`${name} not terminated`);
  };
  return {
    MODELS: grab("MODELS", "[", "]"),
    SPECS: grab("SPECS"),
    REPORTS: grab("REPORTS"),
    HF_LINKS: grab("HF_LINKS"),
    ATTENTION_INFO: grab("ATTENTION_INFO"),
    POSITIONAL_PAPERS: grab("POSITIONAL_PAPERS", "[", "]"),
    ARCH_PAPERS: grab("ARCH_PAPERS"),
  };
}

const UA = "ModelAtlasWatcher/1.0 (+https://jvel07.github.io/frontier-models-table/)";

/** fetch with a timeout and one retry; never throws. */
export async function get(url, { timeout = 20000, tries = 2, headers = {} } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": UA, ...headers },
        signal: AbortSignal.timeout(timeout),
        redirect: "follow",
      });
      const body = await r.text();
      return { ok: r.ok, status: r.status, body, url: r.url,
        type: r.headers.get("content-type") || "" };
    } catch (e) {
      if (i === tries - 1) return { ok: false, status: 0, body: "", error: String(e.message || e) };
      await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
    }
  }
}

/**
 * Hugging Face answers 401 with a 404-shaped page for some missing repos, so a
 * status code alone lies about whether a link is good. The page's own og:title is
 * the thing worth trusting.
 */
export const ogTitle = (html) => {
  const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
};

export const arxivId = (url) => (String(url).match(/arxiv\.org\/(?:abs|pdf)\/([\d.]+)/) || [])[1] || null;

/**
 * A PDF carries no og:title and never will. Most technical reports in `REPORTS` are
 * served as one — arXiv's /pdf/ route, poolside's assets, NVIDIA's research site —
 * so a title assertion against them reports live reports as empty shells. Sniff the
 * body as well as the header: some hosts serve a PDF as application/octet-stream.
 */
export const isPdf = (res) =>
  /application\/pdf/i.test(res.type || "") || (res.body || "").startsWith("%PDF-");

/**
 * Statuses that mean "we could not check", not "this is broken".
 *
 * 403 is the important one and was found the hard way: run these checks from behind
 * an egress proxy or into a WAF and every target answers 403, which a naive checker
 * reports as the entire bibliography having rotted. Bot-blocking is not link rot.
 * 401 is included because Hugging Face uses it for gated and missing repos alike,
 * and 429 because rate limiting says nothing about the target.
 */
export const INCONCLUSIVE = new Set([0, 401, 403, 429, 451, 503]);

/**
 * When nearly everything fails the same way, the environment is the problem rather
 * than the data. Report that once instead of emitting a finding per target.
 */
export function systemic(results) {
  const checked = results.length;
  if (checked < 5) return null;
  const counts = {};
  for (const r of results) if (INCONCLUSIVE.has(r.status)) counts[r.status] = (counts[r.status] || 0) + 1;
  for (const [status, n] of Object.entries(counts)) {
    if (n / checked > 0.5) {
      return `${n} of ${checked} requests returned HTTP ${status}. That is an environment problem — an egress policy, a proxy, or rate limiting — not ${n} broken links, so nothing was judged from this run.`;
    }
  }
  return null;
}

/** Render a findings list as a GitHub-flavoured markdown section. */
export function section(title, findings, { emptyNote = "Nothing to report." } = {}) {
  if (!findings.length) return `### ${title}\n\n${emptyNote}\n`;
  const lines = findings.map((f) =>
    `- **${f.subject}** — ${f.detail}${f.url ? `  \n  <${f.url}>` : ""}`);
  return `### ${title}\n\n${lines.join("\n")}\n`;
}

/**
 * Fetches Sebastian Raschka's LLM Architecture Gallery changelog feed and writes
 * it to src/changelog.json for the build to bundle.
 *
 * This runs at BUILD time, not in the browser: the feed serves no
 * Access-Control-Allow-Origin header, so a client-side fetch from the Pages
 * domain would be blocked by CORS. Fetching here also keeps the shipped page
 * free of third-party requests at runtime.
 *
 * Failure is non-fatal — if the feed is unreachable we keep whatever is already
 * committed so an offline or rate-limited build still succeeds.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const FEED = "https://sebastianraschka.com/llm-architecture-gallery/rss.xml";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "changelog.json");
const MAX_ITEMS = 12;

const strip = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? strip(m[1]) : "";
};

function parse(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const title = tag(b, "title");
    if (!title) continue;
    const pub = tag(b, "pubDate");
    const d = pub ? new Date(pub) : null;
    items.push({
      title,
      link: tag(b, "link"),
      date: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "",
      summary: tag(b, "description").slice(0, 240),
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

function keepExisting(reason) {
  if (existsSync(OUT)) {
    const n = JSON.parse(readFileSync(OUT, "utf8")).items?.length ?? 0;
    console.warn(`[changelog] ${reason}; keeping committed copy (${n} items)`);
  } else {
    writeFileSync(OUT, JSON.stringify({ fetched: null, items: [] }, null, 2) + "\n");
    console.warn(`[changelog] ${reason}; wrote empty placeholder`);
  }
}

try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  const res = await fetch(FEED, {
    signal: ctrl.signal,
    headers: { "User-Agent": "frontier-models-table build script" },
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const items = parse(await res.text());
  if (!items.length) throw new Error("feed parsed to zero items");

  writeFileSync(
    OUT,
    JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), items }, null, 2) + "\n"
  );
  console.log(`[changelog] wrote ${items.length} items (latest: ${items[0].title})`);
} catch (err) {
  keepExisting(`fetch failed (${err.message})`);
}

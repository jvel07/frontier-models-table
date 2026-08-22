/**
 * Run the source checks and write a markdown report.
 *
 *   node scripts/watch/run.mjs                    the daily frontier pass
 *   node scripts/watch/run.mjs --tier small       the weekly mid/SLM pass
 *   node scripts/watch/run.mjs links              one check
 *   node scripts/watch/run.mjs --out r.md         write the report to a file
 *
 * Two tiers, on two schedules, because they are read by different people at
 * different times. `frontier` runs daily and watches the handful of labs training
 * at the frontier — plus the integrity checks over everything the atlas already
 * carries, which are cheap and belong in the pass someone actually reads each
 * morning. `small` runs weekly over the mid-size and small-model labs, where a
 * release matters but rarely today.
 *
 * Exit code is 1 when something needs a human, 0 when everything is either fine or
 * merely unreachable. That distinction matters: a runner with no network should not
 * open an issue claiming every link in the project is dead.
 */
import { writeFileSync } from "node:fs";
import { loadMaps, section } from "./lib.mjs";
import { checkLinks, checkCitations, checkSpecs, watchReleases, checkGallery, checkFrontierBoard } from "./checks.mjs";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const tierIdx = args.indexOf("--tier");
const tier = tierIdx >= 0 ? args[tierIdx + 1] : "frontier";
const only = args.filter((a, i) => !a.startsWith("--") && a !== outFile
  && !(tierIdx >= 0 && i === tierIdx + 1));

if (!["frontier", "small"].includes(tier)) {
  console.error(`unknown tier "${tier}" — expected frontier or small`);
  process.exit(2);
}

const CHECKS = [
  // The integrity checks read what the atlas already publishes, so they belong to
  // one tier only — running them in both would file every finding twice, in two
  // issues, and a reviewer would fix each one twice before noticing.
  { key: "links", title: "Dead or moved links", fn: checkLinks, tiers: ["frontier"],
    empty: "Every report and weights link still resolves to the page we expect." },
  { key: "citations", title: "Citations that may point at the wrong paper", fn: checkCitations, tiers: ["frontier"],
    empty: "Every arXiv id resolves and shares terms with the label we show." },
  { key: "specs", title: "Config drift, and fields we could now record", fn: checkSpecs, tiers: ["frontier"],
    empty: "Every SPECS entry still matches its config.json." },
  { key: "board", title: "Artificial Analysis: models we do not carry, and scores we have not recorded",
    fn: (maps) => checkFrontierBoard(maps, { tier }), tiers: ["frontier", "small"],
    empty: "Every model AA rates matches a row here, at the score we record." },
  { key: "releases", title: "Models on Hugging Face that are not in the atlas",
    fn: (maps) => watchReleases(maps, { tier }), tiers: ["frontier", "small"],
    empty: "No unrecognised releases from the labs we track." },
  // The gallery covers open-weight architectures of every size, and Raschka posts a
  // card weeks after a launch — nothing here is ever the day's news.
  { key: "gallery", title: "New cards in the LLM Architecture Gallery", fn: checkGallery, tiers: ["small"],
    empty: "Every recent gallery card is either already illustrated here or already in the table." },
];

const TIER_HEADER = {
  frontier: "frontier labs — OpenAI, Anthropic, Google, DeepSeek, Alibaba, Moonshot, Zhipu, Meta, xAI",
  small: "mid-size and small-model labs, plus the small models the frontier labs ship",
};

const maps = loadMaps();
const run = CHECKS.filter((c) => c.tiers.includes(tier))
  .filter((c) => !only.length || only.includes(c.key));
const parts = [];
const blockedChecks = [];
let total = 0, unreachable = 0;

for (const c of run) {
  process.stderr.write(`· ${c.key}\n`);
  let r;
  try {
    r = await c.fn(maps);
  } catch (e) {
    parts.push(`### ${c.title}\n\nCheck failed to run: \`${String(e.message || e)}\`\n`);
    continue;
  }
  // A blocked run is reported loudly but is not a finding: the data is fine, the
  // runner could not see it. Treating the two the same is how a watcher gets muted.
  if (r.blocked) {
    blockedChecks.push(c.title);
    parts.push(`### ${c.title}\n\n**Could not check.** ${r.blocked}\n`);
    continue;
  }
  total += r.findings.length;
  unreachable += r.skipped;
  const note = r.skipped
    ? `${c.empty}\n\n_${r.skipped} target(s) were unreachable and not checked._`
    : c.empty;
  parts.push(section(c.title, r.findings, { emptyNote: note }));
  parts.push(`<sub>${r.checked} checked, ${r.skipped} unreachable.</sub>\n`);
}

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const report = [
  `Automated source check — ${stamp} UTC`,
  ``,
  `Scope: **${tier}** — ${TIER_HEADER[tier]}.`,
  ``,
  blockedChecks.length
    ? `**${blockedChecks.length} check(s) could not run** — ${blockedChecks.join(", ")}. The requests were blocked wholesale, so nothing was judged from them.`
    : "",
  total
    ? `**${total} item(s) need a look.** Nothing here has been changed automatically; this is a list of things to verify by hand against a primary source.`
    : blockedChecks.length
      ? `Of the checks that did run, everything is consistent.`
      : `Everything checked is consistent. No action needed.`,
  ``,
  ...parts,
  `---`,
  `<sub>Generated by \`scripts/watch/run.mjs --tier ${tier}\`. These checks only read; they never edit the atlas. Any change to model data still goes through a human-reviewed pull request, which is what keeps every field traceable to a source someone chose to trust.</sub>`,
].join("\n");

if (outFile) writeFileSync(outFile, report);
else console.log(report);

process.stderr.write(`\n${total} finding(s), ${unreachable} unreachable target(s)\n`);
process.exit(total > 0 ? 1 : 0);

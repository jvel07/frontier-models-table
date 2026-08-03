# The Model Atlas — working notes

A public reference for how frontier and small language models are actually built:
architecture, attention, positional encoding, tokenizer, training pipelines and data
curricula. Audience is LLM engineers and researchers who want to know what other labs
did before training their own. It is shared publicly, so accuracy matters more than
completeness.

- Live: https://jvel07.github.io/frontier-models-table/
- Repo: https://github.com/jvel07/frontier-models-table

## Do this for every change, without being asked

1. Make the change.
2. `npm run verify` — builds, serves, and drives a real browser over every suite.
3. Commit and push. The push deploys.
4. `npm run verify:live` once the Actions run finishes, to confirm production.
5. Report the live URL and what was actually checked.

Do not stop at "the build passed". Every real bug this project has hit compiled
perfectly: columns rendered against the wrong headers, an `attn` value that silently
lost its description, a borrowed training pipeline reported as the model's own
disclosure. The browser suites exist because the build cannot catch those.

## Environment

**Node 22 is required.** The default shell has Node 18, which cannot build this — it
fails on a `node:util` import with a confusing syntax error. `.nvmrc` pins 22, so:

```bash
nvm use && npm run verify
```

`gh` lives at `/opt/homebrew/bin`. Pushes occasionally hang on the credential
helper; retry with `git -c credential.helper='!gh auth git-credential' push`.

## Commands

| command | what it does |
| --- | --- |
| `npm run verify` | build + serve + all suites (the one to run) |
| `npm run verify:live` | same suites against the deployed site |
| `npm run build` | production build; `prebuild` refreshes the RSS changelog |
| `npm run preview` | serve `dist/` at :4173 |
| `npm run extract` | dump MODELS to `.verify/models.json` for the suites |
| `npm run watch` | read-only source checks (links, citations, config drift, new releases) |

The suites live in `scripts/verify/`: `maps` (structural, no browser), `columns`
(every cell against source data), `detail`, `compare`, `provenance`, `scroll`,
`attention` (every mechanism in use has a card, a figure and the right models),
`papers` (re-derives the paper/model pairing from the source maps and checks the
rendered rows against it, rather than trusting the page's own arithmetic),
`derived` (recomputes every metric independently, checks the export matches, and
proves the calculator refuses what it cannot derive).

## Keeping it current

`.github/workflows/watch-sources.yml` runs `scripts/watch/run.mjs` daily on a GitHub
runner and files what it finds in one reused issue. It runs there rather than in a
session on purpose: agent sandboxes are usually behind an egress policy that blocks
Hugging Face, arXiv and the labs' own sites, so a session cannot verify a single link
while a runner can.

The checks **only read**. Nothing automated edits model data, because the atlas is
worth citing precisely because a person decided each field was sourced. The division
is: CI has the network and finds what changed, a reviewer has the judgement and
decides what it means.

One failure mode is designed around explicitly. When requests fail *wholesale* — a
proxy, a WAF, rate limiting — the run reports "could not check" instead of emitting a
finding per target. The first version of this reported 122 live links as dead the
moment it ran behind a proxy, and a watcher that cries wolf gets muted.

## Data rules

These are the rules that keep the site trustworthy. They have each been violated at
least once and caused a real error.

- **Primary sources only.** Technical reports, model cards, and each model's own
  `config.json` on Hugging Face. The only things taken from elsewhere are the
  architecture diagrams (hot-linked from Sebastian Raschka's LLM Architecture
  Gallery, credited) and the Artificial Analysis intelligence index.
- **Never borrow someone's wording.** `node scripts/verify/maps.mjs` does not check
  this; the historical check was a fuzzy diff against the gallery's strings. Facts
  are fine, phrasing is not.
- **Omit rather than infer.** A missing field means no source stated it. Absence of
  `rope_theta` is not proof of NoPE — that claim needs a technical report.
- **Never present one model's figures as another's.** If a pipeline is inherited
  (Kimi K2.6 shows K2.5's), set `trainingSource` on the model. That switches the
  header to "inherited, not reported", shows a warning panel, and stops the
  comparison counting those tokens as disclosed. Two separate bugs came from
  skipping this.
- **Verify every citation.** Resolve arXiv ids against the arXiv API and check the
  title before adding. A citation pointing at the wrong paper is worse than none.
- **Derived is not sourced.** Anything computed lives in `metrics.js`, is namespaced
  under `derived` in the export, and is labelled on the page with its formula. Never
  let a computed number sit in a column that otherwise holds published facts.
- **Verify every link.** Hugging Face returns HTTP 401 with a 404 page body for some
  missing repos, so status codes alone lie — fetch and check `og:title`.

## Architecture

Single-page React + Vite, deployed to GitHub Pages by `.github/workflows/deploy.yml`
on push to main, plus a daily cron that refreshes the changelog.

- `src/FrontierModelsTable.jsx` — data (`MODELS`, `SPECS`, `REPORTS`, `HF_LINKS`,
  `DIAGRAMS`, `ATTENTION_INFO`, `POSITIONAL_PAPERS`), the table, and the shared
  style object `S`. Most things live here and it is exported for reuse.
- `src/CompareView.jsx` — side-by-side comparison of up to 4 models. Rows are
  discrete named axes so they can be diffed, and so a future feature can recombine
  them into a synthesised architecture.
- `src/AttentionView.jsx` — the attention menu (`#/attention`), explaining every
  mechanism in `MODELS` from the problem it solves. `EXPLAIN` is keyed by the exact
  `attn` string, like `ATTENTION_INFO`, so `attention.mjs` can prove no mechanism
  lost its explanation. Figures are inline SVG drawn here, not paper figures:
  those are their authors' work under their own licence and arXiv publishes no
  stable per-figure URL, so they cannot satisfy the verify-every-link rule.
  Citations are reused from `ATTENTION_INFO` rather than written fresh.
- `src/PapersView.jsx` — the bibliography (`#/papers`), one row per paper against the
  models that use its work. The pairing is *derived* from `REPORTS`, `ATTENTION_INFO`,
  `ARCH_PAPERS` and `positionalPapers()`, never hand-written, so a paper cannot drift
  out of sync with the models citing it. Grouped by URL, not label — the same work is
  cited under different labels in different maps.
- `src/metrics.js` — every *derived* number (training FLOPs, tokens/param, KV bytes,
  disclosure and openness scores). Nothing here is sourced; it is arithmetic over
  recorded fields, and every consumer must label it as derived and show the formula.
  It returns null rather than guessing, and never derives across a disclosure
  boundary — an inherited pipeline yields no token total, as everywhere else.
- `src/TrendsView.jsx` — the same data plotted against time (`#/trends`).
- `src/OpennessView.jsx` — two axes that are usually collapsed into one (`#/openness`):
  weight availability, scored against the NVIDIA-led "Open Weights and American AI
  Leadership" letter (24 July 2026) and its four verbs — download, inspect, modify,
  run — and documentation disclosure, twelve fields the atlas already had to source
  or leave blank. Keeping them apart is the entire point of the page.
- `src/ToolsView.jsx` — memory calculator, architecture synthesis and the data
  download (`#/tools`). The calculator refuses MLA and hybrid models rather than
  applying a formula that does not describe their cache.
- `scripts/export-data.mjs` — `prebuild` step emitting `public/data/{models,schema}.json`
  and `models.csv`. Derived fields sit under `derived` with their formulas, so nothing
  computed can be mistaken for something a lab published.
- `src/SiteNav.jsx` — the one nav bar (Atlas · Attention · Papers · Trends · Openness ·
  Tools) plus the theme
  toggle, on every page. It imports nothing from the pages that render it: the table
  renders it, so reaching back for `S` would be a module cycle, and the style objects
  are built at module scope where a cycle bites.
- `src/main.jsx` — hash routing (`#/compare/A|B`, `#/attention`, `#/papers`). Hash, not paths:
  GitHub Pages has no SPA rewrite, so a real path would 404 on reload or when
  someone pastes a link.
- `src/providerIcons.jsx` — provider marks, inlined at build time.
- `vite.config.js` — `base` must match the repo name or Pages serves a blank page.
  Override with `BASE=/ npm run build` for a root-served host.

`SPECS` is regenerated from Hugging Face `config.json` files rather than hand-written.
The lookup maps are keyed by exact model name, and `ATTENTION_INFO` by the exact
`attn` string — editing one without the other silently drops content, which is what
`maps.mjs` checks.

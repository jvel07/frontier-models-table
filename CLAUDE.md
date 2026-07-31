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

The suites live in `scripts/verify/`: `maps` (structural, no browser), `columns`
(every cell against source data), `detail`, `compare`, `provenance`, `scroll`.

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
- `src/main.jsx` — hash routing (`#/compare/A|B`). Hash, not paths: GitHub Pages has
  no SPA rewrite, so a real path would 404 on reload or when someone pastes a link.
- `src/providerIcons.jsx` — provider marks, inlined at build time.
- `vite.config.js` — `base` must match the repo name or Pages serves a blank page.
  Override with `BASE=/ npm run build` for a root-served host.

`SPECS` is regenerated from Hugging Face `config.json` files rather than hand-written.
The lookup maps are keyed by exact model name, and `ATTENTION_INFO` by the exact
`attn` string — editing one without the other silently drops content, which is what
`maps.mjs` checks.

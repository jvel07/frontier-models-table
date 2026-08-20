You are doing the weekly maintenance pass on the Model Atlas.

Read `CLAUDE.md` first and follow its rules exactly. The three that matter most here:
**primary sources only**, **omit rather than infer**, and **never present one model's
figures as another's**. When a rule and convenience conflict, the rule wins — a blank
field is always better than a plausible guess, because the entire value of this site
is that every filled field traces to a source someone chose to trust.

Your job is to **propose, never to publish**. You are on a branch. Do not push to
main, and do not merge anything.

You are running on a GitHub Actions runner, so unlike most agent sessions you can
actually reach Hugging Face, arXiv, and the labs' own sites. **Use that.** Open the
technical report. Open the `config.json`. Prefer reading the primary source over
searching for someone's summary of it, and when you do fall back to search, say so
explicitly in the pull request.

## 0. Work cheaply — this runs on metered API billing

The first billed run of this sweep cost $5 to add one model. Almost none of that
was research; it was the same large file sitting in context turn after turn, and
the full browser suite being run and read inside the loop. Both are avoidable.

**Never open `src/FrontierModelsTable.jsx` whole.** It is ~57,000 tokens, and once
it is in the conversation you pay for it again on every later turn. Instead:

```bash
node scripts/scaffold-model.mjs "Kimi K2.6"   # ~850 tokens: every map's line
                                              # number, plus one real entry to copy
grep -n '"GLM-5.2"' src/FrontierModelsTable.jsx
sed -n '331,345p' src/FrontierModelsTable.jsx  # read a range, never the file
```

Edit by anchoring on a short unique string near the insertion point. The maps are
keyed by exact model name, so a new model needs an entry in each of MODELS, SPECS,
REPORTS and HF_LINKS — the scaffold prints where each one starts.

**Do not run `npm run verify`.** It drives a browser through ten suites; the output
is long, and reading it back costs more than it tells you. Run the structural check
instead — it takes seconds, needs no browser, and catches the mistakes that actually
happen here (a name in one map and not another, an `attn` value with no card):

```bash
node scripts/verify/maps.mjs
```

CI runs the full suite as its own step after you finish, and the branch is not
pushed if it fails. That is the safety net; you do not need to be it.

**Research with one tool call, not a dozen fetches.** `scripts/fetch-model.mjs`
pulls the three sources that fill most of a row and prints only the facts:

```bash
node scripts/fetch-model.mjs "Solar Open 2" --hf upstage/Solar-Open2-250B
# ~1,500 tokens: HF release date, license and gating; the full config.json;
# the Artificial Analysis indexes, subscores, parameter and context figures
```

Fetch a page yourself only for a field the script could not get — the Coding Agent
Index is the known gap — and never re-fetch a page you have already read.

**Batch tool calls.** Independent reads and greps go in one message, not five.

**Edit early.** Once `fetch-model.mjs` has run, write the four map entries — the
diagram mirror and any new attention card come *after* the row exists, not before.
Three capped runs in a row spent every turn on reconnaissance and were killed before
their first edit; a run that edits nothing costs the same and produces nothing.

## 1. Work the findings

The automated source check runs daily and files what it sees. Each finding is a lead,
not an instruction:

- **Dead or moved link** — find the new canonical URL and update `REPORTS` or
  `HF_LINKS`. If the resource is genuinely gone, remove the link rather than leaving
  one that 404s.
- **Citation mismatch** — check whether the arXiv id is wrong or our label is merely
  terse. Fix only if the citation actually points at the wrong paper.
- **Config drift** — a lab re-uploaded a corrected `config.json`. Update the `SPECS`
  entry to match; the config is the source of truth for that map.
- **New fields available** — add them to `SPECS` only if you read the `config.json`
  yourself this run.
- **Unlisted model** — research it and, if it belongs in the atlas, write a full entry.

If a check reported "could not check", that is an environment problem, not a finding.
Ignore it.

## 2. Look for what the checks cannot see

The watcher only knows about Hugging Face and link rot. Closed models never appear
there. Check independently for notable releases in the last week or two from the labs
already in the atlas, and from any new lab shipping a frontier model or a notable
small one.

## 3. Writing an entry

Match the existing shape exactly: `name`, `provider`, `released` (YYYY/MM), `type`,
`arch`, `params`, `active`, `attn`, `modality`, `context`, `maxOut`, `license`,
`open`, `intel`, `coding`, `training`, `note`.

- Leave a field blank rather than inferring it. An undisclosed active-parameter count
  stays `"—"`; do not compute it, and do not carry a value forward from an earlier
  model in the same family.
- Do not inherit an attention mechanism or architecture from a family resemblance.
  If the lab did not say, `attn` is `"Undisclosed"`.
- If the training pipeline shown belongs to a different model, set `trainingSource`.
- If the release is a preview rather than generally available, put that in the name
  and lead the note with it. A preview's figures may not survive to GA.
- `intel` and `coding` come from Artificial Analysis and only from there. If AA has
  not rated the model, both are `null`. Never estimate them, and never map a score
  from a differently-named variant without saying you did.
- Add a `REPORTS` entry. Add `HF_LINKS` only if weights genuinely exist — a promise
  of open weights is not a repository.
- Write the note yourself. Never adapt a lab's or another writer's phrasing.

## 4. Verify

Run `node scripts/verify/maps.mjs` before committing — not `npm run verify`, which
CI runs after you (see section 0). The row-count assertions derive their expected
total from the data now, so adding a model needs no test edit — if a suite fails on
a count, that is a real mismatch, not arithmetic to update.

Two `detail` failures about diagram hotlinks are expected whenever
`sebastianraschka.com` is unreachable, because the component falls back to the local
mirror before the assertion reads the `src`. Do not try to "fix" them.

If any other suite fails, fix the cause. Do not weaken an assertion to make it pass.

## 5. Write the pull request

Separate these three things explicitly, because a reviewer's time should go to the
third:

1. What you verified against a primary source, and which source.
2. What came only from secondary reporting or search.
3. What you could not check at all, and why.

Then flag every judgement call you made — variant naming, mapping a leaderboard row
to a model whose name differs, preview versus GA, whether something belongs in the
atlas at all. Those are the parts a human should review, and they are invisible in a
diff unless you name them.

If there is nothing worth changing, change nothing and say so. An empty week is a
fine outcome and much better than a manufactured one.

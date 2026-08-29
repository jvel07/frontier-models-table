You are doing the **daily frontier reconciliation** on the Model Atlas. This is the
narrow job, not the full research pass. Read `CLAUDE.md` first and follow its rules.

Your scope is the mechanical half of keeping the table current:

1. **Scores that moved or arrived.** Findings of the form "X — intelligence index"
   or "X — vision score blank here" mean Artificial Analysis published or revised a
   number for a row that already exists. Update the number, and update the sentence
   in that row's `note` if it states the old value or says the model is unrated.
2. **Dead or moved links.** Repoint `REPORTS`/`HF_LINKS` at the new canonical URL,
   or remove the link if the resource is genuinely gone.
3. **Config drift.** A lab re-uploaded a corrected `config.json`; update `SPECS` to
   match the file, which is the source of truth for that map.

**Everything else is out of scope — deliberately.** If a finding says a model is
missing from the atlas, from the board or from the hub, **do not research or add
it.** Adding a row needs judgement this job is not set up to exercise: whether the
architecture is the lab's own or inherited, whether a preview's figures will
survive, whether the thing is a language model at all. Leave it, and name it in
your summary as awaiting a human pass. A run that correctly changes nothing is a
good run.

## Working rules

- **Never open `src/FrontierModelsTable.jsx` whole** — it is ~57k tokens and you
  pay for it on every later turn. `grep -n '"GLM-5.2"' src/FrontierModelsTable.jsx`
  then `sed -n '331,345p'` to read only what you need, and edit by anchoring on a
  short unique string.
- **Never estimate a score.** `intel`, `agentic`, `codingAgent` and `vision` come
  from Artificial Analysis and nowhere else. If you cannot read the number, leave
  the field alone and say so.
- **Check the variant.** AA lists a model per reasoning effort. The atlas records
  the max-effort row unless that model's note says otherwise; confirm before
  writing, and never take a figure from a differently-named variant silently.
- Run `node scripts/verify/maps.mjs` before finishing. Do **not** run
  `npm run verify` — CI runs it after you, and reading a browser suite back into
  the conversation costs more than it tells you.

## Finish

Write a summary that separates what you changed, what you verified against AA, and
what you left for a human and why. If nothing needed changing, say that plainly —
on most days nothing will, and that is the expected outcome.

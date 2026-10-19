# Scenario bank (F11)

`scenario-bank.mjs` validates and serves reviewed exercises; `scenario-content/` holds content.

- Six families: trend pullback, breakout/retest, range rejection, failed breakout, volatile/unclear, no trade. They are situations to reason about, not patterns that work.
- Each scenario carries an id, integer version, provenance, data rights, `visibleBars`, `decisionBoundary` (last visible bar), private `outcomeBars`, an outcome label (win/loss/ambiguous/none), difficulty, learning objective and teaching notes.
- Publication: a reviewer who is not the author records an approval in `reviews.json` (`id@version` -> `recordReview(...)`). The approval stores a content hash, so any edit needs a new version and a new review. Nothing in the repo is approved yet.
- `publicView` is all a learner sees before committing; `revealView` is for after commitment only.
- Outcome data never goes in `public/` or `dist/`. Real licensed scenarios belong in a private directory set by `WICKLUME_SCENARIO_DIR`. The shipped samples are synthetic.

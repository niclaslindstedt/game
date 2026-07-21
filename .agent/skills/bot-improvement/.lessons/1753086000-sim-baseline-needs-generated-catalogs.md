---
title: Capture the sim A/B baseline AFTER `npm run levels`, and stash-pop for a true before/after
date: 2026-07-21
---

Two workflow traps from A/B-measuring a bot change with `scripts/simulate-run.mjs`:

- **A fresh clone can't simulate.** `src/generated/` (levels, enemies,
  botTuning) is gitignored and only exists after `npm run levels` / `make
  assets`. A baseline batch launched before that dies with
  `ERR_MODULE_NOT_FOUND: src/generated/botTuning.ts` and writes NO `--json`
  output — and if it ran in the background, the failure is easy to miss until
  the "baseline" files turn out not to exist. Generate first, then measure.

- **Baseline means the ORIGINAL code.** Once edits are in the working tree,
  capture the before-side with `git stash push src/game/bot.ts ...` → run the
  baseline seeds → `git stash pop`. The generated catalogs don't need
  regenerating for a stash of bot code alone (bot.yaml untouched), so the
  round-trip is cheap. Compare with identical flags (same `--max-minutes`,
  same seeds) per the earlier lesson.

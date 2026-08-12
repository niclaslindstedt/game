---
title: A carved venue rolls a new floor plan every run — pass `--seed` or each probe judges a different map
date: 2026-08-12
scope: pwa/scripts/playtest.mjs
concepts: [seeds, determinism, screenshots, staging, probes]
---

Every mission's geometry is carved per run (`runLevelDef`), so two `playtest.mjs`
runs of the same level are two different car parks, corridors and door
positions. Without `--seed` the app rolls one, which turns "I ran it again and
the beat did not happen" into noise: a hand-rolled Playwright probe of GOODCO
caught a clean drive-in on one run and an empty lot on the next, and the
difference was the seed, not the change.

So: pass `--seed` when comparing before/after or chasing a report, and when the
question is "does this hold at all", do not answer it from the browser — sweep
the seeds headlessly (`createGame(seed, level)` in a `node` script via
`scripts/game-alias-loader.mjs`, ~3 s a seed) and use the browser only to LOOK
at one the sweep already proved interesting. A twelve-seed sample can also lie:
one here read 12/12 fixed while a sixty-seed sweep found the real rate was
54/60, plus two seeds with no plan at all.

(A probe script kept outside the repo cannot resolve `playwright` — symlink
`node_modules` into the scratchpad dir, or keep the probe under the repo root.)

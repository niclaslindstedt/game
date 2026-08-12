---
title: A scratch Playwright probe must live IN the repo, and stage its subject with `?scenario=`
date: 2026-08-12
scope: pwa/scripts/
concepts: [playwright, screenshots, staging, scenario, transient-fx]
---

Two things cost a round trip each when writing a one-off probe beside
`playtest.mjs`:

**Put the file in the repo root, not in a scratch directory.** Node resolves
`import { chromium } from "playwright"` against the SCRIPT's own directory
chain, so a probe under `/tmp` dies with `ERR_MODULE_NOT_FOUND` before it opens
a browser. Write it as `<repo>/probe.tmp.mjs` and delete it after.

**Do not wait for the beat to happen on its own.** A run left to the bot took
90 s and never produced the moment; `?scenario=` staged it on the first tick:

    ?debug&level=goodco_hq&scenario={"place":"boss","reveal":true,
      "muteDialogue":true,"clearEnemies":true,
      "spawns":[{"enemy":"intern","count":10,"distance":70},
                {"enemy":"volunteer","count":1,"distance":95}]}

`muteDialogue` is not optional there — a staged mob opens its arrival scene on
the first tick and parks the run in `dialogue`, which freezes every effect you
came to look at. The scenario still needs the full `playtest.mjs` menu walk
(new-game → name → CREATE → difficulty → level) before `window.__game` exists.

Then use the freeze-frame watcher (see the transient-frame lesson):
`page.waitForFunction(fn, null, { timeout, polling })` — the ARG SHAPE is
(fn, arg, options), and passing options second silently keeps the 30 s default.

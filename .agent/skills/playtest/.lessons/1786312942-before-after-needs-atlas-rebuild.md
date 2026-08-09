---
title: A before/after screenshot pass over an ART change must rebuild the atlas between the two runs
date: 2026-08-09
scope: content/sprites/, pwa/src/game/assets/
concepts: [playwright, probes, screenshots, assets]
---

Stashing a change and re-shooting is the honest way to show a visual fix, but
`pwa/src/game/assets/atlas.png` is a gitignored BUILD OUTPUT — `git stash` does
not touch it, so the "before" run renders the NEW sprites against the old code
and the comparison is worthless in a way nothing warns about.

    git stash push -m before -- <the tracked files>
    npm run assets            # <- the step that is easy to miss
    node <shoot>.mjs
    git stash pop
    npm run assets

Two environment notes for the same pass, both of which cost a retry here: the
Chromium the docs point at is `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
(the unversioned `chromium/` directory in that folder is not the binary), and a
scratchpad script that imports `sharp` has to RUN from the repo root or Node
cannot resolve it — pass an absolute path to `node` from the repo directory
rather than cd-ing to the scratchpad.

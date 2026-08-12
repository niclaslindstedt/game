---
title: `--only` on the gallery capture SKIPS an id it does not recognise, silently — count the rows in the sheet
date: 2026-08-12
scope: pwa/scripts/effects-gallery.mjs
concepts: [effects-gallery, tooling, review-loop, silent-failure]
---

`node scripts/effects-gallery.mjs --only a,b,c` (and `make gallery ARGS=...`)
does not fail on an id no exhibit wears — it captures the ones it matched and
says nothing about the rest. A three-id request that returns a two-row
`sheet.png` is the only signal you get, and at ~20 s per exhibit it is easy to
read the sheet, judge the two effects, and never notice the third was never
staged.

Count the rows against the ids you asked for. The ids are the catalog's own
(`pwa/src/game/effects-gallery/effects-catalog.ts` — `grep '^    id: "'`), and
they are frequently not what the exhibit's LABEL says: the shelf reading
"OPENED UP" is not `opened-up`.

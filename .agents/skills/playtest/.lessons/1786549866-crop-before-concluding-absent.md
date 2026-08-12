---
title: A detail missing from an 844×390 screenshot is NOT proof it is missing — crop and zoom before concluding
date: 2026-08-12
scope: pwa/scripts/playtest.mjs, pwa/src/game/render/
concepts: [playwright, screenshots, measurement, staging, rendering]
---

The harness shoots the phone-landscape viewport, and at that size a 12×10 px
mark is a dozen pixels that a level's own title text, a HUD chip or a bright
tile happily swallows. This pass read a full-frame shot of the hero standing
inside `CAR.boardRadius`, saw no boardable arrow over the roof, and spent the
next several minutes hunting for why the mark was not drawn — it was drawn, and
sitting behind the word GARAGE.

**Before concluding a detail is absent, shoot it again cropped and zoomed.**
Open the page with `deviceScaleFactor: 4` and pass `clip` to `page.screenshot`
around the thing itself (~200×130 CSS px is a comfortable window on one
machine or one body). The layout judgements the skill demands still happen at
1× on the whole frame; a crop is for asking IS THIS PIXEL THERE, which the
whole frame cannot answer. It is also the only way to see what a change did to
a gradient or a lamp — the before/after of a thrown light cone is unreadable at
1× and unmistakable at 4×.

And the probe script has to live INSIDE the repo (repo root is fine, delete it
after): `playwright` is a devDependency here, so a hand-rolled probe left in a
scratch directory dies on `ERR_MODULE_NOT_FOUND` before it opens a browser.

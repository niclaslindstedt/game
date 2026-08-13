---
title: A character the pixel font lacks renders as "?", not as a gap — check every hardcoded drawn string against the glyph set
date: 2026-08-13
scope: pwa/src/
concepts: [fonts, readability, overlays, dialogue]
---

`PixelText` draws from a fixed glyph set (`scripts/asset-tools/font.mjs` →
`GLYPHS`; the HUD's own font is a smaller 44-glyph set). An unknown character
does not go missing: `glyphFor` (`pwa/src/lib/pixel-font.ts`) falls back to
`?`. So a wrong character does not look broken — it looks like PUNCTUATION,
which is why it survives review.

`>` and `<` were absent for a long time and shipped three times: two question
marks either side of the screenshot gallery's picture, one on the high-score
row, and one as the selection cursor in every conversation — where
`> I'M GOING AFTER HER.` read as `? I'M GOING AFTER HER.` and made the answer
unintelligible. They are in the font now; the trap is not.

Content strings are already guarded (`unwritableChars` /`glyphProblem` in
`scripts/asset-tools/glyphs.mjs`, which the catalog schemas call). **Hardcoded
strings in components are not.** When you add drawn copy with any character
outside `A-Z 0-9 . , : ; ! ? ' " - / ( ) + = & % $`, check it:

```sh
node -e "import('./scripts/asset-tools/font.mjs').then(m=>console.log(Object.keys(m.GLYPHS).join('')))"
```

Either use a glyph the font has, or author the missing one in `GLYPHS` (3×5 or
5×5 rows of `#`/`.`) and re-run `make assets` — which also refreshes
`mod/catalog.json`'s `glyphs` string, committed and drift-tested, so
`make mod-catalog` belongs in the same commit.

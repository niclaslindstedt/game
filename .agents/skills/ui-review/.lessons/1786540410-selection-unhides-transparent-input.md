---
title: A `color: transparent` overlay input becomes VISIBLE the moment its text is selected — `::selection` is the fix
date: 2026-08-12
scope: pwa/src/styles.css, pwa/src/game/drive-screen/DriveScores.tsx, pwa/src/lib/
concepts: [css-cascade, overlays, verification, inputs]
---

Several fields in this app are a real `<input>` stretched over pixel glyphs
that draw its value (`.pixel-input-field`, `.drive-name-input`), hidden with
`color: transparent` + `caret-color: transparent`. That hides the text only
while nothing is SELECTED: a selection is painted with the user agent's own
selection colours, foreground included, which beats the element's `color`. The
drive's high-score entry does `inputRef.current?.select()` on a fine pointer,
so on every desktop build the field's 16px value came up in the highlight's ink
on top of the pixel letters — reported as "AAA in big letters with a smaller
AAA in front of them".

The fix is a `::selection` rule per field with `background`, `color` AND
`-webkit-text-fill-color` all transparent — three properties because Blink
keeps the element's own `color` as soon as any `::selection` rule matches while
WebKit (the Tauri shell's renderer on macOS and Linux) paints through
`-webkit-text-fill-color`. `tests/invisible_input_test.ts` now pins the pair for
every rule carrying the invisible-field signature.

The review lesson: a screenshot audit that never focuses a field cannot see
this. When a surface has a text box, capture it FOCUSED and with its value
selected, not just at rest.

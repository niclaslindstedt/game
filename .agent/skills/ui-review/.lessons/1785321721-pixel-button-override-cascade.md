---
title: A single-class override of a single-class base only works BELOW it in styles.css
date: 2026-08-01
---

Three separate sweeps have now lost time to the same cause: `styles.css` is one
huge file, most of its selectors are a single class, and a single class TIES a
single class on specificity — so the cascade falls to **document order**. An
override declared above the rule it means to beat does nothing at all, silently:
no linter warning, no console error, and the surface still looks plausible
because it keeps the base value.

Three instances, all found by MEASURING rather than by looking:

- `.pixel-button` sets `padding: 0.75rem 1.5rem`; a modifier (`.defeat-retry`,
  `.defeat-quit`, …) declared earlier kept the base padding. A button meant to
  be visibly bigger came out 44px tall — exactly `5px glyph × 4 scale + 12px × 2`,
  i.e. the base.
- `.inv-bag-grid` re-states the columns, the gap and the height cap that
  `.inv-grid` sets. `.inv-grid` is overridden **inside a landscape `@media`
  block**, and a media query adds NO specificity — so a top-level
  `.inv-bag-grid` written above that block loses on the reference viewport
  while working fine in portrait. That asymmetry is the tell.
- `.inv-readout canvas` (centring an icon against its number) has to beat the
  blanket `.game-overlay canvas { align-self: flex-start }`. Both are (0,1,1).
  The purse had a one-off `.inv-purse canvas` override sitting correctly below
  it; the ammunition sockets, added later and higher up, silently top-pinned
  their numbers ~4px above their own icons.

Two habits fix it. Put an override next to the rule it overrides, or below it
with a comment saying it MUST stay there and why — the next reader will
otherwise "tidy" it back up beside its siblings. And when an override "seems
not to be doing much", measure the box in the screenshot against the base value
before touching the numbers; the failure mode is a value that never applied,
not a value that is wrong.

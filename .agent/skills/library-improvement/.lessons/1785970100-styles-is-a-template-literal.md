---
title: The library stylesheet is a JS template literal — a backtick in a CSS comment breaks the build
date: 2026-07-30
---

`pwa/scripts/library/styles.mjs` returns the whole stylesheet from one
backticked template literal, so the CSS inside it is JavaScript source. Writing
a comment in this repo's usual register — quoting an identifier in backticks,
the way every other comment in the tree does — closes the literal, and the
failure is a `SyntaxError: Unexpected identifier` pointing at the middle of a
prose sentence rather than anything about CSS. Quote identifiers with `'` inside
that file, and remember `${...}` is live too: a CSS rule wanting a literal
dollar-brace would have to escape it.

Two other things worth knowing before touching that file's header rules:

- **The header is STICKY, so a row of chrome is a row off every screenful**, not
  just off the top of the page. That is what makes a wrapped nav expensive
  enough to be worth a burger, and it is invisible in a screenshot of the top of
  the page — you have to think about the reader four screens down.
- **The breakpoint is measurable, not a matter of taste.** Drive the built page
  at a spread of widths and read `.site-head`'s own height plus how many rows
  the nav's links occupy; the width where those settle is where the nav stops
  fitting (~915 px for six names beside the brand today). Pick the breakpoint
  from that, then delete whatever older media query the new one has just made
  dead — a rule whose whole band now sits inside a later query is not harmless,
  it is a lie about how the layout works.

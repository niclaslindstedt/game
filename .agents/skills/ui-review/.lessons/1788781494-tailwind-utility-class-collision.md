---
title: A one-word CSS class silently inherits a Tailwind utility — `.fixed` took a row out of flow with no rule in styles.css to find
date: 2026-09-07
scope: pwa/src/styles.css, pwa/src/game/
concepts: [css-cascade, class-names, tailwind, debugging, layout, overlays]
---

`styles.css` opens with `@import "tailwindcss"`, so Tailwind v4's whole utility
layer is live alongside the hand-written sheet. A modifier class named after a
CSS keyword picks that utility up: a `<button className="companion-worn-row
fixed">` got `position: fixed`, left the flow, and painted over the two rows
under it — while grep for `.fixed` in every `.css` file in the repo found
nothing, because the rule is in the imported bundle, not in the tree.

Two things follow. **Check a new single-word modifier before using it** —
`fixed`, `hidden`, `block`, `static`, `visible`, `grid`, `flex`, `absolute`,
`sticky`, `container` are all utilities. Prefer a two-word modifier
(`swap-only`); the existing bare ones in this sheet (`locked`, `broken`,
`usable`, `empty`, `sold-out`, `upgrade`) happen to be safe.

**And when a box is positioned by nothing you can find, measure it rather than
grepping.** `getBoundingClientRect` plus `getComputedStyle` over the panel's
children named it in one run:

```js
document.querySelectorAll(sel).forEach((el) => {
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  console.log(`${r.y} h=${r.height} pos=${cs.position} shrink=${cs.flexShrink}`);
});
```

Walking `document.styleSheets` for the matching rule does NOT work here: the
sheet is served cross-origin from the dev server, `sheet.cssRules` throws, and
the walk silently reports zero matches. Probe a class's effect instead — append
a bare `<div class="name">` to the live page and read its computed style.

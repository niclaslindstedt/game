---
title: A visible button can be pointer-dead — verify with elementFromPoint, not the render
date: 2026-08-01
scope: pwa/src/
concepts: [pointer-events, verification, buttons]
---

The shop's floating deal card (`.item-tooltip.shop-deal-card`) shipped with
BUY/SELL buttons that looked perfect and received no clicks at all: the card
opted back into `pointer-events: auto` under a bare `.shop-deal-card` selector,
but `.item-tooltip { pointer-events: none }` sits LATER in styles.css at the
same one-class specificity, so the opt-in silently lost the cascade. Every
press fell through the painted-on-top card to the panel underneath, where it
read as a miss and dismissed the card — which made the bug look like a flaky
dismiss rather than a dead button.

Two takeaways:

- When a class re-enables something a shared base class disables
  (`pointer-events`, `visibility`, `display`), write the override as the
  COMPOUND selector (`.item-tooltip.shop-deal-card`) so it outranks the base
  regardless of file order. A same-specificity override is a merge conflict
  waiting for someone to reorder the stylesheet.
- A screenshot proves paint order, not hit order. When auditing an
  interactive surface, drive one real click through it and assert the effect
  (coins moved, panel changed) — or probe `document.elementFromPoint` at the
  button's center. Playwright's "element intercepts pointer events" retry
  log names the actual receiver, which is the fastest diagnosis.

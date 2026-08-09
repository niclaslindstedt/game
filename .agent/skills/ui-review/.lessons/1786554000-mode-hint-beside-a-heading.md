---
title: A small hint beside a big heading needs BOTH `align-items: center` and its own canvas override
date: 2026-08-09
scope: pwa/src/styles.css
concepts: [css-cascade, overrides, headings, alignment, canvas]
---

The shop's `YOUR BAG` heading (scale 3) carries a trailing mode hint at scale 2
— `TAP A FIND TO IDENTIFY`, `TAP TO PICK - HOLD TO READ`. Setting the row to
`align-items: center` did **nothing**: PixelText renders a `<canvas>`, and
`.game-overlay canvas { align-self: flex-start }` (styles.css ~10117) applies to
every canvas inside any overlay. `align-self` on the child always beats
`align-items` on the container, so the hint stayed top-pinned against a heading
half again its height and read as a caption that had fallen over.

The fix is the pair, and both halves are needed:

```css
.shop-section-heading { align-items: center; }
.shop-panel .shop-section-heading canvas { align-self: center; }
```

The second selector needs the EXTRA class. `.shop-section-heading canvas` is
(0,1,1) — a tie with `.game-overlay canvas` — and the shop's block sits ~2000
lines ABOVE it, so document order hands the blanket rule the win (this is the
same trap `pixel-button-override-cascade` describes, met from the alignment
side). `.map-box .map-header canvas` and `.map-legend-item canvas` are the two
existing precedents; copy their shape rather than rediscovering it.

The tell in a screenshot: the small text's TOP edge lines up exactly with the
big text's top edge. Baseline alignment and centring both look wrong in their own
way, but a flush top is the signature of the blanket rule winning.

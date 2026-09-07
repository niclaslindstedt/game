---
title: A touch gesture is only proved by CDP `Input.dispatchTouchEvent`, started on the CELL a thumb would hit
date: 2026-09-07
scope: pwa/src/styles.css, pwa/scripts/ui-shots.mjs
concepts: [touch, scroll, verification, screenshots, mobile]
---

`ui-shots.mjs` captures pictures, and a picture cannot tell you whether a
scroll box answers a finger. Neither can `page.mouse` (it never consults
`touch-action`) or `page.touchscreen.tap` (no drag). The one thing that
proves it is a CDP session driving the gesture by hand:

```js
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
for (let i = 1; i <= 12; i++)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 10 }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
```

…then read `scrollTop` on the box. Two things decide whether the measurement
means anything. Start the drag at the CENTRE OF A CELL, not on the grid's
padding or the gap between cells: a bag whose cells set `touch-action: none`
still scrolls from those slivers, which reported a working scroller over a
grid no thumb could move. And build the context with `hasTouch: true`.

The same run is where to read the numbers a screenshot only hints at — the
box's `scrollHeight - clientHeight` (how much is hidden), the panel's own
overflow, and whether the foot rail's button is inside `window.innerHeight`.
Those three caught a footer sitting off the bottom of both tablet portraits
that every previous look at the screenshots had missed.

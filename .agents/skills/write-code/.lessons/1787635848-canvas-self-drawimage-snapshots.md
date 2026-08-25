---
title: A drawImage whose source is its own destination canvas snapshots the WHOLE canvas first — never self-sample per sliver
date: 2026-08-25
scope: pwa/src/
concepts: [rendering, canvas, performance, minigame]
---

`ctx.drawImage(ctx.canvas, …)` forces the browser (iOS Safari worst of all)
to snapshot the entire canvas before reading, however small the source rect.
A distortion effect that self-sampled one sliver per row — the rocket's heat
shimmer, ~30 rows a frame — cost ~30 full-frame copies a frame and read as
single-digit fps on a phone while every individual call looked cheap. The fix
is one copy: blit the affected region ONCE into a module-cached, grow-only
scratch canvas (`globalCompositeOperation = "copy"` skips the clear), then
draw every sliver from the scratch — which is also pristine by construction,
so ordering rules about not re-sampling moved rows dissolve. Measured with
Playwright + CDP `Emulation.setCPUThrottlingRate` on the `?rocket&bot=1&launch=0`
workbench: 3.7 → 22 fps at 4× throttle from this family of fixes.

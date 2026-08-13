---
title: SFW re-hues art but cannot re-hue FIRE — replace it with particles, and tune the replacement against the original side by side in the gallery
date: 2026-08-13
scope: pwa/src/game/drive-screen/
concepts: [sfw, fire, particles, additive-glow, tuning, review-loop, stardust]
---

SFW's whole method is `recolorSprite` onto `FAIRY_RAMP` — the panels, the road
marks, the pieces. It reaches every effect on the road except the two made of
FLAME, because the flame ladder is authored art with a flame's silhouette in it
and a yellow flame is still a flame. So a burn and a blast are REPLACED
(`star-fire.ts`, kinds `starfire`/`starblast`), and the replacement is
primitives for the same reason `drawStardust` is: hundreds of grains where the
mass is the picture, and any gold at any size for free.

Three tuning traps, all found by capturing the SFW card and the shipped card at
the SAME `--at` offsets and reading them side by side — the only honest way to
size a replacement:

- **The burn OUTLIVES its collision.** It is re-issued on a cadence for the rest
  of the leg, so a thin sprinkle is not one dim frame, it is the wreck reading as
  a render bug for a minute. The first cut (5–15 grains, r≈1–3, alpha fading from
  birth) was invisible beside the flame; 9–26, r≈1.8–4.4, and alpha HELD then
  dropped (`min(1,(1-life)*2.2)`) matches it.
- **The `lift` a burn is issued with is the flame sprite's FOOT.** Both draws get
  the same 9 px, and the flame then occupies its whole sprite height above it —
  so a fountain starting at the lift pours out from under the sills while the
  flame sits on the bodywork. Add the sprite's body back.
- **Particles replacing a glow effect light nothing.** The flame is mostly glow
  drawn `lighter`, so a car alight visibly lifts the tarmac; hard little stars do
  not. A low-alpha additive halo (three flat discs, never a per-frame
  `CanvasGradient`) is what buys that back.

Keep the replacement's palette OFF the fairy ramp — a glance has to tell a
fizzing wreck from the lilac cloud a person leaves.

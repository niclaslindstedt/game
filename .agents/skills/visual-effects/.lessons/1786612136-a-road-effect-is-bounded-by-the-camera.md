---
title: A road effect is bounded by the CAMERA and deduped by TIME — one crash books five events across several ticks
date: 2026-08-13
scope: pwa/src/game/drive-screen/loop.ts, pwa/src/game/render/
concepts: [drive, camera, particles, effects-clock, collision, dedupe]
---

Two things bite any effect raised per collision on the DRIVE, and both were
paid for on the SFW fairy dust.

**Duration is set by how long the impact stays on screen, not by taste.** The
camera rides the car, so at road speed a cloud living much past ~800 ms finishes
somewhere behind the frame and is never seen — the player reads it as "the
effect barely showed" and asks for MORE, when the fix is SHORTER and faster.
`FAIRY_LIFE_MS` / `FAIRY_PUFF_MS` in `drive-screen/loop.ts` are that budget.

**One crash is not one event.** A single rear-ender books `trafficHit`,
`trafficBent`, `glassSmashed`, `partShed`, `wheelTorn`, `endSmashed` and
`trafficWrecked` — some on the same tick, the rest over the next few as the
wreck settles. An effect raised on each of them stacks five clouds on one
bumper, and a per-TICK dedupe (a `Set` of rounded cells built inside the event
loop) catches only the first pile. Dedupe in MILLISECONDS against the live
burst list instead — it is already in hand, so no second structure has to be
kept in step with it:

```ts
bursts.some((b) => drive.ms - b.bornMs < GAP_MS && near(b, pos))
```

Judge the result with `make gallery ARGS="--only <exhibit> --at 620,700,780"`;
`--strip N` silently overrides `--at`, so pass one or the other.

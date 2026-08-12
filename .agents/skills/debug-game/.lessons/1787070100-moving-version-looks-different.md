---
title: A thing that looks DIFFERENT while it moves is a layer-membership bug — the moving copy is drawn above the full-frame washes the resting one sits under
date: 2026-08-12
scope: pwa/src/game/render/
concepts: [rendering, layers, night, lighting, symptom-far-from-cause]
---

Symptom class: a piece of the world wears one colour at rest and another the
moment it animates — reported as "the garage door has different colours when
closed and when opening". Nothing is wrong with the art, the sprite is the same
sprite, and the animation's own geometry is right.

Mechanism: the resting copy is furniture, drawn inside `drawFrame`; the moving
copy is an EFFECT, and `drawEffects` runs after `drawFrame` returns. Everything
`drawFrame` paints on the way out is a full-frame wash the effect layer is
therefore ABOVE — `drawNight`'s sheet and the lamp holes cut in it, `drawFog`,
the death clouds. So the moving copy shows the raw art while its surroundings
show lit art, and the two disagree by exactly one lighting pass.

Triage shortcut: ask which pass draws the STILL version and which draws the
MOVING one, and list what is painted between them. Two symptoms travel
together and confirm it without pixel forensics — the moving copy also draws
OVER the hero, because the bodies are inside `drawFrame` too.

The fix is membership, not colour: `drawnUnderActors` (render/effects.ts) picks
which half of the effect layer an effect is in, and the in-frame half
(`drawUnderActors`, called from `drawFrame`) is already screen-space with the
same billboarded anchors — so moving an effect into it changes no geometry at
all. Do not reach for re-tinting the effect; that is a second copy of the
lighting model that will drift.

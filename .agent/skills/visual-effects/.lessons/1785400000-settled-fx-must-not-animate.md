---
title: A PERSISTENT effect must hold still — motion on it reads as the material misbehaving
date: 2026-07-29
---

Transient FX earn their motion: they exist for a third of a second and the
motion IS the effect. A persistent one (blood on the floor, scorch, frost, oil)
has the opposite job — it is the RECORD of something that already happened, and
the player reads it while walking over it for the rest of the level.

The blood floor shipped with a wet specular glint: three authored highlight
frames walked on the render clock, each cell on its own phase so the highlights
travelled and twinkled out of step. It was faint, additive, and physically
motivated (standing blood catches light). It still had to be cut, because on a
dark red mass a travelling highlight does not read as WET — it reads as
BUBBLING, like the floor is simmering. Nobody believes a floor that simmers.

The rule that came out of it: **decide whether an effect is an event or a
record, and give only the event a clock.** If it is a record, its draw should
not even take `timeMs` — that parameter is the temptation. Sell "wet" with
VALUE instead: a darker, glossier core colour, a lighter rim, more contrast
between the soaked and stained rungs. Static contrast reads as a material; motion
reads as a state change, and a stain is not changing state.

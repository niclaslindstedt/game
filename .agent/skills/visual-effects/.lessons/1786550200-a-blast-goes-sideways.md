---
title: A rocket's ground blast runs SIDEWAYS, three times wider than tall — a mushroom reads as a bomb
date: 2026-08-09
scope: pwa/src/game/render/rocket-exhaust.ts
concepts: [smoke, fire, launch, proportion]
---

Every early cut of the launch cutscene's pad cloud mushroomed — spread ~0.35 of
the plume's reach each way and rose ~0.55 of it — and read as an explosion under
the ship rather than as a launch. The reference (any pad photo) is the opposite
proportion: the column hits flat ground, has nowhere to go but out, and the
cloud ends up several times wider than it is tall with the hull rising out of
the middle of it.

What fixed it: sprawl 1.15× the plume's whole reach to EACH side, rise only
0.07–0.47 of it, and a per-puff `loft` hash that trades the two off (the ones
hugging the ground go furthest out, the few that climb stack up the middle and
close the two lobes into one mass). Puff count had to go up with the width — 26
billows that filled a narrow cloud left a wide one gappy; 44 filled it.

Also: the plume's own LENGTH must be the room under the bells, not a constant.
A full-length plume drawn while the ship is still on its mark runs down through
the tarmac, and the shot reads as a rocket parked in a bonfire.

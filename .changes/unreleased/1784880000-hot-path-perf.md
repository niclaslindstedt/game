---
type: Changed
title: Smoother horde-scale combat
---

Cut per-tick and per-frame hot-path costs at horde scale: derived hero stats,
armor, crits, and procs are memoized on the loadout instead of re-walking the
gear per blow and per mob; stasis slows resolve once per tick; line-of-sight
sweeps walk only the grid cells on the sightline; orbit orbs, homing shots,
chain lightning, and the autopilot's aim pick no longer scan the whole horde.

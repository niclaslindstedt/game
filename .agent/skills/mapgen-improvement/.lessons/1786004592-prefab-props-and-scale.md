---
title: Prefab props obey no clearance rule, and props need sizing against a body
date: 2026-08-06
scope: content/maps/
concepts: [prefabs, props, clearance, scale]
---

Two things a static room (`prefabs`) gets wrong that the scatter cannot:

**Its props are authored offsets, so nothing holds them off the walls.** A prefab
is guillotined into a district's CORNER, which means at least two of its edges
are somebody's wall — and `buildPrefabProps` places exactly where the YAML says.
A lamp standard 20 px from the room's edge is a lamp standard inside the wall,
and `goodco_test`'s furniture-clearance check caught it as "crowded". Hold solid
pieces ~48 px plus their own radius off every edge; the schema now warns.

**And the scale is the author's problem too.** The first `parked_car` was 24×14 —
which next to a 16 px intern reads as a bench, not a car. Calibrate against a
BODY: the hero is 20 world px across, so a car is ~44 and a person door is ~64.
The same yardstick settles door widths (56 cupboard → 220 hangar) and bay
spacing. A prop sized off nothing but its own drawing looks like a model of
itself.

Also: `propLines` now carries two different things — a RANK (a run the carve
walked) and a prefab's fixed prop (`from === to`, one prop). Any test that
assumed every prop line is a run needs splitting on that.

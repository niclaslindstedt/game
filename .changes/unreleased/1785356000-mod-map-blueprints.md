---
type: Added
title: Mods can carve their own maps
---

A mod can now ship a **map blueprint** (`maps/<id>.yaml`) beside its level, so
its venue is carved fresh from the run's own seed under GENERATED MAPS instead
of always playing the layout it was drawn with — the boss has to be found, and
the fog-of-war minimap is the only record of where you have been. Authored in
the same format the shipped venues use, with the same schema and the same ramp
ladder; the worked example (`mod/examples/greenhouse`) now includes one.

---
type: Changed
title: A longer, Diablo-style grind — per-tier slowdown and an endgame wall
---

Reworked leveling so each difficulty tier is a level ceiling the hero lands under, not a target, and the deeper tiers take longer and longer. A full clear (no deaths) now leaves the hero around 33/35/36 on the easy/medium/hard lanes, ~51 after nightmare, and ~69 after jesus — each under that tier's XP cap (40 / 58 / 70). Two new, runtime-tunable knobs drive the "harder = slower" feel: **LEVEL SLOWDOWN** makes every level cost 25% more per difficulty tier above the bottom lanes (compounding — nightmare ×1.25, jesus ×1.5625), and the **ENDGAME WALL** steepens the curve 5% per level past 70 so the climb to 99 becomes a real grind. Both are on the DEVELOPER › BALANCE page. The per-map XP caps, golden-arrow caps, and world-drop level gates were re-sized off the new full-clear landings.

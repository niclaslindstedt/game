---
type: Changed
title: Difficulty ramps named in one ladder file
---

Per-difficulty mob levels and boss hp are no longer copied into every level file — a spawn point or boss now names a neutral, ordered RAMP (`meek`→`monstrous` waves, `endgame`/`apex` bosses) defined once in `ladder.yaml` relative to each map's start/end level, so the whole campaign's difficulty is tuned from one place; the change also normalizes a handful of hand-tuned outliers (mostly ±1–2 mob levels and rounded boss hp on the higher difficulties).

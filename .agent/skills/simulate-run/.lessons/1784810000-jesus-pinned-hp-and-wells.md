---
title: Read the BOSS table's bossHp column against hero dps — JESUS set pieces once fell through to the minion hp curve; and black-hole deaths are a bot gap, not a balance knob
date: 2026-07-23
---

Two findings from the nightmare/JESUS beatability pass:

- When every JESUS boss reads `ENGAGED, not killed`, divide the boss table's
  `bossHp` by the hero's realistic single-target dps before touching any
  difficulty knob. The 30k–320k bars traced to `applyAuthored` (create.ts)
  skipping JESUS entirely: pinned elites/bosses fell through to the MINION
  spawn path, whose geometric per-level hp curve (×200+ at the JESUS level
  floor) times the engage power-match double-dipped their health. The fix
  anchors JESUS pinned hp to the authored nightmare bar ×
  `MENACE.jesusPinnedHpMult` — if boss fights drift again, that knob (and
  that fall-through) is the first place to look. Horde/menace probes
  (`--balance hordeSize/mobHp/menaceGain`) did NOT move the felled count —
  don't start there for a boss wall.

- A DEATHS table dominated by `hazard:black_hole` at well coordinates is the
  AUTOPILOT feeding itself to the rift's wells, not over-tuned hazards: the
  bot needed a no-go ring (`wellDangerRadius`, nav.ts), a steering repulsion
  field inside `steer()`, an escape hop, and well-guarded loot/chest targets
  refused (`insideWellPull`). If well deaths reappear, strengthen those —
  the devour-at-core rule itself is difficulty-independent design.

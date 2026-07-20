---
title: Dormant "life" behaviors ride moveEnemy's asleep branches + per-mob parked rng
date: 2026-07-20
---

Making a map feel STAFFED (workers pottering, WoW-style patrols, alarm
sentries) is a DORMANT-branch concern, not a new AI system. The pattern that
landed (`src/game/working.ts`, SpaceZ HQ):

- **Hook only the asleep paths of `moveEnemy`** — the minion "else" tail and
  the elite `!awake` early-return. Waking (aggro radius + LOS, wounds), the
  chase, and every set-piece mechanic stay byte-identical, so combat suites
  don't move. Priority: instance-level `Enemy.patrol` beats def-level
  `ai.idle: "work"` beats the old drift-home.
- **Def-level flag for a whole roster** (`EnemyDef.ai.idle: "work"` in the
  enemy YAML), **instance-level data for one placement** (`SpawnSpec.patrol`
  waypoints / `alarms` on a pinned spawn). Reducing the roster's `aggroRadius`
  to ~a screen is what makes the dormant behavior VISIBLE — with several-screen
  radii nothing is ever seen asleep. Streamed pressure survives the cut because
  spawner summons arrive awake with an approach circle.
- **Randomness draws a PER-MOB parked stream** (`Enemy.workRng`, the
  merchant-wander pattern: rebuild from a parked uint32, draw, park back;
  lazily seeded from `enemy.id`). Never touch `state.rng` from a dormant tick —
  a stroller on the far side of the map would desync every staged test.
  Patrols are rng-free (ping-pong + a stuck-skip timer), which is even safer.
- **Wedge handling without pathfinding**: obstacle push-out runs in the shared
  pass after all movement, so a walker can't see the collision — detect the
  wedge as "no net progress toward the target for N ms" and time the leg out
  (work stroll) or skip the waypoint (patrol).
- **Alarm links pierce the spawner gates deliberately** (`raiseAlarm`): arm the
  named point past range/LOS/chain/active-cap, let it emit at the hero for a
  bounded window (`SPAWNERS.alarmWindowMs`), then drop it back to dormant if he
  never came — otherwise a far-off alarmed point holds an active-cap slot
  hostage and starves the fight the hero is actually in.
- Content tests that pin "a dormant mob never moved" (`toEqual(post)`) break by
  design — rewrite them as "stayed within `ENEMY_AI.work.range[1]` of the
  post", which still proves no chase happened.

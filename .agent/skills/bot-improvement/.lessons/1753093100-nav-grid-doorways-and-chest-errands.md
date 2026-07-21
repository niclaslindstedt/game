---
title: The nav grid's any-overlap blocking seals door-width gaps, and chest errands need the whole rush/lock/retry treatment
date: 2026-07-21
---

Two clusters of findings from making the bot "always open chests" (spacez_hq
baseline: 0/2 chests on every seed).

**A 60px doorway does not survive a 40px any-overlap nav grid.** `buildNavGrid`
blocked a cell if ANY inflated obstacle overlapped it, so the wall ends flanking
a door-width gap (spacez_hq's break/stock rooms) bled into both gap cells and
sealed the pocket — `findPath` returned NULL, `nearestContent` re-picked to
`target: null` every tick, and both chests read as unreachable forever. The
diagnostic signature: a live chest on the field while `bot.content` shows
`null/null` with an empty skip list. Fix: after the blocking pass, RE-OPEN any
blocked cell whose CENTRE still fits a hero-radius disc clear of every solid —
standable is walkable; the follower's body-width string-pull sweeps keep the
actual walk honest. Measured: paths to both chests appear, no new stuck
cancellations across the easy campaign.

**Reaching a chest takes four separate reads, not one.** Each was measured
missing in sequence:

- **A quiet-field-only crack read never fires on a wave map** — `near.length
  === 0` is basically never true. The mid-fight read mirrors the safe-side loot
  scoop (chest nearer than the nearest foe, danger bubble respected), plus an
  override for the COMMITTED chest: its doorway is a flooded chokepoint, and
  demanding chest-closer-than-foe there parks the hero outside trading blows.
- **`marchingOnFoe` must count a committed chest** — without the rush/gauntlet
  treatment the edge-fight held the hero at the break-room door for 45s (chest
  hp untouched) until the errand was abandoned.
- **The proximity boss lock must defer to ANY live content errand** — killing
  the boss ENDS the level, and a march that merely strays inside
  `BOSS_LOCK_RANGE` sealed runs with chests shut. Beware adding "boss wounded"
  as a lock trigger: stray auto-fire wounds a chasing boss instantly, which
  re-latches the lock. A deferred chasing boss is just another near body; the
  edge-fight handles it (it may even die incidentally — acceptable).
- **Abandoned chests deserve one second chance per level** — the 12s abandon
  window gave up mid-scuffle; chest walks now share the elite hunt's 20s, and
  once the pool is otherwise dry the chest skip-keys are cleared ONCE
  (`contentSkip.retriedChests`) so the leveled late-run hero marches back.

Also: `state.stats.jumps` (takeoff counter, `jumps`/`j/min` sim columns) is the
cheap instrument for hop-discipline changes — the campaign sweep exposed an
18-27 hops/min rate that per-seed traces hid, which led to gating the bleeding
hop on a LANDED hit (`hurtFlashMs > 0`), not mere contact-range proximity.
When probing with a hand-rolled sim loop, break on `phase === "victory"` or
post-victory garbage ticks poison the A/B.

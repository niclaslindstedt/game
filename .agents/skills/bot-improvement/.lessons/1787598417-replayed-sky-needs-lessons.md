---
title: A bot restarting a SEEDED replay must remember where it was hit, or it deathloops the identical fatal line
date: 2026-08-24
scope: engine/game/rocket/driver.ts
concepts: [determinism, restarts, memory, minigame]
---

The flight's restart rebuilds the same seeded sky on purpose ("the shell that
killed you is the shell you learn") — so a memoryless auto-pilot flies the
exact same line into the exact same satellite forever: on JESUS it wrecked
200+ times over 12 seeds and mostly never landed. Giving `FlightDriver` a
`lessons` list (every hard-strike position, kept across restarts, costed as a
berth in `columnCost`) took that to 12/12 landed with ~1 wreck per trip. The
general rule: whenever a bot replays deterministic content after failure, its
state object must carry something ACROSS the restart, or the restart-as-lesson
design only works for humans. Read the strikes off last tick's `state.events`
(cleared at each step's top, so between ticks they hold the previous tick's).

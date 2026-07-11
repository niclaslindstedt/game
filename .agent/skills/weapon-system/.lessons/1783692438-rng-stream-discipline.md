---
title: Any change to per-drop rng draws shifts every seeded content test
date: 2026-07-10
---

A change to how many `state.rng` draws a drop consumes shifts every seeded
content test after the first kill. Two consequences seen in practice:

- Tests that park a dying mob ON the player die to contact-damage streaks
  when the stream shifts — stage kills at arm's length (`equipBlaster` + mob
  at +80px) so the scenario doesn't hinge on miss/dodge luck.
- The quality roll surfaced a latent fixture gap: the loot rain hardcodes
  the `screen_nuke` id (`LOOT.nukeShare`), so the fixture catalog must
  register a `screen_nuke` ability (like the shared `blaster`) or a long
  headless run crashes when the slice finally hits.

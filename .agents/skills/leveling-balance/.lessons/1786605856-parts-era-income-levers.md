---
title: Parts-era XP delivery is fixed with income levers, not curve cuts — quests, elite/boss mults, more posts
date: 2026-08-13
scope: content/quests/, content/leveling.yaml, content/maps/
concepts: [xp-curve, parts, quests, income, simulator]
---

The static-parts garrison (one mob per post) fields far fewer bodies per minute
than the knots the curve was calibrated on: a 14-min medium-lane sweep landed
L14 against intended L32. The fix that held the curve's annotations honest was
three INCOME levers, not cheaper rows: quest `xpShare` ×1.7 (test ceiling
raised to 1.5 in `tests/content/quests_test.ts` — errands are a deliberate
progression pillar now), `eliteXpMobMult` 5→8 / `bossXpMobMult` 10→15 (leaves
rank-and-file kills-per-level annotations true), and ~+1 spawn post per part
across the six decks. Result: the same sweep landed L22 with moon/mars ON band
— and the sim does no errands, so a real player lands higher still. Note the
sim's quest blindness when judging quest-heavy tuning, and remember adding
posts re-deals every breed roll: a pinned sight-beat breed can vanish from a
seed's cast (fix by pinning the breed on a post, the moon-SUCCESSOR pattern).

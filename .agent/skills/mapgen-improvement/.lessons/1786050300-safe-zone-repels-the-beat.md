---
title: A SAFE zone on the landing is a wall; scripted openings die inside it
date: 2026-07-28
---

`safeZones` and `quietZones` both suppress ambient spawns, so they read as
interchangeable when you are placing a breather. They are not: `stepEnemies`
REPELS every minion out of a safe zone every tick and holds it at the edge. A
safe zone centred on the hero's landing is therefore a bubble nothing can enter —
he can stand in it untouched for the whole run.

It also silently killed a mission's opening. `openingStrike` is held in order by
`after`: the hero reads the crowd, and only then does the scripted rusher break
from the pack and park at contact, where its harmless touch draws his blade. Both
halves failed inside the bubble — the rusher was pushed back out of the pad it was
placed in and sat at 149 px forever, and the breed whose sighting opens the gate
was 500 px away in the nearest knot. Symptom: a hero who never draws his weapon,
0 kills, and a run that looks like the bot is broken.

Two rules fell out of it:

- Use a QUIET zone for a breather; spend SAFE zones on what the hand-authored maps
  spend them on (the trader's stall).
- When a beat is gated on a sighting, the carve has to place what is sighted. Look
  up the `firstSightThoughts` pin the `after` thought names and pin a few of that
  breed inside its radius of the landing.

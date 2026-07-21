---
type: Changed
title: Autopilot tops off from surplus supplies and plays golden arrows strategically
---

With a medkit/stamina-potion/repair-kit stack already full and the same kind
lying underfoot (or inside a running magnet's pull), the autopilot now spends
one — only when health, stamina, or gear durability actually has room — so the
walked-over pickup refills the stack; the switch fires only in passing, on a
10-second cooldown, and never diverts the march. The bot also learns from
experience how much of the XP bar a golden arrow pays (in 5% steps) and treats
a nearby arrow that would trigger a level-up — a free full heal — as a
strategic medkit: it holds its kits, grabs the arrow when bleeding, and fights
a little braver with one in reach.

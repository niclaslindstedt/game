---
type: Fixed
title: AUTO PILOT keeps a bag slot open
---

AUTO PILOT (and BOT VIEW) now trim the bag back to one free cell AFTER each simulation step instead of before it, so the "keep one slot open" discipline actually holds at rest — the reserved cell was being refilled by the same step's pickup, leaving a watched auto-run riding a full bag.

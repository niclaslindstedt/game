---
type: Fixed
title: A broken frame no longer freezes the run
---

A single unhandled error inside the game loop used to unschedule it for good —
the world froze mid-frame while the page stayed alive around it (the music
played on, queued pickup cards kept popping, buttons still answered), which
read as an inexplicable hang rather than a crash. Each frame's simulation and
drawing are now caught separately and the next frame is always scheduled, so
the run plays on and the failure is written to the log instead of taking the
game down with it.

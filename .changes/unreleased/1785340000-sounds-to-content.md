---
type: Changed
title: Every sound in the game is now content
---

The sound bank moved out of code and into `content/sounds/*.yaml` — one file per
sound, each a list of voices with the prose describing what it should feel like.
It sounds exactly the same (a test proves every sound plays byte-identically),
but a sound can now be read, diffed and retuned without touching TypeScript, and
a weapon can name its own with `sfx:` instead of borrowing its class's.

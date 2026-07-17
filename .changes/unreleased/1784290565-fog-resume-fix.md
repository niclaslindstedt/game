---
type: Fixed
title: Fog of war clears again after resuming a run
---

Resuming a parked run (e.g. after an app update reloads the page) no longer freezes the fog of war — the thawed exploration grid is rebuilt as a typed array so the fog renderers keep clearing as the hero moves.

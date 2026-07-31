---
type: Fixed
title: Settings survive a restart again
---

Every setting was quietly reset to its shipped value on load — the whole
defaults object was being stamped back over the saved one, so a changed steering
scheme, volume, HUD or video knob lasted only until the game was reopened.

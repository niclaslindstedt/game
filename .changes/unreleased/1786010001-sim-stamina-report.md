---
type: Added
title: The balance sim reports how often stamina runs dry
---

`simulate-run` now prints a STAMINA table — dry-outs and their per-minute rate,
the share of the run spent at zero, the share the empty-pool regen lockout was
armed, the "on fumes" share, mean fill, the longest dry spell, drinks
swallowed, and the run/walk/stand pace breakdown — and a new DEVELOPER →
BALANCE knob (STAMINA DRAIN) scales the run drain so a candidate rate can be
swept without a rebuild.

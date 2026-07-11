---
title: The autopilot ignores behavioral incentives — A/B against main before trusting a regression
date: 2026-07-11
---

Mechanics that INCENTIVIZE player behavior (anti-camping starvation, "move on
to get fed" trickles) read as catastrophic regressions in the simulator,
because the bot never adapts: the survivor strategy kites inside a small
orbit, trips any stay-in-place detector, and then lives off whatever fallback
faucet exists. Tell-tale: kills/min collapsing to almost exactly a trickle's
cadence (e.g. one spawn per beaconEveryMs). Before concluding a balance change
broke pacing, stash the change and run the SAME seeds on main — and judge
incentive mechanics by whether the bot's honest windows (grace periods,
post-death re-anchors) still feed it, not by the raw sweep numbers.

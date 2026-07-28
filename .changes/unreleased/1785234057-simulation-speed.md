---
type: Changed
title: The balance simulator's matrix sweep runs in parallel
---

`scripts/simulate-run.mjs --class all` (and any `--strategy`/`--class` matrix)
now simulates its specs across worker threads instead of one after another —
each spec is an independent campaign, so the reports and their order are
identical to a sequential sweep, roughly twice as fast on a four-core machine.
`--jobs N` sets the width and `--jobs 1` restores the sequential run. The new
`make sim-bench` measures the headless simulator itself, and the obstacle
line-of-sight query and the autopilot's threat scan — the two hottest reads in
a simulated tick — no longer allocate on their hot paths.

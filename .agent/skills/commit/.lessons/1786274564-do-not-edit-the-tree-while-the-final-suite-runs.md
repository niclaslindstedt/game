---
title: Editing the tree while the backgrounded `make test` runs invalidates the run — vitest resolves files it collected minutes ago
date: 2026-08-09
scope: tests/
concepts: [quality-gates, false-red, testing, ci]
---

This skill's own convention is to start the final suite in the background and push
while it runs, which is right — but it makes the tree a shared resource for the next
three minutes. Vitest collects its file list at the start and imports each one when it
reaches it, so a test file DELETED (or renamed) mid-run fails as
`Error: Cannot find module …`, and the summary reads `1 failed | 382 passed` over a
suite that is actually green. The reverse is worse and quieter: a source file edited
mid-run is compiled for some suites and not others, so the result proves nothing about
either version of the tree.

So the background suite is the LAST thing a session starts. Finish every edit first —
including deleting the scratch test file you used to measure something — and if an
edit turns out to be needed anyway, treat that run as void and start another rather
than reading its summary.

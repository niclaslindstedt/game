---
title: When every candidate lives in one sprite-data file, vote before you commit
date: 2026-07-11
---

Phase 4 step 8 wants one commit per candidate for a trivial Phase 6 revert, but a
level pass usually edits ONE family module (e.g. `spacez.mjs`) — five redraws are
five hunks in one file. Splitting them into per-candidate commits needs `git add
-p`, which is interactive and unavailable in this harness.

Cleaner path that reaches the same place: keep all redraws in the working tree,
build the Phase 5 before/after sheet straight from it (the snapshots are the
"before", the uncommitted grids the "after" — no commit needed), get the vote,
then commit ONLY the approved sprites in one commit. To drop a rejected one,
`git show HEAD:scripts/sprite-data/<family>.mjs` gives its original grid;
Edit that sprite back and leave the rest. `make assets` after, since the atlas is
gitignored. You still get per-candidate granularity, without the churn of
restoring-and-recommitting a shared file five times.

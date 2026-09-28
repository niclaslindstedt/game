---
title: "`make hooks` writes the SHARED git config — never run it from a worktree someone else's checkout shares"
date: 2026-09-28
scope: Makefile, .githooks/
concepts: [quality-gates, hooks, worktrees, shared-state]
---

`make hooks` is `git config core.hooksPath .githooks`, and a worktree has no
config of its own: the line lands in the main checkout's `.git/config`, so it
switches the hooks on for the shared checkout and every other worktree at once
— including trees whose `.githooks/` is older, or absent, where every commit
then runs a hook that is not there. Install the hooks once, in your own clone.
In a worktree, run the hooks' checks by hand instead: `make fmt-check`, and a
glance at the subject against `.githooks/commit-msg`'s pattern.

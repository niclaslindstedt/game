---
title: In a multi-agent sweep, re-grep every edit at the END — a parallel commit can silently revert one
date: 2026-08-09
scope: .agents/skills
concepts: [multi-agent, verification, skill-writing]
---

During a fan-out documentation audit (one agent per file set, an orchestrator
committing centrally), three edits to `.agents/skills/simulate-run/SKILL.md`
applied cleanly, reported success, and were gone from the working tree twenty
minutes later — swept away when the orchestrator's commit restored the file.
Nothing errored, and the session would have reported them as fixed.

Close any such pass with a mechanical re-check: one `grep -c` per fix against
a distinctive phrase from the new text, listed OK/LOST. It costs one command
and is the only thing that distinguishes "edited" from "shipped". Beware
grep-pattern escaping in the checker itself — a backtick or bracket in the
probe string produces a false LOST, so confirm each miss by eye before
re-applying.

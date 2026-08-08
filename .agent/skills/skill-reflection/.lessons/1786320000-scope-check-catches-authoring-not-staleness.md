---
title: A flagged scope is usually a MIS-SCOPED lesson, not a stale one — check the path before you delete
date: 2026-08-08
scope: scripts/skill-lessons.mjs
concepts: [scope, staleness, backfill, verification]
---

`--check` warns when a lesson's `scope` names a path that no longer exists, and
the obvious reading is "this lesson has rotted". On the first full backfill both
warnings were the opposite: the lesson was fine and the SCOPE was wrong —
`content/sprites/tiles/` for a lesson about ground tiles (the sprites tree is
split by biome, there is no `tiles/`), and `scripts/effects-gallery.mjs` for a
tool that actually lives at `pwa/scripts/effects-gallery.mjs`.

So the order is: resolve the real path FIRST (`ls`, or grep the skill's own
SKILL.md for the command), and only conclude staleness when the thing the
lesson is about is genuinely gone. Deleting on the warning alone throws away
good lessons.

When backfilling scope in bulk, run `--check` immediately after — it is the only
thing that catches a plausible-looking path that was never real.

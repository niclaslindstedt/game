---
title: One YAML per sprite — so per-candidate commits need no `git add -p`
date: 2026-07-30
---

Sprites live one-per-file at `content/sprites/<family>/<id>.yaml` (an animated
mob is two files, `_0` and `_1`). Phase 4 step 8's "commit this candidate alone"
is therefore a plain `git add content/sprites/<family>/<id>*.yaml && git commit`
— no interactive staging, and Phase 6's revert of a rejected candidate is one
`git revert <sha>`. (This replaces an older lesson written when a whole family
shared one `scripts/sprite-data/<family>.mjs` and the advice was to delay every
commit until after the vote; that file layout is gone.)

Corollary for Phase 1 step 5: check recency with
`git log -n 30 --oneline -- content/sprites/<family>/` — and note that in a
SHALLOW clone (the norm in this harness) `git log -- <path>` returns nothing
for a file untouched within the graft, which is indistinguishable from a file
never touched at all. An empty log is therefore weak evidence of "old art";
read the sprite's own `description`/`subject` for a just-shipped rationale, and
the skill's own lesson log for names a recent pass already redrew.

---
type: Added
title: Mods can write their own story
---

Cutscenes, the hero's inner monologues and the story items his finds spell out
are authored as content now (`content/cutscenes/`, `content/thoughts.yaml`,
`content/story-items.yaml`), so a Steam Workshop mod ships them in the same
format the campaign does — a total conversion can open on its own night, give the
hero his own read on what he is looking at, and hide its own lore on the floor,
instead of new monsters walking the shipped plot. A level's `prelude` is
cross-referenced at build time too, so a scene id nobody ships fails the build
rather than the mission.

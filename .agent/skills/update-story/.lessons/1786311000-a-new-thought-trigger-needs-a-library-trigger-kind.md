---
title: A new way to FIRE a thought needs its own trigger kind in the library, or the line publishes nowhere
date: 2026-08-01
---

The lesson about `thoughtsOn()` missing the opening strike has a general form,
and it bites again every time a thought gets a new TRIGGER (not a new page):
`pwa/scripts/library/model-story.mjs` builds a chapter's beats from a hardcoded
list of trigger sources — `openingStrike`, `firstSightThoughts`,
`firstKillThoughts` — so a beat fired by anything else is authored, shipped,
playable, and published on no page at all. `assertFieldsCovered` does not catch
it: the FIELD that carries the id (`travelDoors`) was already covered by a
`LEVEL_FIELDS` entry about something else entirely.

Adding `travelDoors[].unready` (what the hero says at a door with no open road)
needed three edits past the YAML:

- a fourth entry in `thoughtsOn()`'s `triggers` list, with its own `when`;
- a `when` case in `render-story.mjs`'s heading map — and the slot the mob-fired
  beats fill with a SPEAKER needed a second source, since a door beat names a
  door instead;
- the section blurb, which promised every beat "fires on its own, once each" —
  a door beat does neither, and prose that contradicts the page is drift.

The general rule: when a beat is fired by something that is not a mob, check
what the library assumes about beats before assuming the coverage map has you
covered. Then grep the built pages for the line, as always.

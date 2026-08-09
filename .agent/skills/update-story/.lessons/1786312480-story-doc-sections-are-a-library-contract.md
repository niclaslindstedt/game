---
title: docs/story.md's `##` sections are a contract with the library — restructuring them fails library_test
date: 2026-08-09
scope: docs/story.md, pwa/scripts/library/
concepts: [publishing, story-structure, testing]
---

`pwa/scripts/library/model-story.mjs` parses `docs/story.md` and turns each `##`
heading into a chapter, so the headings are STRUCTURE, not prose. Three rules,
all enforced by `tests/content/library_test.ts` and none of them obvious from the
document:

- Every heading must match a rule in `SECTION_KINDS` — `Premise`,
  `Prelude (cutscene)`, `Travel — X (cutscene)`, `Level N — VENUE`,
  `Secret level — VENUE`, `Home — VENUE (hub)`, `Epilogue…`, `The hellborn…`,
  `The Severance…`, `Where the story lives…`. An unrecognised heading (`## The
  world`, `## Travel — THE DRIVE (minigame, both ways)`) is a hard build error.
- The `Travel — X (cutscene)` sections before a level chapter must equal that
  level's `prelude` chain **by count and order**, and the ones straight after it
  its `farewell` chain. Merging five travel scenes into one prose section fails
  with "describes 1 scene(s) on the way into THE MOON, but the level plays 2".
- Every shipped level needs exactly one chapter, matched by NAME.

So a shortening pass folds prose INTO an existing section rather than inventing
or merging headings: the drive belongs inside `## Home — THE GARAGE (hub)`,
because it is a minigame and there is no section kind for one.

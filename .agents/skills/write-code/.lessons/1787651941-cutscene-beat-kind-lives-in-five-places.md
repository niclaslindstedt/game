---
title: A new cutscene BEAT KIND lives in five places, and the fifth is the library's story model
date: 2026-08-25
scope: engine/lib/cutscene.ts, scripts/asset-tools/story-schema.mjs, pwa/scripts/library/
concepts: [cutscene, schema, drift, content-pipeline, library]
---

Adding a `kind:` to `CutsceneBeat` is four obvious edits — the union in
`engine/lib/cutscene.ts`, its `settleBeat`/`beginBeat`/`stepCutscene` handling,
a row in `BEAT_SPECS` (`scripts/asset-tools/story-schema.mjs`), and the beat
table in `mod/FORMAT.md`.

**The fifth is `CUTSCENE_BEAT_KINDS` in `pwa/scripts/library/model-story.mjs`**,
and nothing points at it from the other four. The library's story pages walk
every shipped scene's beats and THROW on a kind they do not have a note for:

```
library: cutscene "launch" plays a "drift" beat, which no library page renders.
```

It surfaces only in `tests/content/library_test.ts`, which is deep in a
three-minute `make test` — so the edit loop, `npx tsc`, `npx eslint` and every
targeted vitest file are all green while the gate is not. Add the row when you
add the beat: one line saying whether the kind is `spoken:` (its words get
published on the story pages) or `not reader-facing: staging — …`.

The same shape holds for anything else the library models off a shipped
catalog — it validates by ENUMERATION, so a new value in a union it walks is a
build failure rather than a silent omission. That is the point of it, but only
if you know it is there.

---
title: A pinned "thought" can be an EXCHANGE — `voice:` + `them:` pages
date: 2026-07-31
---

When a request is "the other character should say something back", do NOT
reach for `EnemyDef.dialogue`: that fires on its own proximity trigger, plays
once, and cannot be sequenced with a scripted beat. A `ThoughtDef` carries an
optional `voice: { speaker, portrait }` and a page may be `{ them: [...] }` —
the exact mirror of `{ hero: [...] }` in an arrival scene. `dialogueContent`
resolves BOTH into one `voices` array parallel to `pages`, so the box draws
either without knowing which kind of scene it is in.

Three things a two-way thought touches beyond the YAML: the story schema
(`scripts/asset-tools/story-schema.mjs` refuses a `them:` page with no
`voice:`, and a `voice:` no page uses), the library's `THOUGHT_FIELDS`
coverage map (an undeclared authored field fails the build), and
`render-story.mjs`'s `pinnedBeat`, which prints an exchange as turns instead
of stuffing the other party's words into the hero's own blockquote.

The scene kind is still called `playerThought`. That is a MECHANISM name — it
is what the pinned-beat machinery, the read ledger and the `openingStrike`
hook all key on — so keep it, and call the thing an EXCHANGE everywhere a
reader sees it (manuscript heading, library heading, comments).

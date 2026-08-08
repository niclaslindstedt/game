---
title: A retone of a SCRIPTED scene is usually engine work, not just a text edit
date: 2026-07-31
scope: engine/game/story.ts
concepts: [scripted-scenes, retone, engine-work]
---

"He shouldn't sound so cold" on a scripted beat (GOODCO HQ's `openingStrike`,
an ambush, a boss's set-piece) is rarely satisfiable in `content/thoughts.yaml`
alone: the TONE is carried by the SHAPE of the scene, and the shape is a
`LevelDef` field plus its hook in `engine/game/story.ts`. Rewriting the opening
strike into three refused blows needed `OpeningStrike.warnings` (the type, the
hook, the level schema's validator) before a single line could land.

So walk the chain top-down as usual, but budget for the engine half, and put
the beat's REASONING in the def's doc comment rather than in the YAML — the
YAML is data a mod also authors, while the doc comment is where the next
session reads why the scene has the shape it has.

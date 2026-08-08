---
title: A line with no speaker's name and no portrait cannot live in `content/thoughts.yaml`
date: 2026-08-07
scope: content/thoughts.yaml
concepts: [barks, portraits, schema]
---

The thought catalog models a BEAT: `speaker` and `portrait` are both REQUIRED by
`validateThought` (`scripts/asset-tools/story-schema.mjs`), and `portrait` is
checked as a sprite FAMILY — it must resolve `<name>_0`. That is right for the
hero's inner monologue and for an exchange, both of which are drawn in the
dialogue box with a face beside a name.

It is wrong for a BARK: a bubble over somebody's head on a moving road has no
name plate, no face, no measured text column and nobody to tap it. Trying to
file one there means inventing a portrait sprite that is never drawn, purely to
satisfy a validator.

The shipped precedent is already in the tree — a boss's set-piece barks live in
`engine/game/defs/enemies/abilities.ts`, in code, and the manuscript transcribes
them anyway. So the rule is about the SHAPE of the line, not the file it sleeps
in: if it has a speaker and a portrait it is a thought def; if it floats over a
head it is a bark and it lives with the presentation that draws it. Either way
`docs/manuscript.md` gets the verbatim lines and a "Where the data lives" row
pointing at the module — the chain cares that a line is written down, not which
catalog holds it.

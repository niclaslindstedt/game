---
title: A consequence that "follows you" is a run FLAG plus one reader per surface — and each surface has its own publishing gate
date: 2026-08-13
scope: content/quest-givers.yaml, engine/game/story.ts, pwa/scripts/library/
concepts: [flags, campaign, consequences, publishing, library, epilogue]
---

Making a mistake in the first ten seconds of the campaign echo in the last line
of it needed no new persistence: **every run flag is banked with the hero
between levels** (`bankCampaignQuests` — "a flag is a fact the hero learned"),
so `state.questFlags[x] = true` at the moment it happens travels for free.

What it does need is a reader per surface, and each is a different shape:

- **The moment** — a `ThoughtDef` raised on the spot. Keep it short enough that
  it does not become the character working it out; three words was right.
- **The MINIGAME** — the drive is settled whole before its first tick, so the
  flags are a `DriveParams` field like the seed and the car's dents, and the
  voice table gets a `MONOLOGUE_IF` row rather than a branch.
- **The ENDING** — `LevelDef.outro` is walked by INDEX (`state.outroPage`), so
  gated pages need ONE accessor (`outroPages`) that all five call sites use;
  one left on `runLevelDef(state).outro` is an epilogue that ends a page early.
  Append rather than insert — a gated page lands hardest as the last thing said.

And check publication per surface, because they disagree: the library's story
chapter needed a new `thoughtsOn()` trigger entry AND a heading-map case (the
silent gate), the mission page needed a `LEVEL_FIELDS` row (the loud one) — and
the DRIVE's monologues are published nowhere at all today, so a new one there
matches the precedent rather than the rule. Grep the built pages; do not read
the model.

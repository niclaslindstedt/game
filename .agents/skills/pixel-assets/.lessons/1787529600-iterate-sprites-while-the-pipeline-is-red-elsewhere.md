---
title: Iterate sprites with the sprite generator alone when `make assets` is red on a SIBLING catalog — and judge pale art on the sheet's dark row
date: 2026-08-24
scope: content/sprites/, scripts/generate-assets.mjs
concepts: [previews, judging, pipeline, tooling]
---

`make assets` runs the whole `generate-content.mjs` chain, so on a branch with
parallel work in flight it can fail on a catalog that has nothing to do with
sprites (here: HUD elements referencing a Lua file another task had not landed
yet) — and the failure lands BEFORE the sprite step, so the loop stalls. The
sprite renderer is its own entry point: `node scripts/generate-assets.mjs`
builds the atlas, previews and lint warnings alone, which is the whole
edit-look-judge loop. Triage first: read whose files the error names before
assuming the new family broke the build. The final gate is still `make assets`
— report the pre-existing failure rather than absorbing it.

Second, the `<name>@8x.png` preview sits on a LIGHT checker. A white/bone
sprite (a skeleton, porcelain) all but vanishes there and tempts a rework it
does not need; the family sheet's dark-checker row is the honest surface for
anything pale — and for a family whose canvas is black space, it is the only
row that matters.

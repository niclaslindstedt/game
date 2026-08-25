---
title: All shots share ONE browser context, so the hero name the recipes create collides after the first one
date: 2026-08-25
scope: pwa/scripts/store-shots.mjs, pwa/scripts/store-shots/recipes.mjs
concepts: [playwright, staging, localstorage, false-green, character-create]
---

`store-shots.mjs` opens a single `browser.newContext()` for the whole device
run and gives each shot a `context.newPage()`. Pages in one context SHARE
localStorage, so the saved roster survives from shot to shot.

Every recipe that stages a run fills the same hero name — `recipes.mjs` uses
`"ADA"` — and `NewGame.tsx` computes `canCreate = !taken`. So the first shot
creates ADA and every later shot that goes through character creation finds the
name taken. The CREATE button is `aria-disabled` (deliberately: it takes the
press and refuses out loud rather than eating it), which Playwright's
actionability check reads as "not enabled", so the click waits the full 30 s and
the shot fails.

The signature is a partial set whose survivors look arbitrary: a run captured
`01-nuke`, then failed `02`–`05`, then captured `06-drive` and `07-rocket` —
the two minigame frames, which never open character creation.

Fix it by isolating per shot (a fresh context, or clearing storage between
pages) rather than by renaming the hero per recipe, which only moves the
collision to the second run of the same recipe.

Not a game bug — the refusal is working as designed. Check the shot list before
concluding the game broke.

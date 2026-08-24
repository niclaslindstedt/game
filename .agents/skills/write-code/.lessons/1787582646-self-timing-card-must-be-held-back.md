---
title: A card that times ITSELF out must be held back behind a longer opening, never layered under it
date: 2026-08-24
scope: pwa/src/game/rocket-screen/
concepts: [overlays, minigame, animations, false-green]
---

`RocketIntro`'s title page starts a `setTimeout` on MOUNT and turns itself to
the controls page 1900 ms later. Putting a longer surface in front of it — the
launch cutscene the arcade cabinet and the `?rocket` workbench now open on —
by simply stacking a higher `z-index` over it means the card underneath has
already spent both its pages by the time the player sees it. Render it
CONDITIONALLY instead (`{intro && !onPad && <RocketIntro …/>}`), so its clock
starts when it is actually on screen.

The general shape: an overlay whose lifecycle runs off a mount-time timer (or a
CSS `animation` — the same trap in the borrowed-chrome lesson beside this one)
cannot be occluded, only deferred. Check for a self-turning clock before
layering anything in front of a card.

It also keeps the keyboard honest: `RocketIntro` binds a `keydown` that
advances it, so a card mounted under a scene would eat every page-turn the
player aimed at the scene.

---
title: A cutscene stage is a DIORAMA — its scenery is about half the gauge the hero is drawn at
date: 2026-08-25
scope: content/cutscenes/, content/sprites/scenes/, pwa/src/game/overlays/
concepts: [cutscenes, scale, composition, sprites]
---

The scene sprites are not at the world's gauge and must not be judged as if they
were. On the launch lot the hero is 16 px, the house 48, the trees 20×30 and the
ship 24×32 — a real house is ten hero-widths wide, so the SCENERY sits at roughly
half the gauge the character does. That is a deliberate diorama look, and the
walkable map's own numbers (a 64 px roll-up door, one hero tall) do not transfer.

Two consequences:

- Dropping WORLD art onto a stage at 1:1 comes out enormous. The hero's car
  assembly (48×26) is right beside a 16 px man in the field and as wide as the
  whole house on the stage; it needs a 2:1 nearest-neighbour blit through a
  scratch canvas (`paintWagon`, CutsceneOverlay) to sit on the lot.
- Scaling the scenery UP to the map's gauge does not work either: it was tried
  (a 120×48 house) and read badly, because every other prop on the stage is at
  the diorama's gauge and only the building moved.

Also: the dialogue box floats over the bottom ~20 stage px for most of a scene,
so anything authored below about `height × 0.82` is never seen. The launch lot's
road lived there and was invisible until the whole ground plan was pulled up.

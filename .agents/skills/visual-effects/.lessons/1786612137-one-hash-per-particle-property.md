---
title: Give every particle property its own hash — a shared one sorts the effect instead of mixing it
date: 2026-08-13
scope: pwa/src/game/render/
concepts: [particles, determinism, randomness]
---

Deterministic particle bursts derive each grain's properties from `fract(seed *
k + i * m)` hashes. Reusing ONE hash for two properties correlates them, and the
correlation is visible even when neither value looks wrong on its own.

The case: a shape picker and a per-grain lifespan both read `h5`, so the biggest
shapes in the kit always outlived the smallest specks. Nothing looked random —
the cloud read as SORTED, dust dying first and the showy shapes hanging on in
formation. One extra hash for the shape fixed it with no other change.

The rule: one hash per property that a viewer can see independently. Sharing is
only safe where the correlation is the intent (size and brightness together
reads as depth, and is worth keeping).

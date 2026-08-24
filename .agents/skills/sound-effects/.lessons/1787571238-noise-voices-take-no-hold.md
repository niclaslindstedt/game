---
title: A noise voice takes no attackMs/holdMs — a noise bed fuses by overlap, not by hold
date: 2026-08-24
scope: content/sounds/
concepts: [loops, grains, noise, schema, sustain]
---

The sound schema's `attackMs`/`holdMs` are tone-only (`TONE_ONLY`,
scripts/asset-tools/sound-schema.mjs) — authoring them on a `call: noise`
voice fails the generator with "a noise burst has no pitch". A noise-based
bed grain (rain, static, wind) on a fixed cadence sustains by OVERLAP
instead: give each grain a duration ~2.5× the cadence and the fading copies
sum to a steady wash (`rocket_rain` — 520 ms grains on the 190 ms engine
clock). The tone half of a bed still follows `continuous-bed-needs-a-hold`.

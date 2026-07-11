---
title: Master limiter + per-step dedupe
date: 2026-07-10
---

Every voice and the echo bus sum into one `DynamicsCompressor` limiter
(threshold −12 dB, knee 6, ratio 20, attack 2 ms, release 180 ms) in
`synth.ts` before the destination — single sounds (peaks ≤ 0.12 ≈ −18 dBFS)
pass untouched, overlapping stacks stop hard-clipping. And `playEventSounds`
plays identical sounds once per step (keyed on
type/weaponClass/crit/kind/tier): N same-frame kills are sample-aligned
copies of one waveform, i.e. one sound at N× amplitude, never "N kills".

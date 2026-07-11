---
title: The merchant is in scope for a level pass
date: 2026-07-11
---

It lives in `merchant.mjs`, not the biome family module, but has per-biome
variants (`merchant_vendor`, `merchant_moon`, …). The survey pulls the right
one via `def.merchant.sprite`; editing it only affects that biome.

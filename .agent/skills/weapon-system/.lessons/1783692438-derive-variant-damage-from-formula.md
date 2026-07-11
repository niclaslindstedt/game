---
title: Derive variant damage from the budget FORMULA, not by scaling the base
date: 2026-07-10
---

Ratio-scaling carries the base's within-tolerance drift into the variant,
and rounding can push it over the band (riot_baton did). Computing
`budget(newReq) × cd/1000 ÷ targets ÷ critLift` directly puts every variant
dead-center by construction.

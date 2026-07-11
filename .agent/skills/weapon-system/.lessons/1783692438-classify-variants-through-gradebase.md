---
title: Classify generated variants through gradeBase
date: 2026-07-10
---

Both scripts (`weapon-budget.mjs` special-vs-pooled, `weapon-stats.mjs`
class ladder) and the weapon sheet group by pool membership — a variant
rides its base's (`pooled.has(def.gradeBase ?? def.id)`), or every generated
def reads as a "special" and fails the ×1.15 premium budget.

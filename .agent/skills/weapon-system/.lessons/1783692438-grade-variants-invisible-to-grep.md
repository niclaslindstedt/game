---
title: Generated grade variants are real bases but invisible to grep
date: 2026-07-10
---

The single worst unique-authoring bug: naming a base, greping the
gear/equipment source, not finding it, and "fixing" a non-problem — because
`grades.ts` mints the Exceptional/Elite variants at load, not in source.
Validate bases through the checker (runtime `GEAR_DEFS`/`WEAPON_DEFS`,
`unique-check.mjs --bases`), never a source grep.

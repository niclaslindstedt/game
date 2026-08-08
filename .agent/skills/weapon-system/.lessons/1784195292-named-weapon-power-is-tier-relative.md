---
title: Judge named-weapon "overpowered" tier-relative, and watch the damagePct double-count
date: 2026-07-16
scope: content/items/
concepts: [uniques, tier-relative, damage-pct]
---

When auditing whether a named weapon (unique/legendary/artifact) is overpowered,
raw effective DPS or `effDps / budget(req)` (the "spike") flags almost the whole
arsenal — because a multiplier stacks on top of the on-budget base:

- **The damagePct double-count.** A `+%dmg` bonus both raises the item's `ilvl`
  (it's priced into the `weapon-ilvl.mjs` bonus budget) AND directly multiplies
  damage in `weaponDamageFor` — so it pays twice. Low-req uniques with a fat
  `damagePct` (HERDBREAKER +220%, THE JAILBREAK +120%) are the real anomalies:
  they hit like endgame gear at req 14–24.

So don't flag on absolute power. Flag **tier-relative**: `spike ≥ 1.5× the
weapon's OWN tier median`. That leaves the intended tier ordering intact and
surfaces only genuine oddities — a unique spiking like an artifact, or an
artifact hot even among artifacts.

**UPDATE (2026-07-28):** the ilvl base-damage term is GONE — a weapon's catalog
`damage` is now exactly what it swings, and item level buys only the affix
budget. That removes the single biggest source of named-weapon spike (artifacts
like DURENDAL were riding ×3.88 off ilvl alone), so the measured tier ordering
now rests almost entirely on authored bonuses. Re-measure with
`scripts/weapon-scatter.mjs` before trusting any remembered tier median, and
expect the named tiers to sit far closer to the rolled economy than they used
to — if a chase tier now reads too flat, the fix is to author it better
bonuses, not to reintroduce a hidden multiplier.

Two more traps the analyzer handles: DON'T fold a weapon's own STAT GRANTS into
its DPS (a +50 STR juices its hits ~10×, but stat grants are a separate axis with
their own chart — folding them double-represents them and swamps the signal);
and a unique on a STARTER base (EXCALIBUR → `medieval_sword`) reads hot only
because starter weapons sit off the budget line (they're exempt in
`weapon-budget.mjs`), not because its bonuses are strong — caveat those.

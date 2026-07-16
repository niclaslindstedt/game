---
title: Judge named-weapon "overpowered" tier-relative, and watch the damagePct double-count
date: 2026-07-16
---

When auditing whether a named weapon (unique/legendary/artifact) is overpowered,
raw effective DPS or `effDps / budget(req)` (the "spike") flags almost the whole
arsenal — because two multipliers stack on top of the on-budget base:

- **ilvl base-damage scaling.** A named weapon mints at its authored `ilvl`, and
  `weaponDamageFor` scales the base blow by `1 + WEAPON.damagePerIlvl·(ilvl −
  req)`. Artifacts carry huge ilvl (e.g. DURENDAL ilvl 236, req 92 → ×3.88), so
  their fresh-drop DPS is enormous — BY DESIGN. Artifacts are endgame; they are
  SUPPOSED to be the strongest tier, legendaries next.
- **The damagePct double-count.** A `+%dmg` bonus both raises the item's `ilvl`
  (it's priced into the `weapon-ilvl.mjs` bonus budget) AND directly multiplies
  damage in `weaponDamageFor` — so it pays twice. Low-req uniques with a fat
  `damagePct` (HERDBREAKER +220%, THE JAILBREAK +120%) are the real anomalies:
  they hit like endgame gear at req 14–24.

So don't flag on absolute power. Flag **tier-relative**: `spike ≥ 1.5× the
weapon's OWN tier median`. That leaves the intended tier ordering intact
(`scripts/weapon-scatter.mjs` measured unique ×1.65 < legendary ×2.48 < artifact
×3.45) and surfaces only genuine oddities — a unique spiking like an artifact, or
an artifact hot even among artifacts (DURENDAL, ×2.2 its tier median).

Two more traps the analyzer handles: DON'T fold a weapon's own STAT GRANTS into
its DPS (a +50 STR juices its hits ~10×, but stat grants are a separate axis with
their own chart — folding them double-represents them and swamps the signal);
and a unique on a STARTER base (EXCALIBUR → `medieval_sword`) reads hot only
because starter weapons sit off the budget line (they're exempt in
`weapon-budget.mjs`), not because its bonuses are strong — caveat those.

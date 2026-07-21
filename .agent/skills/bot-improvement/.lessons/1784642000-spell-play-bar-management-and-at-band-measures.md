---
title: Spell play needs harness-side bar management, kill-credit in the thrift read, and an at-band late-map hard run to measure
date: 2026-07-21
---

Four findings from making the bot spell-aware (mana-thrift casting):

- **`autofillSpellSlots` only fills EMPTY slots, so a bot's bar goes stale by
  construction.** The 4-slot bar fills with the ladder's first four unlocks
  (arc_bolt, ember_burst, …) and then never changes — a maxed mage was
  casting INT-10 spells while the capstones sat unlocked and unslotted.
  Re-slotting is a state mutation, so it's a HARNESS action next to
  `stepBotWeaponSwap` (bot-economy's `botAssignSpellBar`), not botAct logic;
  run it every tick (gear can raise the class stat and unlock a spell without
  a ding), and make the settled-bar case a set-compare no-op.
- **A damage cast's worth is EFFECTIVE damage per mana, in level-1 units.**
  The resolver deals `def.damage × abilityPowerScale(state)` and mob hp scales
  on the same curve, so divide each foe's remaining hp by the power scale and
  the read is level-independent: a lone-target bolt converts ~2.3–3.3 catalog
  damage per mana, an AoE on one body only ~1.7 — an efficiency floor of ~2
  naturally lets bolts fly at singles while novas wait for crowds. Mirror the
  resolver's own targeting (nearest-in-range bolt + greedy chain within
  `WEAPON.chainRange`; rain centres on the nearest foe in `castRange`;
  sorcery's `isTargetable` guards — apparitions and the kneeling
  `state.choice` spareable don't count).
- **Overkill-cap the per-foe credit, but floor a KILL at `spellKillCredit`.**
  Raw capping at the remaining bar starves the horde clear: against a pack the
  hero outlevels, every bar reads near zero and the bot stops casting
  entirely (measured: casts fell ~70% and kills with them on an outleveled
  farm run). A felled foe is worth more than its sliver of bar — credit
  `max(bar, killCredit)` (never above the strike's own damage) so a nova
  erasing three attackers clears the floor while a bolt spent on one trash
  mob the weapon would fell anyway is still held.
- **Measure caster changes AT-BAND on a LATE map of a tuned difficulty.** A
  fresh rookie never reaches class stat 10 on map 1 (no class → no bar → both
  arms of an A/B byte-identical), `--farm` outlevel runs are noise-dominated
  (per-seed kill spread exceeds the A/B delta) and unrepresentative, and
  nightmare/JESUS balance is not yet tuned — don't gauge against it. The
  clean bed: `--difficulty hard --level eastworld --start-level 35` (the
  ladder's hero level, mobs 31–38) across seeds; read
  `stats.spellsCast`/`manaSpent` from `--json` next to kills and dmgIn.
  (Measured there: the thrift rework spent 40% less mana for +6% kills and
  −87% damage taken — capstones on the bar kill threats before they close.)

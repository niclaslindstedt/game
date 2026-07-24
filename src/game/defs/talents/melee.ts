// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MELEE — the STRENGTH tree ("Warlord"): tank or damage, scaling the held
// weapon. These are the tree's stat-modifier talents; on-hit proc talents
// (Cleaving Echo, Twin Strike, Parry, Seismic Landing) extend it later.

import type { TalentDef } from "./index.ts";

export const MELEE_TALENTS: TalentDef[] = [
  {
    id: "executioner",
    name: "EXECUTIONER",
    tree: "melee",
    kind: "damage",
    maxRank: 5,
    // A melee-tree crit talent, so it lands on melee blows only (the runtime
    // gates crit-chance/damage bonuses by the tree matching the weapon class).
    effect: { critChancePerRank: 0.03, critDamagePerRank: 0.15 },
    blurb: "Melee blows crit more often, and harder.",
  },
  {
    id: "berserker_rage",
    name: "BERSERKER RAGE",
    tree: "melee",
    kind: "damage",
    maxRank: 5,
    // Enrage: the boost is `rank × 0.10` at zero hp, fading linearly to nothing
    // at full — a wounded warlord hits like a truck.
    effect: { berserkPerRank: 0.1 },
    blurb: "The lower your health, the harder you hit.",
  },
  {
    id: "ironhide",
    name: "IRONHIDE",
    tree: "melee",
    kind: "tank",
    maxRank: 5,
    effect: { damageReductionPerRank: 0.03 },
    blurb: "Shrug off a flat share of every blow you take.",
  },
  {
    id: "bulwark",
    name: "BULWARK",
    tree: "melee",
    kind: "tank",
    maxRank: 5,
    effect: { maxHpPerRank: 0.05 },
    blurb: "Carry a deeper health pool into the horde.",
  },
];

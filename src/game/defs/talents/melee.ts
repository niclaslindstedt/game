// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MELEE — the STRENGTH tree ("Warlord"): tank or damage, scaling the held
// weapon. It runs from the crowd-shredding cleaves at the top (CLEAVING ECHO
// widens the sweep, TWIN STRIKE doubles a blow) through the pure damage
// multipliers (EXECUTIONER's crit, BERSERKER RAGE's enrage) to the tank half
// (PARRY negates a blow, SEISMIC LANDING slams on touchdown, IRONHIDE/BULWARK
// harden the hero). Most are STAT-MODIFIERS folded into a combat read site; the
// on-hit/struck procs (Cleaving Echo, Twin Strike, Parry) and the jump-landing
// (Seismic Landing) read their rank directly at the hook that owns them, so
// their `effect` bag is empty (see `src/game/talent-effects.ts`).
//
// Ordered offense → defense, the way the picker reads a tree top to bottom.

import type { TalentDef } from "./index.ts";

export const MELEE_TALENTS: TalentDef[] = [
  {
    id: "cleaving_echo",
    name: "CLEAVING ECHO",
    tree: "melee",
    kind: "damage",
    maxRank: 5,
    // A struck-proc (config `TALENTS.cleavingEcho`): a chance for a swing to
    // cleave EXTRA targets past the weapon's cap. Read once per swing in
    // `stepWeapon` (`talentCleavingEcho`); empty effect bag.
    effect: {},
    blurb: "Your swings sometimes cleave extra foes.",
  },
  {
    id: "twin_strike",
    name: "TWIN STRIKE",
    tree: "melee",
    kind: "damage",
    maxRank: 5,
    // A per-hit proc (config `TALENTS.twinStrike`): a chance for a melee blow to
    // land a second time (a half-damage echo, full at rank 5). Read in
    // `meleeSweep` (`talentTwinStrike`); empty effect bag.
    effect: {},
    blurb: "Your blows sometimes strike twice.",
  },
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
    id: "parry",
    name: "PARRY",
    tree: "melee",
    kind: "tank",
    maxRank: 5,
    // A struck-proc (config `TALENTS.parry`): a chance to fully negate an enemy
    // MELEE blow, with a rank-5 riposte that bills a share back. Read in the
    // struck path (`talentParry`); empty effect bag.
    effect: {},
    blurb: "Turn aside enemy blows — and, mastered, strike back.",
  },
  {
    id: "seismic_landing",
    name: "SEISMIC LANDING",
    tree: "melee",
    kind: "damage",
    maxRank: 5,
    // A jump-landing proc (config `TALENTS.seismic`): touching down slams the
    // ground, damaging and knocking back everything in reach. Read on the `land`
    // event (`talentSeismic`); empty effect bag.
    effect: {},
    blurb: "Your jump landings shake the ground and fling foes back.",
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

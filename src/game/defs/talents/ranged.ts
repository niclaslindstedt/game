// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RANGED — the DEXTERITY tree ("Windrunner"): damage, distance control, and the
// mobility that used to be the SPEED stat. These are the tree's stat-modifier
// talents; the proc/mobility talents (Piercing Shot, Volley, Concussive/
// Crippling Rounds, Spring Heels) extend it later.

import type { TalentDef } from "./index.ts";

export const RANGED_TALENTS: TalentDef[] = [
  {
    id: "deadeye",
    name: "DEADEYE",
    tree: "ranged",
    kind: "damage",
    maxRank: 5,
    // The ranged mirror of Executioner — crit bonuses land on ranged shots
    // only (the runtime gates them by tree = weapon class).
    effect: { critChancePerRank: 0.03, critDamagePerRank: 0.15 },
    blurb: "Ranged shots crit more often, and harder.",
  },
  {
    id: "wind_runner",
    name: "WIND RUNNER",
    tree: "ranged",
    kind: "mobility",
    maxRank: 5,
    // The SPEED stat's successor: mobility is now a ranged-tree talent.
    effect: { moveSpeedPerRank: 0.04 },
    blurb: "Move faster — the ranged tree's identity.",
  },
  {
    id: "evasion",
    name: "EVASION",
    tree: "ranged",
    kind: "survival",
    maxRank: 5,
    effect: { dodgePerRank: 0.03 },
    blurb: "Slip more incoming blows entirely.",
  },
];

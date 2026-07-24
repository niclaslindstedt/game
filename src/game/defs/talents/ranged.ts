// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RANGED — the DEXTERITY tree ("Windrunner"): damage, distance control, and the
// mobility that used to be the SPEED stat. It opens on shot-shaping damage
// (PIERCING SHOT punches through the line, DEADEYE crits), turns to distance
// control (CONCUSSIVE ROUNDS shove, CRIPPLING SHOT slow), and closes on
// mobility and survival (WIND RUNNER's speed, SPRING HEELS' jumps, EVASION's
// dodge, VOLLEY's extra shots). DEADEYE / WIND RUNNER / EVASION are
// STAT-MODIFIERS folded into a read site; the shot procs (Piercing, Concussive,
// Crippling, Volley) and the jump/dodge kickers (Spring Heels, Evasion's rank-5
// burst) read their rank directly at the hook that owns them, so their `effect`
// bag is empty (see `src/game/talent-effects.ts`).
//
// Ordered offense → mobility/survival, the way the picker reads a tree.

import type { TalentDef } from "./index.ts";

export const RANGED_TALENTS: TalentDef[] = [
  {
    id: "piercing_shot",
    name: "PIERCING SHOT",
    tree: "ranged",
    kind: "damage",
    maxRank: 5,
    // A shot modifier (config `TALENTS.piercing`): the hero's shots punch
    // through extra bodies at a rank-softened falloff. Read in `stepWeapon`
    // (`talentPiercing`); empty effect bag.
    effect: {},
    blurb: "Your shots punch through foes in a line.",
  },
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
    id: "concussive_rounds",
    name: "CONCUSSIVE ROUNDS",
    tree: "ranged",
    kind: "control",
    maxRank: 5,
    // A shot proc (config `TALENTS.concussive`): a chance to shove the struck
    // foe straight back. Read on the hero's surviving ranged hits
    // (`talentConcussive`); empty effect bag.
    effect: {},
    blurb: "Your shots sometimes knock foes back.",
  },
  {
    id: "crippling_shot",
    name: "CRIPPLING SHOT",
    tree: "ranged",
    kind: "control",
    maxRank: 5,
    // A shot proc (config `TALENTS.crippling`): a chance to slow the struck foe
    // (the engine's chill fields). Read on the hero's ranged hits
    // (`talentCrippling`); empty effect bag.
    effect: {},
    blurb: "Your shots sometimes slow foes to a hobble.",
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
    id: "spring_heels",
    name: "SPRING HEELS",
    tree: "ranged",
    kind: "mobility",
    maxRank: 5,
    // A jump modifier (config `TALENTS.springHeels`): higher, longer jumps, with
    // a rank-5 cheaper takeoff. Read in `stepPlayer` (`talentSpringHeels`); empty
    // effect bag.
    effect: {},
    blurb: "Jump higher and farther — and, mastered, cheaper.",
  },
  {
    id: "evasion",
    name: "EVASION",
    tree: "ranged",
    kind: "survival",
    maxRank: 5,
    // The base dodge scales per rank via the effect bag; the rank-5 speed burst
    // on a dodge reads its rank directly (`talentEvasionBurst`).
    effect: { dodgePerRank: 0.03 },
    blurb: "Slip more incoming blows — mastered, and dart away.",
  },
  {
    id: "volley",
    name: "VOLLEY",
    tree: "ranged",
    kind: "damage",
    maxRank: 5,
    // A trigger proc (config `TALENTS.volley`): a chance for one pull to loose
    // extra projectiles in a spread. Read once per pull in `stepWeapon`
    // (`talentVolley`); empty effect bag.
    effect: {},
    blurb: "Your shots sometimes loose a spread of extra rounds.",
  },
];

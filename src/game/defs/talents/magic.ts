// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MAGIC — the INTELLIGENCE tree ("Archon"): weapon-independent, always on. Its
// signature is the always-on CONJURATIONS — a deep-INT hero stands in the horde
// while ranked-up spells do the killing, no weapon and no button. All five
// conjurations feed the granted-spell machinery items already carry (`conjure`
// → `syncItemSpells`), so they run, render, and sound off `player.itemSpells`
// like a legendary's forever powers and STACK with one. The tree closes on its
// defensive answers: Frost Nova (freeze the swarm the instant it bites), Arcane
// Retribution (turn a blow back on its owner), and Mage Armor (a flat ward).
//
// Ordered offense → defense, the way the picker reads a tree top to bottom.

import type { TalentDef } from "./index.ts";

export const MAGIC_TALENTS: TalentDef[] = [
  {
    id: "orbiting_flames",
    name: "ORBITING FLAMES",
    tree: "magic",
    kind: "offense",
    maxRank: 5,
    // Feeds the ORBIT granted spell (config `SPELL.orbit`): rank adds orbs and
    // per-tick bite, INT quickens the sweep and deepens the burn. Always on,
    // weapon-independent — the magic tree's Vampire-Survivors core.
    effect: { conjure: "orbit" },
    blurb: "Rings of fire orbit you, burning what they touch.",
  },
  {
    id: "storm_call",
    name: "STORM CALL",
    tree: "magic",
    kind: "offense",
    maxRank: 5,
    // Feeds the STORM granted spell (config `SPELL.storm`): rank raises the bolt
    // and quickens the strikes, INT quickens them further. Hunts the nearest
    // foe on its own, hands-free.
    effect: { conjure: "storm" },
    blurb: "Lightning strikes the nearest foe, again and again.",
  },
  {
    id: "seeker_orbs",
    name: "SEEKER ORBS",
    tree: "magic",
    kind: "offense",
    maxRank: 5,
    // Feeds the SEEKER granted spell (config `SPELL.seeker`): homing arcane orbs
    // spawn on an interval, curve onto the nearest foe, and BURST on impact.
    // Rank adds orbs, bite, and blast; INT quickens the cadence.
    effect: { conjure: "seeker" },
    blurb: "Homing orbs hunt the horde and burst on impact.",
  },
  {
    id: "immolation_aura",
    name: "IMMOLATION AURA",
    tree: "magic",
    kind: "offense",
    maxRank: 5,
    // Feeds the IMMOLATION granted spell (config `SPELL.immolation`): a burning
    // ring scorches everything adjacent on a fast tick. Rank widens the ring and
    // deepens the burn; INT quickens the tick. Stand in the swarm and it melts.
    effect: { conjure: "immolation" },
    blurb: "A ring of fire sears everything that closes on you.",
  },
  {
    id: "arcane_singularity",
    name: "ARCANE SINGULARITY",
    tree: "magic",
    kind: "offense",
    maxRank: 5,
    // Feeds the SINGULARITY granted spell (config `SPELL.singularity`): a vortex
    // collapses on the nearest cluster every interval, dragging it into a crush.
    // Rank deepens the crush, widens the reach and pull, and quickens the cadence.
    effect: { conjure: "singularity" },
    blurb: "A vortex drags the swarm together and crushes it.",
  },
  {
    id: "frost_nova",
    name: "FROST NOVA",
    tree: "magic",
    kind: "defense",
    maxRank: 5,
    // A STRUCK proc (config `TALENTS.frostNova`): the blow that lands on the hero
    // freezes the foes around him solid, on an internal cooldown. Rank widens the
    // ring, lengthens the freeze, and shortens the reset. No effect-bag term — the
    // struck path reads its rank directly (`applyFrostNova`).
    effect: {},
    blurb: "When struck, freeze the foes around you solid.",
  },
  {
    id: "arcane_retribution",
    name: "ARCANE RETRIBUTION",
    tree: "magic",
    kind: "defense",
    maxRank: 5,
    // Reflect a growing share of every blow back at its owner (struck path →
    // `applyRetribution`, resolved after the enemy pass).
    effect: { reflectPerRank: 0.1 },
    blurb: "Turn a share of every blow back on the attacker.",
  },
  {
    id: "mage_armor",
    name: "MAGE ARMOR",
    tree: "magic",
    kind: "defense",
    maxRank: 5,
    // A flat magic ward. Folded into the same flat damage cut as Ironhide at the
    // player-damage choke point (`talentDamageReduction`); its own read-site
    // field (`magicReductionPerRank`) keeps the magic mitigation legible.
    effect: { magicReductionPerRank: 0.03 },
    blurb: "A magic ward softens every blow you take.",
  },
];

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MAGIC — the INTELLIGENCE tree ("Archon"): weapon-independent, always on. Its
// signature is the always-on CONJURATIONS — a deep-INT hero stands in the horde
// while ranked-up spells do the killing, no weapon and no button. Orbiting
// Flames and Storm Call feed the granted-spell machinery items already carry
// (`conjure` → `syncItemSpells`), so they run, render, and sound exactly like a
// legendary's forever orbs / storm cell, and stack with one. The remaining
// conjurations (Seeker Orbs, Immolation, Arcane Singularity) and the defensive
// procs (Frost Nova, Arcane Retribution) extend the tree later; Mage Armor is
// its pure stat-modifier ward.

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
    id: "mage_armor",
    name: "MAGE ARMOR",
    tree: "magic",
    kind: "defense",
    maxRank: 5,
    // A flat magic ward. Folded into the same flat damage cut as Ironhide for
    // now; it gains a shimmer-shell FX and its own read when the magic tree
    // fills out.
    effect: { magicReductionPerRank: 0.03 },
    blurb: "A magic ward softens every blow you take.",
  },
];

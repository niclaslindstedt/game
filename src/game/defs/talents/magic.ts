// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MAGIC — the INTELLIGENCE tree ("Archon"): weapon-independent, always on. Its
// signature will be the always-on conjurations (Orbiting Flames, Storm Call,
// Seeker Orbs, Immolation, Arcane Singularity) and the defensive procs (Frost
// Nova, Arcane Retribution); until those land the tree holds only its single
// pure stat-modifier, Mage Armor, and a caster build leans on the cast-spell
// system that runs alongside.

import type { TalentDef } from "./index.ts";

export const MAGIC_TALENTS: TalentDef[] = [
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

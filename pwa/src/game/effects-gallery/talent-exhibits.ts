// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The EFFECTS GALLERY's TALENTS shelf, GENERATED from the talent catalog: one
// exhibit per passive in all three trees (melee/Warlord, ranged/Windrunner,
// magic/Archon), trained to its max rank on a hero built for that tree. Add a
// talent and its exhibit appears on the next build — the shelf can't fall behind
// the trees (`effects_gallery_test.ts` holds that line).
//
// A talent's FX is ALWAYS ON (the magic tree's conjurations — orbiting flames,
// the storm, seeker orbs, the singularity, the immolation aura) or a PROC that
// answers a blow (the melee/ranged cues, the defensive rings). Both need a live
// fight rather than a pose, so — unlike the rest of the gallery — these exhibits
// THAW the field and arm the hero: he wades into the crowd, the crowd hits back,
// and the passive does its thing. `hp` is topped up on every re-stage
// (`STAGE_BASE`), so the demonstration can't end in his death.

import { talentDefs, type TalentDef } from "@game/core";

import { horde, type Exhibit } from "./exhibit-kit.ts";

/** The stat that governs each tree — set high so the talent's power and its
 * rank-scaled FX read at full richness (mirrors `talent-preview.mjs`). */
const TREE_STATS: Record<TalentDef["tree"], Record<string, number>> = {
  melee: { strength: 90, stamina: 40, dexterity: 20, intelligence: 20 },
  ranged: { dexterity: 90, stamina: 40, strength: 20, intelligence: 20 },
  magic: { intelligence: 90, stamina: 40, strength: 20, dexterity: 20 },
};

/** A weapon of the tree's own class, so a proc talent's cue (which rides the
 * matching weapon) actually fires. */
const TREE_WEAPONS: Record<TalentDef["tree"], string> = {
  melee: "medieval_sword",
  ranged: "nine_mm",
  magic: "ember_wand",
};

/** The tree's own name, as the talent screens read it. */
const TREE_LABELS: Record<TalentDef["tree"], string> = {
  melee: "WARLORD",
  ranged: "WINDRUNNER",
  magic: "ARCHON",
};

/** Every talent in the catalog as its own exhibit, trained to max on a hero of
 * its tree, in a live fight so both the always-on FX and the procs play. */
export function talentExhibits(): Exhibit[] {
  return Object.values(talentDefs()).map((def) => ({
    id: `talent-${def.id.replace(/_/g, "-")}`,
    label: def.name.toUpperCase(),
    blurb: def.blurb.toUpperCase(),
    group: "TALENTS" as const,
    // The talent picker draws each talent from `icon_talent_<id>`; the gallery
    // reads the same sprite, so the two can never disagree.
    icon: `icon_talent_${def.id}`,
    keywords: [
      "talent",
      "passive",
      def.tree,
      TREE_LABELS[def.tree].toLowerCase(),
      def.id.replace(/_/g, " "),
    ],
    stage: {
      // A LIVE fight: the pose is lifted and the hero is armed, because a proc
      // needs a blow to answer and an aura needs something to burn.
      freeze: false,
      disarmed: false,
      weapon: TREE_WEAPONS[def.tree],
      stats: TREE_STATS[def.tree],
      talents: { [def.id]: def.maxRank },
      spawns: horde(14, 30, 120),
    },
    showMs: 1600,
  }));
}

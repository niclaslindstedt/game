// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Presentation for the three passive talent trees. The engine defines what a
// tree IS (`defs/talents/index.ts`: which stat earns its points, which talents
// live in it); what it is CALLED and what colour it reads in is the app's
// business — the same split `tiers.ts` makes for the rarity ladder.
//
// It sits in its own module rather than inside the picker that draws it because
// the LIBRARY names the trees too (pwa/scripts/library/model-talents.mjs), and a
// build script cannot import a React component. A second copy of these four
// strings would drift a shade — and a persona — at a time.
//
// Its only import is a TYPE, so a plain `node` script loads it as-is.

import type { TalentClass } from "@game/core";

/** A tree's display persona and accent. */
export type TalentTreeLook = {
  /** The name the picker heads the tree with. */
  title: string;
  /** The line above it — which stat's point is being spent. */
  kicker: string;
  /** The tree's own colour. */
  accent: string;
  /** The darker seat that colour is set against. */
  deep: string;
};

export const TREE_LOOK: Record<TalentClass, TalentTreeLook> = {
  melee: {
    title: "WARLORD",
    kicker: "STRENGTH TALENT",
    accent: "#ff8a4c",
    deep: "#7a2a12",
  },
  ranged: {
    title: "WINDRUNNER",
    kicker: "DEXTERITY TALENT",
    accent: "#7ef0a0",
    deep: "#155036",
  },
  magic: {
    title: "ARCHON",
    kicker: "INTELLIGENCE TALENT",
    accent: "#8ab4ff",
    deep: "#1c2c6e",
  },
};

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Presentation for the item-quality ladder. The engine defines what tiers
// ARE (defs/equipment.ts); how they LOOK — the Diablo-style name colors —
// is the app's business. All four tiers are styled now even though the moon
// only drops the first two.

import type { Tier } from "@game/core";

export const TIER_COLORS: Record<Tier, string> = {
  regular: "#e6e8eb",
  magic: "#4da6ff",
  epic: "#b45df0",
  legendary: "#ffa726",
};

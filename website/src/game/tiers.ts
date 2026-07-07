// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Presentation for the item-quality ladder. The engine defines what tiers
// ARE (defs/equipment.ts); how they LOOK — the Diablo-style name colors —
// is the app's business. All four tiers are styled now even though the moon
// only drops the first two.

import type { Tier, WeaponClass } from "@game/core";

export const TIER_COLORS: Record<Tier, string> = {
  regular: "#e6e8eb",
  magic: "#4da6ff",
  epic: "#b45df0",
  legendary: "#ffa726",
};

/**
 * Weapon slots are tinted by class so the kind of weapon reads at a glance:
 * yellow for melee, red for ranged, purple for magic. Blue is reserved for a
 * future "explosive" class (the engine only ships melee/ranged/magic today).
 * `border` is the solid accent; `bg` is the same hue dimmed to sit behind a
 * pixel icon without drowning it.
 */
export const WEAPON_CLASS_COLORS: Record<
  WeaponClass,
  { border: string; bg: string }
> = {
  melee: { border: "#e8b93e", bg: "rgba(232, 185, 62, 0.3)" },
  ranged: { border: "#e0603a", bg: "rgba(224, 96, 58, 0.3)" },
  magic: { border: "#b45df0", bg: "rgba(180, 93, 240, 0.3)" },
};

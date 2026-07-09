// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Presentation for the item-quality ladder. The engine defines what tiers
// ARE (defs/equipment.ts); how they LOOK — the Diablo-style name colors —
// is the app's business. The whole ladder is styled even though unique and
// legendary items don't ship yet (their monster-level gates are plumbed).

import type { Affix, Tier, WeaponClass } from "@game/core";

export const TIER_COLORS: Record<Tier, string> = {
  regular: "#e6e8eb",
  magic: "#4da6ff",
  rare: "#ffe14d",
  // The Diablo palette: gold uniques, orange legendaries.
  unique: "#c7a25a",
  legendary: "#ffa726",
};

/**
 * The magic attributes (affixes) each get their own hue in the item card so a
 * bonus reads at a glance by what it does: orange for raw damage, gold for
 * crit, green for vitality, blue for a stat point. Shared by the rolled
 * affixes and a gear piece's baked-in bonuses, which mean the same things.
 */
export const AFFIX_COLORS: Record<Affix["kind"], string> = {
  damagePct: "#e0603a",
  crit: "#e8b93e",
  maxHp: "#5fd97a",
  stat: "#4da6ff",
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

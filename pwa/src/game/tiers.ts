// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Presentation for the item-quality ladder. The engine defines what tiers
// ARE (defs/equipment.ts); how they LOOK — the Diablo-style name colors —
// is the app's business. The whole ladder is styled even though unique and
// legendary items don't ship yet (their monster-level gates are plumbed).

import type { Affix, Tier, WeaponClass } from "@game/core";

/** Rank on the rarity ladder, low → high. Trash rides with regular at the
 * floor. Drives how much reveal spectacle a pickup card earns (PickupModal)
 * and the pickup-card rarity filter (below). */
export const TIER_RANK: Record<Tier, number> = {
  trash: 0,
  regular: 0,
  magic: 1,
  rare: 2,
  // SET (green) earns more than a rare, less than a unique.
  set: 3,
  unique: 4,
  legendary: 5,
  artifact: 6,
};

/**
 * The rarity thresholds the DISPLAY → ITEM CARDS setting cycles through,
 * lowest → highest. `regular` is the NORMAL floor (every find pops a card, the
 * shipped behaviour — trash rides with it at rank 0); each step up hides the
 * tier below it so only better loot pops the framed pickup card and the rest
 * drops to the quieter lower-corner feed. `trash` isn't offered as its own
 * threshold — nobody filters FOR trash, and it shows at NORMAL anyway.
 */
export const PICKUP_CARD_TIER_ORDER = [
  "regular",
  "magic",
  "rare",
  "set",
  "unique",
  "legendary",
  "artifact",
] as const satisfies readonly Tier[];

/** A rarity threshold for the pickup-card filter (a `Tier` minus `trash`). */
export type PickupCardTier = (typeof PICKUP_CARD_TIER_ORDER)[number];

/** How a pickup-card threshold reads in the setting's value column — the
 * rarity name, with `regular` shown as the friendlier NORMAL. */
export function pickupCardTierLabel(tier: PickupCardTier): string {
  return tier === "regular" ? "NORMAL" : tier.toUpperCase();
}

/** Whether a find of `tier` earns a framed pickup card at the chosen filter
 * `threshold` — true when it sits at or above the threshold on the ladder.
 * Below it, the find still lands in the lower-corner feed (see event-fx.ts). */
export function pickupCardVisible(
  tier: Tier,
  threshold: PickupCardTier,
): boolean {
  return TIER_RANK[tier] >= TIER_RANK[threshold];
}

export const TIER_COLORS: Record<Tier, string> = {
  // Below regular: the joke tier. Grey-brown, the color of wet cardboard.
  trash: "#8a8073",
  regular: "#e6e8eb",
  magic: "#4da6ff",
  rare: "#ffe14d",
  // The Diablo GREEN: a boss SET piece, between rare and unique.
  set: "#4ade80",
  // The Diablo palette: gold uniques, orange legendaries — and, above them,
  // the searing red-white of an ARTIFACT (the super-epic level-99 chase).
  unique: "#c7a25a",
  legendary: "#ffa726",
  artifact: "#ff5e6c",
};

/**
 * The item card's bottom line spells the quality tier out — the name color
 * alone doesn't cut it (rare yellow and unique gold sit close on a pixel
 * font). Only the magic-and-above ladder is called out; plain finds stay
 * unlabeled. Worded "<TIER> ITEM" so a magic-QUALITY find never reads as the
 * purple magic-CLASS headline ("MAGIC WEAPON").
 */
export const TIER_LABELS: Partial<Record<Tier, string>> = {
  magic: "MAGIC ITEM",
  rare: "RARE ITEM",
  set: "SET ITEM",
  unique: "UNIQUE ITEM",
  legendary: "LEGENDARY ITEM",
  artifact: "ARTIFACT",
};

/**
 * The hand-authored named drops (set/unique/legendary/artifact) SHINE: a
 * `tier-set` / `tier-unique` / `tier-legendary` / `tier-artifact` class
 * (styles.css) puts a steady halo on any `.inv-cell` grid cell and the item
 * tooltip, and a matching drop-shadow on the card's name — so a green set
 * piece reads as special before the tooltip is even raised. Returns "" for the
 * rolled tiers, so callers can append unconditionally.
 */
export function tierGlowClass(tier: Tier): string {
  return tier === "set" ||
    tier === "unique" ||
    tier === "legendary" ||
    tier === "artifact"
    ? ` tier-${tier}`
    : "";
}

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
  armor: "#9ab3c9",
  // Armor piercing — a steely cyan, the "punches through plate" hue.
  armorPen: "#6fd0d6",
  stat: "#4da6ff",
  // Scaling bonuses (uniques) share their flat cousin's hue.
  statPct: "#4da6ff",
  maxHpPct: "#5fd97a",
  // The forever powers (granted spells, procs, sure strike, knockback) read in
  // one arcane violet — the "this piece DOES something" hue.
  spell: "#b88ae8",
  proc: "#b88ae8",
  sureStrike: "#b88ae8",
  knockback: "#b88ae8",
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

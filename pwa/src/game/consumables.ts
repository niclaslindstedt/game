// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Presentation for the stacked consumables (medkits, stamina potions). The
// engine owns the rules — how kits stack per quality and heal (config MEDKIT /
// CONSUMABLES, items/consumables.ts) — this maps each medkit quality to its sprite and
// accent so the ground drop, the pickup card, and the HUD consumable dock all
// draw the same grade the same way. Indexed by MEDKIT tier (0 = lightest).

import { clamp } from "@game/lib/vec.ts";

/** Per-tier medkit sprite names — see sprites/effects/*.yaml. Index 1 is the
 * bare `medkit` so it doubles as the renderer's untiered fallback. */
export const MEDKIT_ICONS = [
  "medkit_light",
  "medkit",
  "medkit_large",
  "medkit_superior",
] as const;

/** The case-trim accent per medkit quality (matches each sprite's frame): a
 * loot-style ramp from steel through blue to gold. Drives the HUD slot's
 * quality ring and count badge so the grade reads without the tooltip. */
export const MEDKIT_TIER_COLORS = [
  "#6b7186", // LIGHT — steel
  "#e6e8eb", // MEDKIT — plain white
  "#4054bc", // LARGE — flag blue
  "#d6a842", // SUPERIOR — gold
] as const;

/** The sprite for a medkit of the given tier, clamped into range — an
 * untiered kit reads as the lightest. */
export function medkitIconFor(tier: number): string {
  const i = clamp(tier, 0, MEDKIT_ICONS.length - 1);
  return MEDKIT_ICONS[i] ?? "medkit";
}

/** The accent color for a medkit of the given tier, clamped into range. */
export function medkitColorFor(tier: number): string {
  const i = clamp(tier, 0, MEDKIT_TIER_COLORS.length - 1);
  return MEDKIT_TIER_COLORS[i] ?? "#e6e8eb";
}

/** The stamina-potion (energy-drink) sprite — one grade, one icon. */
export const STAMINA_POTION_ICON = "drink";

/** The stamina slot's accent — the drink's energetic green. */
export const STAMINA_POTION_COLOR = "#5fd97a";

/** The weapon repair-kit sprite — the same toolbox the ground drop shows. */
export const REPAIR_KIT_ICON = "repair";

/** The repair slot's accent — a toolbox bronze/amber. */
export const REPAIR_KIT_COLOR = "#d98c40";

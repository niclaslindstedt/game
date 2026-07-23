// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Mercy drops: the shared desperation ramp, the low-health and
// low-durability distress reads, and the one-rope-at-a-time rescue check
// every mercy path consults before throwing another pickup.

import { distance } from "@game/lib/vec.ts";
import { MERCY } from "../config/index.ts";
import { gearDef } from "../defs/equipment.ts";
import type { GameState, Item } from "../types/index.ts";
import { ARMOR_SLOTS } from "./class-stats.ts";
import { equipmentMaxDurability } from "./quality.ts";

/**
 * The shared shape of every MERCY DROP: a 0→1 "desperation" that a signal
 * (health, weapon durability, crowd size) turns into as it worsens. Zero at or
 * above `start`, one at or below `full`, linear between — so the drop rolls
 * that read it only need to multiply by a strength knob. One function so all
 * three ramps behave identically and stay easy to reason about.
 */
export function desperationRamp(
  fraction: number,
  start: number,
  full: number,
): number {
  if (fraction >= start) return 0;
  if (fraction <= full) return 1;
  return (start - fraction) / (start - full);
}

/** How close to death the hero is, as a 0→1 mercy-drop desperation (see
 * `desperationRamp`): 0 above `MERCY.lowHealthStart` of max hp, 1 at/under
 * `MERCY.lowHealthFull`. Drives the low-health medkit and armor boosts. */
export function lowHealthDesperation(state: GameState): number {
  const { hp, maxHp } = state.player;
  if (maxHp <= 0) return 0;
  return desperationRamp(hp / maxHp, MERCY.lowHealthStart, MERCY.lowHealthFull);
}

/** How close the hero's kit is to giving out, as a 0→1 mercy-drop
 * desperation: the WORST of the equipped weapon's and every worn armor
 * piece's durability fraction, ramped between `MERCY.lowDurabilityStart`
 * and `MERCY.lowDurabilityFull`. Unbreakable pieces (no durability) never
 * trigger it. Drives the low-durability repair boost — a repair kit mends
 * weapon and wardrobe alike, so either running dry may call one in. */
export function lowDurabilityDesperation(state: GameState): number {
  let worst = 0;
  const weapon = state.player.equipment.weapon;
  if (weapon.durability !== undefined) {
    const max = equipmentMaxDurability(weapon);
    if (max > 0) {
      worst = desperationRamp(
        weapon.durability / max,
        MERCY.lowDurabilityStart,
        MERCY.lowDurabilityFull,
      );
    }
  }
  for (const slot of ARMOR_SLOTS) {
    const piece = state.player.equipment[slot];
    if (!piece || piece.durability === undefined) continue;
    const max = equipmentMaxDurability(piece);
    if (max <= 0) continue;
    worst = Math.max(
      worst,
      desperationRamp(
        piece.durability / max,
        MERCY.lowDurabilityStart,
        MERCY.lowDurabilityFull,
      ),
    );
  }
  return worst;
}

/** The rescue pickups a mercy signal can answer with: the low-health medkit,
 * the low-durability repair kit, the empty-sprint energy drink, the
 * packed-field screen-nuke, and the low-health plated-armor pull. */
export type MercyRescue =
  "medkit" | "repair" | "drink" | "mana" | "bomb" | "armor";

/** Whether a ground item answers the given mercy signal. */
function answersMercy(item: Item, rescue: MercyRescue): boolean {
  switch (rescue) {
    case "bomb":
      return item.kind === "ability" && item.defId === "screen_nuke";
    case "armor":
      return (
        item.kind === "equipment" &&
        item.equipment.slot !== "weapon" &&
        gearDef(item.equipment.defId).armor !== undefined
      );
    default:
      return item.kind === rescue;
  }
}

/**
 * ONE ROPE AT A TIME: true while an un-collected pickup answering the given
 * mercy signal already lies within `MERCY.rescueRadius` of the hero. Every
 * mercy path checks this before throwing another rescue, so a distress signal
 * keeps at most ONE rope on the ground — a hero who ignores the medkit at his
 * feet is not buried under more, while one who left it behind out of view is
 * still thrown another. Ordinary-rain pickups count too: a rescue is a
 * rescue, however it fell.
 */
export function mercyRescueWaiting(
  state: GameState,
  rescue: MercyRescue,
): boolean {
  return state.items.some(
    (item) =>
      answersMercy(item, rescue) &&
      distance(item.pos, state.player.pos) <= MERCY.rescueRadius,
  );
}

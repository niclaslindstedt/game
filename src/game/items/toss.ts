// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE D2 TOSS — a drop bursts out of the body, arcs, and clatters down a pace
// or two away, instead of materialising under the corpse.
//
// This is the ONE funnel every drop goes through (`dropItem`), which is what
// makes the feature a two-line change at each of the twenty-odd sites that pay
// loot out. It owns three things and nothing else:
//
//   1. WHERE it lands. `item.pos` is the LANDING spot from the moment the item
//      is minted — never an interpolated position — so every rule that reads a
//      drop's position (the magnet, the pickup reach, the minimap, the bot's
//      loot run) sees where it is going to be and needs no notion of flight.
//      Callers that already scatter their own way (the unique's ±45 px, the
//      early schedule's fan) keep their spot exactly as tuned; a drop asked to
//      land ON the body it came out of gets a short `LOOT.toss.hopPx` hop so it
//      visibly leaves the corpse.
//   2. HOW LONG it flies — a floor plus a per-px term, capped, so a hop and a
//      long scatter both land while the fight is still about this kill.
//   3. WHAT it is made of (`itemVoice`) — the vocabulary the landing sound is
//      chosen by. A blade rings, mail jingles, cloth flumps, a flask clinks.
//
// The scatter is HASH-DERIVED, off the item's own id, never `state.rng()`. That
// is not a micro-optimisation: the drop ladder's rng draws are load-bearing
// (seeded runs, the simulator's A/B comparisons, every `rollEquipment` stream),
// and a presentational hop that consumed one would shift every roll after it.
// An id is already unique and already deterministic, so the same run replays
// identically with the toss as without it.

import { clamp, type Vec2 } from "@game/lib/vec.ts";

import { LOOT } from "../config/index.ts";
import { gearDef, isWeaponDef, weaponDef } from "../defs/equipment.ts";
import type { Equipment, GameState, Item, ItemVoice } from "../types/index.ts";

/** What a piece of EQUIPMENT sounds like when it hits the floor: weapons by
 * class, armor by its material (`GearDef.armorType`), the worn oddments
 * (amulets, rings, trinkets) as small metal, and a bag as the leather it is. */
function equipmentVoice(equipment: Equipment): ItemVoice {
  if (isWeaponDef(equipment.defId)) {
    const cls = weaponDef(equipment.defId).class;
    return cls === "ranged" ? "gun" : cls === "magic" ? "wand" : "blade";
  }
  if (
    equipment.slot === "amulet" ||
    equipment.slot === "ring" ||
    equipment.slot === "trinket"
  ) {
    return "trinket";
  }
  if (equipment.slot === "bag") return "leather";
  // A piece with no authored `armorType` (fixtures, legacy gear) reads as
  // cloth — the same neutral baseline the armor rules give it.
  return gearDef(equipment.defId).armorType ?? "cloth";
}

/** What `item` sounds like when it lands. */
export function itemVoice(item: Item): ItemVoice {
  switch (item.kind) {
    case "equipment":
      return equipmentVoice(item.equipment);
    case "medkit":
    case "drink":
      return "flask";
    case "repair":
      return "scrap";
    // The golden arrow and a powerup canister are both charged things, and both
    // land on a bright electric ting rather than on a weight.
    case "xp":
    case "ability":
      return "spark";
    case "story":
      return "relic";
  }
}

/** A stable 0..1 fraction off an integer id — the same id-hash idiom the
 * renderer bobs items and the title menu phases its icons with. Two draws per
 * id (`salt` 0 and 1) give an angle and a radius that don't march together. */
function hash01(id: number, salt: number): number {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How long a toss over `dist` world px stays in the air: a floor (the pure
 * pop-up-and-down of a drop that lands where it fell) plus a per-px term,
 * capped so even a long unique scatter is down while the fight is still about
 * the kill that paid it.
 */
export function tossDurationMs(dist: number): number {
  const { minMs, msPerPx, maxMs } = LOOT.toss;
  return Math.min(maxMs, minMs + dist * msPerPx);
}

/**
 * Drop `item` into the world, thrown clear of `from`.
 *
 * `item.pos` as passed is the LANDING spot the caller wants; a spot within a
 * hair of `from` gets the short `LOOT.toss.hopPx` scatter so the find visibly
 * leaves the body rather than flying straight up and back down onto it. The
 * landing is clamped inside the level like every other drop.
 *
 * Returns the item, so a caller that wants to keep hold of it (the mercy
 * drops, which then fly it in on an angel instead) can chain.
 */
export function dropItem(state: GameState, item: Item, from: Vec2): Item {
  const dx = item.pos.x - from.x;
  const dy = item.pos.y - from.y;
  if (Math.hypot(dx, dy) < 1) {
    const angle = hash01(item.id, 0) * Math.PI * 2;
    // sqrt keeps the landing spots evenly spread over the disc instead of
    // bunched at its centre — the same rule any point-in-circle pick needs.
    const reach = Math.sqrt(hash01(item.id, 1)) * LOOT.toss.hopPx;
    item.pos = {
      x: clamp(from.x + Math.cos(angle) * reach, 16, state.level.width - 16),
      y: clamp(from.y + Math.sin(angle) * reach, 16, state.level.height - 16),
    };
  }
  const dist = Math.hypot(item.pos.x - from.x, item.pos.y - from.y);
  const totalMs = tossDurationMs(dist);
  item.toss = { from: { ...from }, ms: totalMs, totalMs };
  state.items.push(item);
  return item;
}

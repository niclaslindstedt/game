// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The LIVE hero's paper doll — the same stack `paper-doll.ts` builds for a saved
// hero, but posed from a running `GameState`.
//
// Held apart from its neighbour because of one field: the body sprite comes from
// `playerAppearance`, which asks the level and the hero's story items whether he
// is in the EVA suit. That reaches the level catalog and the story defs — fine
// inside a run, but the menus dress heroes too (the roster portraits, from a
// bare `Loadout`) and have no business downloading a map to do it. The shared
// geometry and the data-URL cache stay in `paper-doll.ts`.

import { localHero } from "./local-seat.ts";
import {
  type GameState,
  type Player,
  gearDef,
  playerAppearance,
  weaponDef,
} from "@game/core";

import {
  HELD_DX,
  HELD_DY,
  LEFT_POINTING_ICONS,
  offhandDollLayer,
  WORN_ORDER,
  type DollFrame,
  type DollLayer,
} from "./paper-doll.ts";

/**
 * The dressed player as an ordered sprite stack for one pose: body, worn
 * armor overlays, then the held weapon. Layers are atlas names — a missing
 * sprite (unknown def, stale save) degrades to "not drawn" downstream.
 *
 * The worn armor always draws — it sits flat on the body and reads correctly
 * in every pose. `opts.weapon` (default true) drives the developer CHARACTER
 * WEAPON flag: pass `false` to drop only the held weapon, leaving the hero in
 * his armor but empty-handed. The held weapon is the hard part to get right
 * (posing/swinging it convincingly), so only it is gated. The field renderer
 * honors the flag; the DOM avatars keep the weapon on.
 */
export function playerDollLayers(
  state: GameState,
  frame: DollFrame,
  opts: { weapon?: boolean; hero?: Player } = {},
): DollLayer[] {
  const layers: DollLayer[] = [
    { sprite: `${playerAppearance(state)}_${frame}`, dx: 0, dy: 0 },
  ];
  // WHOSE doll defaults to the local seat's — the one-hero case and every
  // existing caller. A party frame or a field pass drawing a TEAMMATE names
  // the hero instead (worn equipment is public in the replication split, so a
  // client can dress every seat).
  const equipment = (opts.hero ?? localHero(state)).equipment;
  for (const slot of WORN_ORDER) {
    const piece = equipment[slot];
    if (!piece) continue;
    // Feet tuck out of sight mid-jump; legs hold the frame-0 columns there.
    if (slot === "feet" && frame === "jump") continue;
    const def = gearDef(piece.defId);
    // Grade variants share their normal ancestor's generated overlay.
    const base = def.gradeBase ?? def.id;
    const suffix =
      slot === "legs" || slot === "feet"
        ? `_${frame === "jump" ? "0" : frame}`
        : "";
    layers.push({ sprite: `worn_${base}${suffix}`, dx: 0, dy: 0 });
  }
  // The second arm, over the armor: a shield draws, a bag rides behind him.
  const offhand = offhandDollLayer(equipment.offhand);
  if (offhand) layers.push(offhand);
  if (opts.weapon === false) return layers;
  // An iconless weapon def is the EMPTY HAND, and a hero holding nothing is
  // drawn holding nothing — see the same guard in `paper-doll.ts`.
  const icon = weaponDef(equipment.weapon.defId).icon;
  if (!icon) return layers;
  layers.push({
    sprite: icon,
    dx: HELD_DX,
    dy: HELD_DY,
    flip: LEFT_POINTING_ICONS.has(icon),
    weapon: true,
  });
  return layers;
}

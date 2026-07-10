// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's paper-doll: which sprites, stacked in which order, show the
// hero WITH everything he currently wears and wields. One source of truth
// shared by the in-game renderer (render.ts) and the DOM avatars
// (GameScreen's HUD button, InventoryPanel's portrait), so the character and
// his portraits always dress identically and line up pixel-for-pixel.
//
// Worn-armor overlays are generated per gear def by the asset pipeline
// (`worn_<defId>` — see website/scripts/asset-tools/worn.mjs) on the shared
// 16×16 hero body plan, so every layer draws at the body's own origin. The
// held weapon is the def's inventory icon anchored at the hero's hand — the
// icons are drawn as diagonal "held" items (grip lower-left), which is
// exactly the pose a sidearm-scale sprite needs.

import {
  type ArmorSlot,
  type GameState,
  gearDef,
  playerAppearance,
  weaponDef,
} from "@game/core";

import { composeDataUrl, type ComposeLayer } from "@ui/lib/atlas.ts";

import { spriteByName, type Sprites } from "./assets.ts";

/** One sprite of the dressed player, offset from the body's top-left. */
export type DollLayer = {
  sprite: string;
  dx: number;
  dy: number;
  /** Mirror this layer in place (icons drawn pointing left). */
  flip?: boolean;
};

/** The pose being drawn: the two stride frames or the airborne tuck. */
export type DollFrame = "0" | "1" | "jump";

// Body slots in paint order: trousers first, boots over their hems, the
// chest piece over the waistband, headgear last.
const WORN_ORDER: ArmorSlot[] = ["legs", "feet", "chest", "head"];

// Where the held weapon's 12×12 icon anchors on the 16×16 body: the grip
// corner sits at the hero's leading hand, blade/barrel rising past the
// shoulder. Tuned on the paper-doll preview sheet — change with eyes on it.
const HELD_DX = 9;
const HELD_DY = 2;

// Icons drawn pointing LEFT (the pistol family and its kin) — mirrored so
// the business end leads in the facing direction like every other icon.
// Keyed by icon name so palette-swap variants inherit their base's flip.
const LEFT_POINTING_ICONS = new Set([
  "icon_flare_gun",
  "icon_longbow",
  "icon_nine_mm",
  "icon_overclocked_laser",
  "icon_prototype_laser",
  "icon_retro_raygun",
  "icon_service_revolver",
  "icon_smart_pistol",
]);

/**
 * The dressed player as an ordered sprite stack for one pose: body, worn
 * armor overlays, then the held weapon. Layers are atlas names — a missing
 * sprite (unknown def, stale save) degrades to "not drawn" downstream.
 *
 * `opts.gear` (default true) drives the developer CHARACTER GEAR flag: pass
 * `false` to strip the worn-armor overlays and held weapon down to the bare
 * body, as the hero looked before the paper-doll landed. The field renderer
 * honors the flag; the DOM avatars keep their gear on.
 */
export function playerDollLayers(
  state: GameState,
  frame: DollFrame,
  opts: { gear?: boolean } = {},
): DollLayer[] {
  const layers: DollLayer[] = [
    { sprite: `${playerAppearance(state)}_${frame}`, dx: 0, dy: 0 },
  ];
  if (opts.gear === false) return layers;
  const equipment = state.player.equipment;
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
  const icon = weaponDef(equipment.weapon.defId).icon;
  layers.push({
    sprite: icon,
    dx: HELD_DX,
    dy: HELD_DY,
    flip: LEFT_POINTING_ICONS.has(icon),
  });
  return layers;
}

/** The doll's canvas: the 16×16 body plus the held icon's overhang. */
export const DOLL_WIDTH = HELD_DX + 12;
export const DOLL_HEIGHT = 16;

const dollUrls = new Map<string, string>();

/**
 * A layer stack rendered to a standalone data URL for the DOM portraits
 * (the HUD's inventory button, the inventory panel's character sheet).
 * Cached per outfit — the sprite set is a memoized singleton, so a given
 * stack always composes to the same image.
 */
export function dollDataUrl(
  sprites: Sprites,
  layers: DollLayer[],
): string | undefined {
  const key = layers
    .map((l) => `${l.sprite}@${l.dx},${l.dy}${l.flip ? "~" : ""}`)
    .join("|");
  let url = dollUrls.get(key);
  if (!url) {
    const composed: ComposeLayer[] = [];
    for (const layer of layers) {
      const image = spriteByName(sprites, layer.sprite);
      if (image)
        composed.push({ image, dx: layer.dx, dy: layer.dy, flip: layer.flip });
    }
    if (composed.length === 0) return undefined;
    url = composeDataUrl(composed, DOLL_WIDTH, DOLL_HEIGHT);
    dollUrls.set(key, url);
  }
  return url;
}

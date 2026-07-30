// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player's paper-doll: which sprites, stacked in which order, show the
// hero WITH everything he currently wears and wields. One source of truth
// shared by the in-game renderer (render.ts) and the DOM avatars
// (GameScreen's HUD button, InventoryPanel's portrait), so the character and
// his portraits always dress identically and line up pixel-for-pixel.
//
// Worn-armor overlays are generated per gear def by the asset pipeline
// (`worn_<defId>` — see scripts/asset-tools/worn.mjs) on the shared
// 16×16 hero body plan, so every layer draws at the body's own origin. The
// held weapon is the def's inventory icon anchored at the hero's hand — the
// icons are drawn as diagonal "held" items (grip lower-left), which is
// exactly the pose a sidearm-scale sprite needs. Callers pass `weapon` to
// include the held weapon layer (the field hero and the HUD/inventory avatars
// all draw it).
//
// This module dresses a SAVED hero — a `Loadout`, which is all the roster and
// the menus ever have. Dressing a LIVE hero (a `GameState`, whose costume also
// depends on the level and the story items he is carrying) lives next door in
// `paper-doll-live.ts`, so the title screen's portraits don't pull the level
// catalog in behind them; the geometry both share is exported from here.

import { type ArmorSlot, type Loadout, gearDef, weaponDef } from "@game/menu";

import { composeDataUrl, type ComposeLayer } from "@ui/lib/atlas.ts";

import { spriteByName, type Sprites } from "./assets.ts";
import { drawCoatedLayers, drawCoatedSprite } from "./render/hero-coat.ts";
// The LADDER, not `game-screen/hero-soak.ts`: the roster portraits dress a saved
// hero from here, so this module is on the app's STARTUP PATH and must not reach
// anything that names a `GameState` (see render/soak-ladder.ts).
import {
  NO_SOAK,
  bodyCoat,
  weaponCoat,
  type CoatLayer,
  type HeroSoak,
} from "./render/soak-ladder.ts";

/** One sprite of the dressed player, offset from the body's top-left. */
export type DollLayer = {
  sprite: string;
  dx: number;
  dy: number;
  /** Mirror this layer in place (icons drawn pointing left). */
  flip?: boolean;
  /** The held weapon layer — the field renderer pivots this one about the
   * shoulder to swing it on attack. */
  weapon?: boolean;
};

/** The pose being drawn: the two stride frames or the airborne tuck. */
export type DollFrame = "0" | "1" | "jump";

// Body slots in paint order: trousers first, boots over their hems, the
// chest piece over the waistband, headgear last.
export const WORN_ORDER: ArmorSlot[] = ["legs", "feet", "chest", "head"];

/**
 * The SECOND ARM's overlay, drawn after the armor and before the held weapon —
 * whatever is in that arm covers the breastplate it is held in front of, and is
 * itself in front of nothing.
 *
 * BOTH kinds draw. A build choice the player cannot see on his own hero is one
 * he has to go and read a screen to remember making, so a shield rides raised
 * and broad and a bag slung low and small (`asset-tools/worn.mjs`), in the
 * piece's OWN colours — one glance says which lane this hero took.
 */
export function offhandDollLayer(
  piece: { defId: string; slot: string } | null | undefined,
): DollLayer | null {
  if (!piece || (piece.slot !== "shield" && piece.slot !== "bag")) return null;
  const def = gearDef(piece.defId);
  // Grade variants share their normal ancestor's generated overlay.
  return { sprite: `worn_${def.gradeBase ?? def.id}`, dx: 0, dy: 0 };
}

// Where the held weapon's 12×12 icon anchors on the 16×16 body: the grip
// corner sits at the hero's leading hand, blade/barrel rising past the
// shoulder. Tuned on the paper-doll preview sheet — change with eyes on it.
export const HELD_DX = 9;
export const HELD_DY = 2;

// The grip point within the doll (the hero's leading hand), where the held
// weapon's 12×12 icon is gripped lower-left. Doll-local coords.
export const WEAPON_GRIP = { x: HELD_DX + 2, y: HELD_DY + 10 };

// The leading shoulder within the doll (top of the hero's forward arm, where
// it meets the torso — see the body plan in content/sprites/hero/*.yaml: the
// shoulder line sits around row 7–8, the arm reaching down-and-out to the grip
// at row 12). The field renderer swings the held weapon about THIS point, not
// the grip, so the whole implied arm sweeps as one — the weapon arcs on the
// end of a stretched-out arm rather than just cocking at the wrist (WEAPON
// SWING). Doll-local coords.
export const WEAPON_SHOULDER = { x: 8, y: 7 };

// Icons drawn pointing LEFT (the pistol family and its kin) — mirrored so
// the business end leads in the facing direction like every other icon.
// Keyed by icon name so palette-swap variants inherit their base's flip.
export const LEFT_POINTING_ICONS = new Set([
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
 * The dressed hero built straight from a stored build (a roster `Loadout`),
 * rather than a live `GameState` — the save-slot portraits on the LOAD GAME
 * screen, where there is no running game to read. It dresses the hero in the
 * gear the build carries (worn armor + held weapon) over the suited body, so a
 * slot shows the character as they'll drop into the next mission. A brand-new
 * hero (`null` loadout, no gear yet) shows the bare suited body.
 *
 * Unlike `playerDollLayers` the appearance can't be resolved from story/level
 * state here, so it defaults to the suited "player" look the HUD/inventory
 * portraits wear — the recognizable hero avatar.
 */
export function loadoutDollLayers(loadout: Loadout | null): DollLayer[] {
  const layers: DollLayer[] = [{ sprite: "player_0", dx: 0, dy: 0 }];
  const equipment = loadout?.equipment;
  if (!equipment) return layers;
  for (const slot of WORN_ORDER) {
    const piece = equipment[slot];
    if (!piece) continue;
    const def = gearDef(piece.defId);
    const base = def.gradeBase ?? def.id;
    const suffix = slot === "legs" || slot === "feet" ? "_0" : "";
    layers.push({ sprite: `worn_${base}${suffix}`, dx: 0, dy: 0 });
  }
  const offhand = offhandDollLayer(equipment.offhand);
  if (offhand) layers.push(offhand);
  const weapon = equipment.weapon;
  if (weapon) {
    const icon = weaponDef(weapon.defId).icon;
    layers.push({
      sprite: icon,
      dx: HELD_DX,
      dy: HELD_DY,
      flip: LEFT_POINTING_ICONS.has(icon),
      weapon: true,
    });
  }
  return layers;
}

/** The doll's canvas: the 16×16 body plus the held icon's overhang. */
export const DOLL_WIDTH = HELD_DX + 12;
export const DOLL_HEIGHT = 16;
/** The same pair as a rect — what the coat compositor sizes its scratch
 * canvases from, so every caller composes the doll at one size. */
export const DOLL_SIZE = { width: DOLL_WIDTH, height: DOLL_HEIGHT };

const dollUrls = new Map<string, string>();

/** The alpha grid a coat's strength is rounded to for the DOM portraits. The
 * field hero's coat ramps continuously; a portrait is CACHED by its layer stack,
 * so a continuous alpha would mint a fresh data URL every frame the hero bled on
 * anything. Eight steps is finer than the eye reads on a 16px bust and leaves
 * the cache a few dozen entries over a whole run. */
const COAT_ALPHA_STEPS = 8;

/**
 * A layer stack rendered to a standalone data URL for the DOM portraits
 * (the HUD's inventory button, the inventory panel's character sheet).
 * Cached per outfit — the sprite set is a memoized singleton, so a given
 * stack always composes to the same image.
 *
 * `soak` is the blood he is wearing (`game-screen/hero-soak.ts`), soaked into
 * the body and the weapon exactly as the field renderer does it — because a hero
 * drenched to the visor on the field and pristine in his own inventory portrait
 * is the feature contradicting itself on the same screen. A saved hero on the
 * roster has no run behind him and passes none.
 */
export function dollDataUrl(
  sprites: Sprites,
  layers: DollLayer[],
  soak: HeroSoak = NO_SOAK,
): string | undefined {
  const step = (c: CoatLayer) => ({
    sprite: c.sprite,
    alpha: Math.round(c.alpha * COAT_ALPHA_STEPS) / COAT_ALPHA_STEPS,
  });
  const body = bodyCoat(soak).map(step);
  const held = weaponCoat(soak).map(step);
  const key = [
    ...layers.map((l) => `${l.sprite}@${l.dx},${l.dy}${l.flip ? "~" : ""}`),
    ...[...body, ...held].map((c) => `+${c.sprite}*${c.alpha}`),
  ].join("|");
  let url = dollUrls.get(key);
  if (!url) {
    if (body.length > 0 || held.length > 0) {
      url = coatedDollUrl(sprites, layers, body, held);
      if (!url) return undefined;
    } else {
      const composed: ComposeLayer[] = [];
      for (const layer of layers) {
        const image = spriteByName(sprites, layer.sprite);
        if (image)
          composed.push({
            image,
            dx: layer.dx,
            dy: layer.dy,
            flip: layer.flip,
          });
      }
      if (composed.length === 0) return undefined;
      url = composeDataUrl(composed, DOLL_WIDTH, DOLL_HEIGHT);
    }
    dollUrls.set(key, url);
  }
  return url;
}

/** The bloodied portrait: the body soaked through the shared coat compositor,
 * then the held weapon over it — the very order the field renderer draws in, so
 * the two can't drift. */
function coatedDollUrl(
  sprites: Sprites,
  layers: DollLayer[],
  coat: CoatLayer[],
  held: CoatLayer[],
): string | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = DOLL_WIDTH;
  canvas.height = DOLL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.imageSmoothingEnabled = false;
  const body = layers.filter((l) => !l.weapon);
  drawCoatedLayers(ctx, sprites, body, coat, DOLL_SIZE);
  let drawn = body.length > 0;
  for (const layer of layers) {
    if (!layer.weapon) continue;
    const image = spriteByName(sprites, layer.sprite);
    if (!image) continue;
    drawCoatedSprite(
      ctx,
      sprites,
      image,
      layer.dx,
      layer.dy,
      layer.flip ?? false,
      held,
    );
    drawn = true;
  }
  return drawn ? canvas.toDataURL() : undefined;
}

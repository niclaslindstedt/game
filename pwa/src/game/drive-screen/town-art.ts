// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PUTTING A BUILDING TOGETHER — the compositor that turns a planned piece of
// town (`src/game/drive/town-plan.ts`) into one picture and keeps it.
//
// A HOUSE IS AN ASSEMBLY, NOT A PICTURE, which is exactly what the hero's own
// car already is (`render/vehicles.ts` stacks six panels and two wheels). The
// reason is the same in both places: the COMBINATIONS are the point. A shell in
// three colourways, four faces on every hole, a door and a garage door off their
// own rosters, a porch, a sign and up to three decals is a number with a lot of
// digits in it — baking those into the atlas is a few hundred grids to buy what
// forty lines of `drawImage` give away, and the atlas is a shared budget.
//
// SO IT IS BAKED ONCE PER LOOK, NOT PER BUILDING. The cache key is the plan's
// own `key`, which names the STACK rather than the site — two identical semis a
// mile apart are one canvas, and a drive that runs the same road twice pays for
// none of it the second time. A leg holds a few hundred distinct looks, each a
// canvas about 60x40, so the whole town is well under a megabyte of backing
// store and the hot loop is one blit per building.
//
// AND IT IS DROPPED WITH THE ATLAS. `ensureTownArt` compares the `Sprites`
// instance the same way `ensureCaches` does — a hot reload hands the page new
// bitmaps, and a cache that outlived them would draw the old town over the new
// one until the tab was closed.

import { spriteByName, type Sprites } from "../assets.ts";
import { seatX, seatY } from "../render/shared.ts";
import { billboard } from "../render/tilt.ts";
import type { TownProp } from "@game/core";

/** Composed buildings, by the stack that makes them. */
const cache = new Map<string, HTMLCanvasElement | null>();
let cacheFor: Sprites | null = null;

/** Drop every composed building when the atlas changes under us. */
export function ensureTownArt(sprites: Sprites): void {
  if (cacheFor === sprites) return;
  cacheFor = sprites;
  cache.clear();
}

/**
 * The picture one planned piece of town makes — its layers stacked on a canvas
 * of its own size, in plan order.
 *
 * A MISSING PART IS SKIPPED RATHER THAN FATAL, which is the same call every
 * other sprite pass here makes: the alternative is a building that vanishes
 * because one decal was renamed. The content test is what catches the rename
 * (`tests/content/drive_town_test.ts` walks every name the plan can produce
 * against the shipped atlas); the renderer's job is to keep drawing.
 */
function composeTown(
  sprites: Sprites,
  prop: TownProp,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, prop.w);
  canvas.height = Math.max(1, prop.h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  let drew = false;
  for (const layer of prop.layers) {
    const art = spriteByName(sprites, layer.sprite);
    if (!art) continue;
    ctx.drawImage(art, layer.x, layer.y);
    drew = true;
  }
  return drew ? canvas : null;
}

/** …and the same, remembered. */
export function townArt(
  sprites: Sprites,
  prop: TownProp,
): HTMLCanvasElement | null {
  const cached = cache.get(prop.key);
  if (cached !== undefined) return cached;
  const built = composeTown(sprites, prop);
  cache.set(prop.key, built);
  return built;
}

/**
 * Draw one piece of town, standing on its own base.
 *
 * IT IS BILLBOARDED like every other upright thing on this road: the town is
 * scenery, but it is scenery standing in the world, and a facade drawn through
 * the tilted transform would lean with the camera while the lamp post beside it
 * did not. The anchor is the piece's own BASE rather than its centre, because
 * the buildings vary in height by a factor of three now — anchoring on centres
 * would leave the row's feet at a different level for every archetype, which is
 * the one thing about a street the eye checks without being asked.
 */
export function drawTownProp(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  prop: TownProp,
  camera: { x: number; y: number },
): void {
  const art = townArt(sprites, prop);
  if (!art) return;
  billboard(ctx, prop.x, prop.y, camera.x, camera.y, () =>
    ctx.drawImage(
      art,
      seatX(prop.x, camera.x) - Math.round(art.width / 2),
      seatY(prop.y, camera.y) - art.height + 2,
    ),
  );
}

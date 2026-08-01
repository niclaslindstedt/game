// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Per-frame render caches, all keyed off the (memoized, singleton) Sprites
// instance: a fresh instance — e.g. after a hot reload — drops everything
// (see `ensureCaches`). Everything here trades a one-time bake for cheap
// per-frame reuse: the ground layer, radial glows, enemy sprite variants,
// animated decor frames, and measured sprite widths.

import { type GameState, type TileSpec } from "@game/core";

import { spriteByName, type Sprites } from "../assets.ts";
import { groundTileName } from "./ground-tiles.ts";
import { clearRecolorCache } from "./recolor.ts";
import { clearSpriteSplitCache } from "./sprite-split.ts";
import { TILE } from "./shared.ts";
import { projectionKey, projectX, projectY } from "./tilt.ts";

let cachesFor: Sprites | null = null;

/**
 * The whole level's ground baked into one offscreen canvas. Tiles are a pure
 * function of the level def and the tile hash, so the layer never changes
 * during a run — blitting it is one draw call per frame instead of ~1,000
 * per-tile draws (each with a zone scan) re-composed every frame.
 *
 * It is baked ALREADY PROJECTED (render/tilt.ts) rather than transformed on the
 * way to the screen, and that is the difference between a floor and a crawling
 * mess. Nearest-neighbour is the only resample that keeps pixel art crisp, and
 * a nearest-neighbour squash decides WHICH rows to drop from the destination
 * offset — so transforming per frame re-picks them every time the camera moves
 * a pixel, and the ground visibly boils as the hero walks. Baked once, the
 * dropped rows are baked in too, and the per-frame blit is a plain 1:1 copy of
 * a sub-rect: the floor is as still as it was before any of this existed. It
 * also means a YAW costs nothing per frame — the diamonds are baked in, and a
 * rotation is the one resample that would look worst repeated live.
 *
 * Keyed on the PROJECTION as well as the level, so dialling either knob in the
 * developer menu re-bakes rather than blitting the old floor under a new camera.
 */
let groundCache: {
  levelId: string;
  projection: string;
  origin: { x: number; y: number };
  canvas: HTMLCanvasElement;
} | null = null;

/** Where world (0, 0) sits on a baked layer of a level this size. The projected
 * level is a diamond under a yaw, and its western corner runs to negative x —
 * this is the shove that brings the whole thing back onto the canvas.
 *
 * A WHOLE number of pixels, and that is load-bearing rather than tidy: the
 * per-frame blit lands the layer at `round(origin + project(camera))`, while
 * every body standing on it lands at `project(body) - round(project(camera))`
 * (`bodyAnchor*`, render/tilt.ts). Those two agree — the floor and the horde
 * step together, one whole pixel at a time — only while the origin adds nothing
 * of its own to the rounding. A fractional one leaves the entire cast sliding a
 * pixel back and forth over a floor that is sitting still. */
function bakeOrigin(width: number, height: number): { x: number; y: number } {
  const xs = [
    projectX(0, 0),
    projectX(width, 0),
    projectX(0, height),
    projectX(width, height),
  ];
  const ys = [
    projectY(0, 0),
    projectY(width, 0),
    projectY(0, height),
    projectY(width, height),
  ];
  // Ceil rather than round: the shove has to be at least far enough to bring
  // the diamond's western and northern corners onto the canvas.
  return { x: Math.ceil(-Math.min(...xs)), y: Math.ceil(-Math.min(...ys)) };
}

/** Where a world point lands on the baked ground layer. */
export function groundLayerPoint(
  origin: { x: number; y: number },
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  return {
    x: origin.x + projectX(worldX, worldY),
    y: origin.y + projectY(worldX, worldY),
  };
}

/**
 * A FLOOR-PLANE SPRITE, baked through the projection — the wall panels, painted
 * markings, hatches and top-down crates that belong to the ground rather than
 * standing on it (`plane: floor`, see `assets.ts`).
 *
 * Baked once per (sprite, projection) for exactly the reason the ground layer is
 * (`groundLayer` above): a projection is a squash and a turn, nearest-neighbour
 * is the only resample that keeps pixel art crisp, and a nearest-neighbour
 * resample picks WHICH rows and columns to drop from the destination offset — so
 * transforming per frame re-picks them every time the camera moves a pixel and
 * the wall visibly boils. Baked, the dropped rows are baked in too and the
 * per-frame draw is a plain 1:1 blit.
 *
 * The bake is centred on the sprite's own centre, so the caller anchors it
 * exactly as it anchored the upright art — the projection is linear, and
 * centring commutes with it.
 */
/**
 * SUPERSAMPLING FACTOR FOR EVERY PROJECTED BAKE — the one number that decides
 * whether a turned floor's edges look drawn or look broken.
 *
 * A projection is a squash and a turn, and turning pixel art has no good answer:
 * nearest-neighbour lands every source pixel on exactly one destination pixel, so
 * a 45° edge comes out as a hard staircase of single pixels, while smoothing the
 * rotation blurs the art. Neither is what the picture wants.
 *
 * Baking at N× and box-averaging down once is the answer, and it works because
 * the bake happens ONCE: the rotation is sampled N² times per destination pixel,
 * so a diagonal edge lands on a handful of intermediate tones instead of a
 * staircase — real antialiasing, on exactly the edges the projection created, and
 * nowhere else. The art's own interior is untouched, because a square-on sprite
 * downsampled from an integer upscale of itself is bit-identical to the original.
 * That last property is what makes this safe to apply unconditionally: at yaw 0
 * and pitch 1 the whole thing is a no-op by construction.
 *
 * 3 rather than 2 or 4: the staircase this exists to remove is worst on the
 * near-45° edges a yawed floor is full of, and 2× leaves those visibly stepped
 * while 4× costs nine times the bake memory for a difference nobody can see at
 * the canvas's ~422 px width. It is an INTEGER because the intermediate has to be
 * an exact multiple of the destination for the box filter to be a box filter.
 */
const BAKE_SUPERSAMPLE = 3;

/**
 * Draw `paint` into an offscreen canvas of `width`×`height`, run at
 * `BAKE_SUPERSAMPLE`× and averaged down.
 *
 * `paint` is handed a context already scaled by the factor, so it draws in
 * DESTINATION units and knows nothing about the supersampling — which is what
 * lets the two callers below keep their own arithmetic exactly as it reads.
 */
function bakeSupersampled(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement | null {
  const ss = BAKE_SUPERSAMPLE;
  const big = document.createElement("canvas");
  big.width = Math.max(1, width * ss);
  big.height = Math.max(1, height * ss);
  const bigCtx = big.getContext("2d");
  if (!bigCtx) return null;
  // Nearest-neighbour on the way UP: the source art is pixels and must stay
  // pixels at the intermediate size. All the averaging happens in the single
  // downscale below — smoothing here too would blur the art before the box
  // filter ever saw it.
  bigCtx.imageSmoothingEnabled = false;
  bigCtx.scale(ss, ss);
  paint(bigCtx);

  const out = document.createElement("canvas");
  out.width = Math.max(1, width);
  out.height = Math.max(1, height);
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  // …and smoothing ON for the one downscale, which IS the box filter.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(big, 0, 0, big.width, big.height, 0, 0, out.width, out.height);
  return out;
}

const flatCache = new Map<string, HTMLCanvasElement | null>();
let flatCacheProjection = projectionKey();

export function flatSprite(
  sprite: ImageBitmap,
  name: string,
): HTMLCanvasElement | null {
  // The whole cache is dropped when the camera knobs move rather than keyed per
  // projection: DEVELOPER → VISUALS is a pair of SLIDERS, so keying would mint a
  // canvas per sprite per pixel of drag and never let go of any of them.
  const projection = projectionKey();
  if (projection !== flatCacheProjection) {
    flatCache.clear();
    flatCacheProjection = projection;
  }
  const cached = flatCache.get(name);
  if (cached !== undefined) return cached;
  const canvas = bakeFlat(sprite);
  flatCache.set(name, canvas);
  return canvas;
}

/**
 * BAKE ONE PIECE OF FLOOR ART THROUGH THE LIVE PROJECTION — the uncached core of
 * `flatSprite`, for the passes that hold their own cache because the art they
 * lay down is not an atlas sprite: the blood grid's rungs (re-hued per gore
 * family and mirrored per tile) and the boot prints tracked out of them
 * (`render/blood-ground.ts`, `render/blood-tracks.ts`).
 *
 * Those passes each keep ONE map from their own key to the finished art, so the
 * hot loop stays a single lookup and a single blit per tile — a second cache in
 * front of this one would build a key string per blot per frame for no gain.
 * They drop their map on a projection change exactly as this module does.
 */
export function bakeFlat(
  sprite: ImageBitmap | HTMLCanvasElement,
): HTMLCanvasElement | null {
  const w = sprite.width;
  const h = sprite.height;
  // The projected footprint of the sprite's own rect, about its centre.
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [-w / 2, h / 2],
    [w / 2, h / 2],
  ] as const;
  const xs = corners.map(([x, y]) => projectX(x, y));
  const ys = corners.map(([x, y]) => projectY(x, y));
  const width = Math.max(1, Math.ceil(Math.max(...xs) - Math.min(...xs)));
  const height = Math.max(1, Math.ceil(Math.max(...ys) - Math.min(...ys)));
  // Supersampled, so the turned edges of a wall panel come out antialiased
  // instead of as a staircase of single pixels — see `bakeSupersampled`. Free of
  // any effect at yaw 0 and pitch 1, where the transform is the identity.
  return bakeSupersampled(width, height, (ctx) => {
    ctx.transform(
      projectX(1, 0),
      projectY(1, 0),
      projectX(0, 1),
      projectY(0, 1),
      width / 2,
      height / 2,
    );
    ctx.drawImage(sprite, -w / 2, -h / 2);
  });
}

/** Pre-rendered radial glows, keyed by `rgb/radius`. Loot glows pulse every
 * frame, and building a CanvasGradient per item per frame is the single most
 * expensive thing a loot-covered floor does — the pulse instead scales a
 * baked full-alpha glow via globalAlpha (identical output, both stops scale
 * linearly). */
const glowCache = new Map<string, HTMLCanvasElement>();

/** A monster's resolved sprite variants (base/hurt/wrecked/dying × 2 frames),
 * keyed by the def's sprite family — saves 1-2 string builds and up to 3
 * atlas probes per enemy per frame at horde scale. */
type EnemyFrames = [ImageBitmap, ImageBitmap];
export type EnemyVariants = {
  base: EnemyFrames;
  hurt: EnemyFrames;
  wrecked: EnemyFrames;
  dying: EnemyFrames;
};
const enemySpriteCache = new Map<string, EnemyVariants>();

/**
 * ANIMATED DECOR: a flat decor piece whose sprite name has numbered frame
 * variants in the atlas (`<name>_0`, `<name>_1`, …) cycles them on render
 * time — the conveyor belts roll (`conveyor_0..4`, each frame the belt
 * pattern one pixel further along) with zero engine involvement. A name with
 * fewer than two frames stays a static sprite. Cached per name; null =
 * "checked, not animated".
 */
const decorFramesCache = new Map<string, ImageBitmap[] | null>();
export const DECOR_FRAME_MS = 110;

export function decorFrames(
  sprites: Sprites,
  name: string,
): ImageBitmap[] | null {
  const cached = decorFramesCache.get(name);
  if (cached !== undefined) return cached;
  const frames: ImageBitmap[] = [];
  for (let i = 0; ; i++) {
    const frame = spriteByName(sprites, `${name}_${i}`);
    if (!frame) break;
    frames.push(frame);
  }
  const result = frames.length >= 2 ? frames : null;
  decorFramesCache.set(name, result);
  return result;
}

/** The width, in world units, of a sprite's non-transparent pixels — the art's
 * visible body, ignoring the transparent margin the fixed atlas cell pads it
 * with. Used to size the minion health bar to the character rather than the
 * cell. Measured once per bitmap (a getImageData scan) and cached. */
const opaqueWidthCache = new Map<ImageBitmap, number>();
export function opaqueWidth(sprite: ImageBitmap): number {
  const cached = opaqueWidthCache.get(sprite);
  if (cached !== undefined) return cached;
  const c = document.createElement("canvas");
  c.width = sprite.width;
  c.height = sprite.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return sprite.width;
  g.drawImage(sprite, 0, 0);
  const { data } = g.getImageData(0, 0, sprite.width, sprite.height);
  let min = sprite.width;
  let max = -1;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      if ((data[(y * sprite.width + x) * 4 + 3] ?? 0) > 0) {
        if (x < min) min = x;
        if (x > max) max = x;
      }
    }
  }
  const w = max >= min ? max - min + 1 : sprite.width;
  opaqueWidthCache.set(sprite, w);
  return w;
}

/**
 * The COLOUR OF THE FLOOR at a world point, as `"r, g, b"` — what a boot kicks
 * up when it lands there.
 *
 * Read off the baked ground layer rather than from a per-biome palette
 * somewhere, which is the whole point: the moon throws pale regolith, Mars
 * throws rust, and the same jump INSIDE a base throws deck grey — including on
 * a carved map, a zoned floor, and any venue added later — with nothing to
 * author and nothing that can fall out of step with the art. Averaged over a
 * few px so a landing on one dark speckle doesn't come up black, and cached per
 * tile because a hero jumping on the spot lands on the same floor every time.
 */
const groundColorCache = new Map<string, string>();
const GROUND_SAMPLE_PX = 6;
export function groundColorAt(
  state: GameState,
  sprites: Sprites,
  x: number,
  y: number,
): string {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const key = `${state.level.id}/${tx}/${ty}`;
  const cached = groundColorCache.get(key);
  if (cached !== undefined) return cached;
  const layer = groundLayer(state, sprites);
  const fallback = "150, 145, 135";
  if (!layer) return fallback;
  const ctx = layer.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  // The layer is baked PROJECTED, so a world point has to be projected onto it
  // to read the floor the boot actually landed on — sampling by raw world
  // coordinates would read the colour of ground half a map away.
  const at = groundLayerPoint(groundLayerOrigin(), x, y);
  const sx = Math.max(
    0,
    Math.min(layer.width - GROUND_SAMPLE_PX, at.x - GROUND_SAMPLE_PX / 2),
  );
  const sy = Math.max(
    0,
    Math.min(layer.height - GROUND_SAMPLE_PX, at.y - GROUND_SAMPLE_PX / 2),
  );
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  try {
    const { data } = ctx.getImageData(
      sx,
      sy,
      GROUND_SAMPLE_PX,
      GROUND_SAMPLE_PX,
    );
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) === 0) continue;
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
      n++;
    }
  } catch {
    return fallback; // a tainted or zero-sized canvas: not worth a crash
  }
  // Airborne dust catches the light from every side, so it reads a good deal
  // BRIGHTER than the floor it came off — and it has to, or a rust cloud over
  // rust ground is a cloud nobody can see. Sampled colour, pushed well up toward
  // white while keeping the floor's hue.
  const lift = (v: number) => Math.round(Math.min(255, (v / n) * 1.1 + 72));
  const color = n === 0 ? fallback : `${lift(r)}, ${lift(g)}, ${lift(b)}`;
  groundColorCache.set(key, color);
  return color;
}

/**
 * A sprite RECOLOURED to `rgb` (`"r, g, b"`), keeping its own shading.
 *
 * The dust a jump throws is authored once, in neutral greys, and tinted to
 * whatever floor it came off — which is the only way one set of puff frames can
 * serve six venues and every carved map without an artist drawing regolith,
 * rust, deck plate and sand versions of the same cloud. Multiplying the colour
 * through the art and masking back to its alpha keeps the billow's lit crown and
 * shaded skirt intact; a flat `source-in` fill would collapse it to a
 * silhouette.
 *
 * Baked once per (sprite, colour) — with the colour QUANTIZED, so a floor whose
 * every tile samples a shade apart doesn't mint a canvas per tile.
 */
const tintCache = new Map<string, HTMLCanvasElement | null>();
const TINT_STEP = 24;
export function tintedSprite(
  sprite: ImageBitmap,
  name: string,
  rgb: string,
): HTMLCanvasElement | ImageBitmap {
  const quantized = rgb
    .split(",")
    .map((v) => Math.round(Number(v.trim()) / TINT_STEP) * TINT_STEP)
    .join(",");
  const key = `${name}/${quantized}`;
  const cached = tintCache.get(key);
  if (cached !== undefined) return cached ?? sprite;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    tintCache.set(key, null);
    return sprite;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = `rgb(${quantized})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Multiply paints the whole rect, transparent pixels included — mask back to
  // the art's own alpha so the puff keeps its shape.
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(sprite, 0, 0);
  tintCache.set(key, canvas);
  return canvas;
}

/** Drop every cache when the Sprites instance changes (hot reload). */
export function ensureCaches(sprites: Sprites): void {
  if (cachesFor === sprites) return;
  cachesFor = sprites;
  groundCache = null;
  glowCache.clear();
  flatCache.clear();
  enemySpriteCache.clear();
  decorFramesCache.clear();
  groundColorCache.clear();
  tintCache.clear();
  spinCache.clear();
  // The baked halves and fragments a body comes apart into are keyed on the
  // sprite's NAME, so a fresh atlas has to drop them or a cleave would draw the
  // old art (render/sprite-split.ts).
  clearSpriteSplitCache();
  clearRecolorCache();
}

/**
 * Resolve a ground cell to its bitmap. WHICH sprite belongs there is
 * `groundTileName`'s call — the DOM-free rule the library's page backgrounds
 * read too — so this only has to turn the name into art, falling back to the
 * zone's common ground if the atlas doesn't carry it.
 */
export function groundTile(
  sprites: Sprites,
  tiles: TileSpec,
  tx: number,
  ty: number,
) {
  const name = groundTileName(tiles, tx, ty);
  return (
    spriteByName(sprites, name) ??
    spriteByName(sprites, tiles.ground.common) ??
    sprites.moon_0
  );
}

/** Where world (0, 0) sits on the CURRENT baked layer — the offset every
 * reader of the layer (the per-frame blit, the dust's colour sample) has to
 * add. Zero until a layer has been baked. */
export function groundLayerOrigin(): { x: number; y: number } {
  return groundCache?.origin ?? { x: 0, y: 0 };
}

export function groundLayer(
  state: GameState,
  sprites: Sprites,
): HTMLCanvasElement | null {
  const projection = projectionKey();
  if (
    groundCache &&
    groundCache.levelId === state.level.id &&
    groundCache.projection === projection
  ) {
    return groundCache.canvas;
  }
  const { width, height } = state.level;
  const origin = bakeOrigin(width, height);
  // The projected level's bounding box: square-on that is the level with its
  // height squashed; under a yaw it is the diamond's box, wider than the level
  // and shorter than the pair of sides that made it.
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(
    Math.max(...corners.map(([x, y]) => origin.x + projectX(x, y))),
  );
  canvas.height = Math.ceil(
    Math.max(...corners.map(([x, y]) => origin.y + projectY(x, y))),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // NEAREST-NEIGHBOUR, AND DELIBERATELY NOT SUPERSAMPLED — unlike `flatSprite`
  // above, for two independent reasons, either of which is enough.
  //
  // MEMORY: this canvas is the whole level projected. A big map bakes to roughly
  // 2400x1000; at the 3x the sprites use, the intermediate would be 7200x3000 —
  // 21 million pixels, ~86 MB — for one throwaway buffer on a phone, and larger
  // maps would walk into the browser's own canvas dimension cap.
  //
  // AND IT WOULD LOOK WORSE ANYWAY, which is the reason that would still stand
  // if the memory were free. A wall panel is a small silhouette with a dark
  // outline, so averaging its turned edges reads as a clean diagonal. The floor
  // is a TEXTURE covering the entire screen: averaging its rotation softens every
  // speckle, seam and grain rivet in it at once, and a floor whose pixels have
  // gone slightly fuzzy does not read as "nicely antialiased", it reads as the
  // one surface in the game that is out of focus. The staircase on a yawed floor
  // seam is the honest cost of turning pixel art, and the fix for it is iso-drawn
  // tile art, not a filter.
  ctx.imageSmoothingEnabled = false;
  // Bake THROUGH the projection: each tile is laid down already turned and
  // flattened, so the per-frame blit is a straight copy for ever after.
  ctx.setTransform(
    projectX(1, 0),
    projectY(1, 0),
    projectX(0, 1),
    projectY(0, 1),
    origin.x,
    origin.y,
  );
  const tilesX = Math.ceil(width / TILE);
  const tilesY = Math.ceil(height / TILE);
  // A HAIR of overlap on each tile. The projection puts tile edges on
  // fractional device pixels, and two neighbours that each round inward leave a
  // one-pixel seam of bare canvas between them — a grid of hairlines across the
  // whole floor, which is exactly the artefact the bake exists to avoid.
  const bleed = 1;
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      ctx.drawImage(
        groundTile(sprites, state.level.tiles, tx, ty),
        0,
        0,
        TILE,
        TILE,
        tx * TILE,
        ty * TILE,
        TILE + bleed,
        TILE + bleed,
      );
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  groundCache = { levelId: state.level.id, projection, origin, canvas };
  return canvas;
}

/**
 * The pixel size of the canvas a glow of `radius` bakes into — and therefore
 * the ONLY thing about that radius the bake can express, which is why it is
 * what {@link glowSprite} keys its cache on.
 *
 * **KEY ON THE SIZE, NEVER ON THE RADIUS ASKED FOR.** `glowCache` is a
 * module-level Map that `ensureCaches` only empties when the atlas instance
 * changes — i.e. never, within a session — so a caller passing a CONTINUOUS
 * radius mints a canvas per distinct float and holds it for the life of the
 * tab. That is not hypothetical: the blood cloud scaled its radius by the
 * puff's own animation clock, so every puff of every landed blow baked a fresh
 * gradient EVERY FRAME. A few minutes of killing took the tab past 280 MB, at
 * which point the browser began discarding canvas backing stores — and the
 * pixel font is a cached canvas, so every label in the game went blank while
 * the sprites (data-URL `<img>`s) kept drawing.
 *
 * Rounding to the size fixes the waste at the root: radii of 11.01 and 11.4
 * were already baking pixel-identical 24 px canvases into two cache entries.
 * A glow that PULSES should bake ONE sprite and scale it at draw time (a radial
 * gradient is scale-invariant, so the picture is the same) — but the cache
 * cannot depend on every caller remembering that.
 *
 * The cap is the other half. `BloodBlow.force` has no ceiling by design, so a
 * monstrous overkill would otherwise ask for a glow wider than the whole
 * viewport and pay half a megabyte for the privilege of drawing it offscreen.
 */
export function glowSize(radius: number): number {
  if (!Number.isFinite(radius)) return 2;
  return Math.min(GLOW_MAX_PX, Math.max(2, Math.ceil(radius * 2)));
}

/** The widest a baked glow may get, in px. Comfortably past the ~422×195 world
 * view, so nothing that fits on screen is ever clipped by it. */
const GLOW_MAX_PX = 256;

/** A soft radial glow fading `rgb` from full alpha at the center to clear at
 * `radius`, rendered once and reused. Draw with globalAlpha for the pulse, and
 * with a destination rect for a pulse in SIZE — see {@link glowSize}. */
export function glowSprite(
  rgb: string,
  radius: number,
): HTMLCanvasElement | null {
  const size = glowSize(radius);
  const key = `${rgb}/${size}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const glow = ctx.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, `rgba(${rgb}, 1)`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  glowCache.set(key, canvas);
  return canvas;
}

// ---- Spun sprites -----------------------------------------------------------

/**
 * How many turns a spun sprite is quantized into.
 *
 * A rotation is a CANVAS ALLOCATION, and the thing that wants one here is a
 * flamethrower's gout — twenty-odd particles, every one of them tumbling, sixty
 * times a second. Rotating live is how a spectacle becomes a stutter, which is
 * the same lesson `sprite-split.ts` learned about a cleave's cut angle, so the
 * same answer applies: quantize the angle into a few buckets and BAKE each one
 * once. Eight is plenty for a tumbling blob of fire — what the eye reads is that
 * it is turning, never which angle it is at.
 */
const SPIN_BUCKETS = 8;

const spinCache = new Map<string, HTMLCanvasElement | null>();

/** Which bucket `angle` (radians) falls in. */
export function spinBucket(angle: number): number {
  const turns = angle / (Math.PI * 2);
  return (
    ((Math.round(turns * SPIN_BUCKETS) % SPIN_BUCKETS) + SPIN_BUCKETS) %
    SPIN_BUCKETS
  );
}

/**
 * `sprite` turned to `bucket`'s angle, baked once and reused.
 *
 * The bake is SQUARE and sized to the sprite's own diagonal so no corner is ever
 * clipped, and the art stays centred in it — so a caller draws the result the
 * same way it would draw the original, centred on the spot, and never has to
 * know the canvas grew. Bucket 0 is the identity and hands back the sprite
 * itself rather than paying for a copy of it.
 *
 * This is the ONE place in the renderer that resamples pixel art on purpose. It
 * is affordable for exactly the reason `flatSprite`'s bake is: it happens once
 * rather than per frame. It is also only ever asked for by LIGHT — a gout's
 * flames and its smoke, which have no outline for the resample to chew up — and
 * it must stay that way: spinning a sprite with a near-black rim frays the rim,
 * which is the one thing every solid sprite in this game is built on.
 */
export function spunSprite(
  sprite: ImageBitmap,
  name: string,
  bucket: number,
): HTMLCanvasElement | ImageBitmap {
  if (bucket % SPIN_BUCKETS === 0) return sprite;
  const key = `${name}/${bucket}`;
  const cached = spinCache.get(key);
  if (cached !== undefined) return cached ?? sprite;
  const size = Math.ceil(Math.hypot(sprite.width, sprite.height));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    spinCache.set(key, null);
    return sprite;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.translate(size / 2, size / 2);
  ctx.rotate((bucket / SPIN_BUCKETS) * Math.PI * 2);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  spinCache.set(key, canvas);
  return canvas;
}

/** A gravity well's darkening funnel (three fixed stops between the core and
 * the pull rim), rendered once per (core, pull) radius pair and reused. */
export function funnelSprite(
  coreRadius: number,
  pullRadius: number,
): HTMLCanvasElement | null {
  const key = `funnel/${coreRadius}/${pullRadius}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const size = Math.max(2, Math.ceil(pullRadius * 2));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const funnel = ctx.createRadialGradient(r, r, coreRadius, r, r, pullRadius);
  funnel.addColorStop(0, "rgba(8, 6, 20, 0.55)");
  funnel.addColorStop(0.6, "rgba(20, 12, 44, 0.28)");
  funnel.addColorStop(1, "rgba(20, 12, 44, 0)");
  ctx.fillStyle = funnel;
  ctx.beginPath();
  ctx.arc(r, r, pullRadius, 0, Math.PI * 2);
  ctx.fill();
  glowCache.set(key, canvas);
  return canvas;
}

/**
 * A LIGHT SHAFT: a vertical column of `rgb` that is brightest at its foot and
 * fades out at its head, with the sides falling off too so it reads as a beam
 * of light rather than as a painted rectangle. The rarity beam standing over a
 * unique-or-better drop (see `loot-aura.ts`).
 *
 * Baked and reused for the same reason the glows are: a beam that built its two
 * gradients per item per frame would be the most expensive thing a floor full
 * of loot does. The breathing is `globalAlpha` over the baked column.
 */
export function beamSprite(
  rgb: string,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  // Keyed on the RESOLVED pixel size, never the floats asked for — same rule,
  // and same reason, as `glowSize`: this shares `glowCache`, which nothing
  // empties within a session.
  const w = Math.min(GLOW_MAX_PX, Math.max(2, Math.ceil(width)));
  const h = Math.min(GLOW_MAX_PX, Math.max(2, Math.ceil(height)));
  const key = `beam/${rgb}/${w}/${h}`;
  const cached = glowCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rise = ctx.createLinearGradient(0, canvas.height, 0, 0);
  rise.addColorStop(0, `rgba(${rgb}, 0.85)`);
  rise.addColorStop(0.45, `rgba(${rgb}, 0.34)`);
  rise.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = rise;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Feather the sides: a hard-edged column is a rectangle, however it fades
  // upward. Punching the edges out leaves a shaft with a bright core.
  ctx.globalCompositeOperation = "destination-in";
  const across = ctx.createLinearGradient(0, 0, canvas.width, 0);
  across.addColorStop(0, "rgba(0, 0, 0, 0)");
  across.addColorStop(0.5, "rgba(0, 0, 0, 1)");
  across.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  glowCache.set(key, canvas);
  return canvas;
}

export function enemySprites(sprites: Sprites, family: string): EnemyVariants {
  const cached = enemySpriteCache.get(family);
  if (cached) return cached;
  // Faithful to the old per-frame fallbacks: a missing stage variant degrades
  // to the base frame of the same index, a missing base frame to the ghost.
  const base: EnemyFrames = [
    spriteByName(sprites, `${family}_0`) ?? sprites.ghost_0,
    spriteByName(sprites, `${family}_1`) ?? sprites.ghost_0,
  ];
  const stage = (suffix: string): EnemyFrames => [
    spriteByName(sprites, `${family}${suffix}_0`) ?? base[0],
    spriteByName(sprites, `${family}${suffix}_1`) ?? base[1],
  ];
  const variants: EnemyVariants = {
    base,
    hurt: stage("_hurt"),
    wrecked: stage("_wrecked"),
    dying: stage("_dying"),
  };
  enemySpriteCache.set(family, variants);
  return variants;
}

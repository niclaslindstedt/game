// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CUTTING UP A SPRITE — the one place in the game that takes a piece of authored
// art apart, so a body can come apart as ITSELF rather than as a generic red
// puff.
//
// Two operations, and both exist for the same reason. A gib burst that threw
// only the authored gore pieces would look identical whatever it killed: a
// green alien, a white-suited cosmonaut and a rust-red rover would all burst
// into the same human meat. Shredding the victim's OWN sprite into the spray is
// what ties the mess to the thing that made it, for every mob in the game and
// every mob a MOD adds, with nothing authored per monster.
//
//   `splitSprite` — cut a bitmap in two along a line through its middle. What a
//                   blade does. The two halves come back the SAME SIZE as the
//                   source with the other side erased, which is the whole trick:
//                   the caller draws them at the body's own anchor and rotates
//                   them about the body's own centre, so nothing has to know
//                   where the cut fell. Cropping each half to its own bounds
//                   would save a few kilobytes and cost every caller a pivot.
//   `shredSprite` — cut a bitmap into a grid of fragments and keep the ones with
//                   anything in them. What a blast does. Each fragment carries
//                   the offset of where it SAT on the body, so the burst can
//                   start every piece in its own place and throw it outward from
//                   there.
//
// Both are BAKED AND CACHED, keyed on the sprite's name (never the bitmap — a
// hot reload mints new bitmaps and `clearSpriteSplitCache` drops the lot from
// `ensureCaches`). A cut is a canvas allocation and a composite; doing one per
// frame for every body on a screen-clearing kill is exactly the sort of thing
// that turns a spectacle into a stutter. The cut ANGLE is quantized into a few
// buckets for the same reason — the eye cannot tell a 3° difference in where a
// body was opened, and a continuous angle would mint a canvas per kill.

import { fract } from "./shared.ts";

/** How many distinct cut bearings a family may be baked at. Eight is a cut
 * every 45°, which is past what the eye reads on a body coming apart. */
const ANGLE_BUCKETS = 8;

/** One fragment of a shredded sprite: the art, and where on the body it sat
 * (offset from the sprite's centre, in sprite px). */
export type SpriteShred = {
  canvas: HTMLCanvasElement;
  dx: number;
  dy: number;
};

const halvesCache = new Map<
  string,
  readonly [HTMLCanvasElement, HTMLCanvasElement] | null
>();
const shredCache = new Map<string, readonly SpriteShred[]>();

/** Drop every baked cut. Called from `ensureCaches` when the atlas changes. */
export function clearSpriteSplitCache(): void {
  halvesCache.clear();
  shredCache.clear();
}

/** The bucket `angle` (radians) rounds into — the key the bake is cached on. */
function angleBucket(angle: number): number {
  const turns = angle / (Math.PI * 2);
  return (
    ((Math.round(turns * ANGLE_BUCKETS) % ANGLE_BUCKETS) + ANGLE_BUCKETS) %
    ANGLE_BUCKETS
  );
}

/** The bearing a bucket actually bakes at, so the caller can rotate its halves
 * to match the cut the art was given rather than the one it asked for. */
export function bucketAngle(angle: number): number {
  return (angleBucket(angle) / ANGLE_BUCKETS) * Math.PI * 2;
}

function blank(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/**
 * Cut `sprite` in two along the line through its centre at `angle`.
 *
 * Returns `[left, right]` — the halves lying to either side of the cut, each on
 * a canvas the size of the source with the other half punched out, so both are
 * drawn at the body's own anchor and rotate about the body's own centre. Null
 * when a canvas can't be had (a headless context); every caller falls back to
 * the plain corpse, which is the same fallback the MATURE CONTENT switch takes.
 *
 * The cut is quantized (`ANGLE_BUCKETS`) and the halves are baked once per
 * (sprite, bucket).
 */
export function splitSprite(
  sprite: ImageBitmap,
  name: string,
  angle: number,
): readonly [HTMLCanvasElement, HTMLCanvasElement] | null {
  const key = `${name}/${angleBucket(angle)}`;
  const cached = halvesCache.get(key);
  if (cached !== undefined) return cached;
  const baked = bucketAngle(angle);
  const halves: HTMLCanvasElement[] = [];
  for (const side of [-1, 1]) {
    const made = blank(sprite.width, sprite.height);
    if (!made) {
      halvesCache.set(key, null);
      return null;
    }
    const { canvas, ctx } = made;
    ctx.drawImage(sprite, 0, 0);
    // Erase everything on the far side of the cut. In the cut's own frame the
    // line IS the x-axis, so one `fillRect` over a rectangle bigger than the
    // sprite takes exactly one half away — and a jagged tear is neither wanted
    // nor affordable here: the wound art (`cleave_wound`) is what makes the cut
    // look torn, drawn along the seam by the caller.
    const reach = sprite.width + sprite.height;
    ctx.globalCompositeOperation = "destination-out";
    ctx.translate(sprite.width / 2, sprite.height / 2);
    ctx.rotate(baked);
    ctx.fillStyle = "#000";
    ctx.fillRect(-reach, side > 0 ? 0 : -reach, reach * 2, reach);
    halves.push(canvas);
  }
  const pair = [halves[0]!, halves[1]!] as const;
  halvesCache.set(key, pair);
  return pair;
}

/**
 * Cut `sprite` into a `cells`×`cells` grid and return the fragments that have
 * anything in them.
 *
 * The empty ones are dropped at bake time rather than skipped at draw time,
 * because a mob sprite is mostly transparent margin: a naive 3×3 of a 24 px
 * body throws three or four fragments of pure nothing, and a burst is counted
 * in PIECES — an invisible one reads as a piece that failed to appear.
 */
export function shredSprite(
  sprite: ImageBitmap,
  name: string,
  cells: number,
): readonly SpriteShred[] {
  const key = `${name}/${cells}`;
  const cached = shredCache.get(key);
  if (cached !== undefined) return cached;
  const shreds: SpriteShred[] = [];
  const cw = Math.max(1, Math.floor(sprite.width / cells));
  const ch = Math.max(1, Math.floor(sprite.height / cells));
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const sx = cx * cw;
      const sy = cy * ch;
      const w = cx === cells - 1 ? sprite.width - sx : cw;
      const h = cy === cells - 1 ? sprite.height - sy : ch;
      if (w <= 0 || h <= 0) continue;
      const made = blank(w, h);
      if (!made) {
        shredCache.set(key, shreds);
        return shreds;
      }
      const { canvas, ctx } = made;
      ctx.drawImage(sprite, sx, sy, w, h, 0, 0, w, h);
      if (!hasPixels(ctx, w, h)) continue;
      shreds.push({
        canvas,
        dx: sx + w / 2 - sprite.width / 2,
        dy: sy + h / 2 - sprite.height / 2,
      });
    }
  }
  shredCache.set(key, shreds);
  return shreds;
}

/** Whether anything at all was drawn into this fragment. */
function hasPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 0) > 8) return true;
    }
  } catch {
    // A tainted canvas: keep the fragment rather than lose the burst.
    return true;
  }
  return false;
}

/**
 * Pick `count` shreds out of `shreds`, seeded — which fragments of the body
 * actually fly. A burst throws a HANDFUL of the victim rather than a tidy
 * reassemblable set, so the same body bursts differently twice.
 */
export function pickShreds(
  shreds: readonly SpriteShred[],
  count: number,
  seed: number,
): readonly SpriteShred[] {
  if (shreds.length === 0) return shreds;
  const out: SpriteShred[] = [];
  for (let i = 0; i < count; i++) {
    const pick = Math.floor(
      fract((i + 1) * 7.31 + seed * 1.93) * shreds.length,
    );
    out.push(shreds[Math.min(shreds.length - 1, pick)]!);
  }
  return out;
}

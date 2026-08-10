import type { SpriteImage } from "@ui/lib/atlas.ts";
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RE-HUEING AUTHORED ART ONTO ANOTHER PALETTE — how one set of spray frames
// serves four kinds of body.
//
// The blood spray is a lot of authored art: three wound frames, four droplets,
// two chunks, three haze puffs, four floor rungs in two variants each, and the
// fringes. A ghost, a machine and a rift-thing all need the same shapes, and
// authoring four copies of every one of them would be sixty sprites that all
// have to be kept in step for ever — the exact thing the game's one set of dust
// puffs avoids by being tinted to the floor it came off.
//
// A TINT IS NOT ENOUGH HERE, and that is the whole reason this module exists
// rather than a call to `tintedSprite`. Tinting MULTIPLIES a colour through the
// art, which can only ever darken: multiply red blood by green and you get
// near-black, because red art has almost no green in it to keep. What is needed
// is a RE-HUE — throw the source's colour away, keep its SHAPE and its
// SHADING, and put both onto another ramp entirely.
//
// So each pixel's LUMINANCE picks a colour off a three-stop ramp: the darkest
// parts of the art become the family's shadow, the midtones its body colour,
// the highlights its brightest. Alpha is untouched, so every silhouette,
// every ragged edge and every deliberate speckle survives exactly as drawn —
// which is what makes a ghost's spray recognisably the SAME spray, in green.
//
// Baked once per (sprite, ramp) and dropped by `ensureCaches` with everything
// else, because a re-hue is a full pixel walk and a spray asks for its frames
// several times a frame.

/** A family's three stops, darkest first, as `"r, g, b"`. */
export type GoreRamp = readonly [string, string, string];

const cache = new Map<string, HTMLCanvasElement | null>();

/** Drop every baked re-hue. Called from `ensureCaches` when the atlas changes. */
export function clearRecolorCache(): void {
  cache.clear();
}

function parse(rgb: string): [number, number, number] {
  const [r, g, b] = rgb.split(",").map((v) => Number(v.trim()));
  return [r ?? 0, g ?? 0, b ?? 0];
}

/**
 * `sprite` re-hued onto `ramp`, keeping its shape, its shading and its alpha.
 *
 * `name` keys the bake — never the bitmap, which a hot reload replaces.
 */
export function recolorSprite(
  sprite: SpriteImage,
  name: string,
  ramp: GoreRamp,
): SpriteImage {
  const key = `${name}/${ramp.join("|")}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached ?? sprite;
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    cache.set(key, null);
    return sprite;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0);
  let image;
  try {
    image = ctx.getImageData(0, 0, sprite.width, sprite.height);
  } catch {
    // A tainted canvas: keep the original rather than lose the effect.
    cache.set(key, null);
    return sprite;
  }
  const { data } = image;
  const stops = ramp.map(parse);
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    // Rec. 601 luma — the same weighting every "how bright is this pixel"
    // question in the game uses, and the one that keeps a dark red outline
    // reading as an outline rather than as a midtone.
    const lum =
      (0.299 * (data[i] ?? 0) +
        0.587 * (data[i + 1] ?? 0) +
        0.114 * (data[i + 2] ?? 0)) /
      255;
    // Two segments between three stops, interpolated so a smooth gradient in
    // the source stays a smooth gradient rather than banding into three.
    const t = lum * 2;
    const lo = t < 1 ? 0 : 1;
    const f = t < 1 ? t : t - 1;
    const a = stops[lo]!;
    const b = stops[lo + 1]!;
    data[i] = Math.round(a[0] + (b[0] - a[0]) * f);
    data[i + 1] = Math.round(a[1] + (b[1] - a[1]) * f);
    data[i + 2] = Math.round(a[2] + (b[2] - a[2]) * f);
  }
  ctx.putImageData(image, 0, 0);
  cache.set(key, canvas);
  return canvas;
}

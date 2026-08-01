// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sprite-atlas slicing. Generic React/UI game code — lives in
// pwa/src/lib/ so it can be extracted into oss-framework once mature.

/** A sprite's source rectangle inside an atlas texture — a compact
 * `[x, y, w, h]` tuple, the shape the atlas manifest ships in (it rides the
 * app's critical-path budget, so it pays for no field names). */
export type AtlasRect = readonly [number, number, number, number];

/**
 * Slice a decoded atlas image into per-sprite bitmaps — one fetch and one
 * decode for the whole sprite set, then zero-copy handles the canvas can
 * blit directly (`drawImage` accepts an ImageBitmap wherever it accepts an
 * image element).
 */
export async function sliceAtlas<K extends string>(
  atlas: HTMLImageElement,
  rects: Record<K, AtlasRect>,
): Promise<Record<K, ImageBitmap>> {
  const entries = await Promise.all(
    (Object.entries(rects) as [K, AtlasRect][]).map(
      async ([name, [x, y, w, h]]) =>
        [name, await createImageBitmap(atlas, x, y, w, h)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<K, ImageBitmap>;
}

/** One sprite in a `composeDataUrl` stack, offset inside the canvas. */
export type ComposeLayer = {
  image: ImageBitmap;
  dx?: number;
  dy?: number;
  /** Mirror this layer horizontally in place. */
  flip?: boolean;
};

/**
 * Compose sprite layers, in order, onto one canvas — for DOM `<img>` portraits
 * assembled from several atlas sprites (a character wearing its equipment, an
 * icon with an overlay badge).
 *
 * The CANVAS rather than the data URL, because a caller may still have pixel
 * work to do on the result (measuring the silhouette, cropping a bust); a URL
 * can only be read back through an async image decode.
 */
export function composeCanvas(
  layers: ComposeLayer[],
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  for (const { image, dx = 0, dy = 0, flip } of layers) {
    if (flip) {
      ctx.save();
      ctx.translate(dx + image.width, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(image, dx, dy);
    }
  }
  return canvas;
}

/** `composeCanvas` as a data URL. */
export function composeDataUrl(
  layers: ComposeLayer[],
  width: number,
  height: number,
): string {
  return composeCanvas(layers, width, height)?.toDataURL() ?? "";
}

/**
 * Render a sliced sprite back to a standalone data URL, for the few places
 * that need a DOM `<img>` (inventory icons, dialogue portraits) rather than
 * a canvas blit.
 */
export function bitmapDataUrl(bitmap: ImageBitmap): string {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(bitmap, 0, 0);
  return canvas.toDataURL();
}

/** `#rgb` / `#rrggbb` → `[r, g, b]`; unparseable colors fall back to white. */
function parseHex(color: string): [number, number, number] {
  const hex = color.trim().replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [255, 255, 255];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Redraw a sprite in ONE hue: every pixel keeps its own brightness but takes
 * `color`'s chroma, so the art stays readable (an outline still reads as an
 * outline, a highlight still as a highlight) while the sprite as a whole reads
 * as a single-color emblem — the flat `source-in` fill the pixel font uses
 * would collapse a shaded sprite into a silhouette.
 *
 * The ramp lands the brightest pixel exactly on `color` and floors the darkest
 * at `FLOOR` of it, so the dark outline stays dark instead of washing out. The
 * gamma pushes the midtones up, which keeps a mostly mid-toned sprite (steel,
 * plastic) from reading dimmer than the text beside it.
 */
export function monochromeDataUrl(bitmap: ImageBitmap, color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const [tr, tg, tb] = parseHex(color);
  const FLOOR = 0.22;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i] ?? 0;
    const g = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    // Rec. 601 luma — the same weighting the asset tooling sorts colors by.
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const level = FLOOR + (1 - FLOOR) * Math.pow(luma, 0.75);
    px[i] = Math.round(tr * level);
    px[i + 1] = Math.round(tg * level);
    px[i + 2] = Math.round(tb * level);
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

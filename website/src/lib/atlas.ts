// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sprite-atlas slicing. Generic React/UI game code — lives in
// website/src/lib/ so it can be extracted into oss-framework once mature.

/** A sprite's source rectangle inside an atlas texture. */
export type AtlasRect = { x: number; y: number; w: number; h: number };

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
      async ([name, { x, y, w, h }]) =>
        [name, await createImageBitmap(atlas, x, y, w, h)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<K, ImageBitmap>;
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

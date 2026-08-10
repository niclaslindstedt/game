// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sprite-atlas slicing. Generic React/UI game code — lives in
// pwa/src/lib/, the pool a later game keeps as-is.

/** A sprite's source rectangle inside an atlas texture — a compact
 * `[x, y, w, h]` tuple, the shape the atlas manifest ships in (it rides the
 * app's critical-path budget, so it pays for no field names). */
export type AtlasRect = readonly [number, number, number, number];

/**
 * A drawn sprite, whatever surface it happens to live on. `drawImage`,
 * `createPattern` and `getImageData` take either, and the renderer does not
 * care which it is given: the atlas cuts CANVASES (see `sliceAtlas`), while a
 * mod's frames arrive as real `ImageBitmap`s decoded from its own pixels.
 */
export type SpriteImage = ImageBitmap | HTMLCanvasElement;

/**
 * Slice a decoded atlas image into per-sprite surfaces — **on first read, not
 * up front**, which is the whole point of this function.
 *
 * IT USED TO CUT EVERY SPRITE BEFORE THE MENU COULD OPEN, and that was
 * measured as the entire cost of opening the game: 2,333 `createImageBitmap`
 * calls issued in one `Promise.all`, the last resolving **13.4 seconds** after
 * the first on a one-core machine — while the app's whole JavaScript bundle had
 * finished downloading at 136 ms and the main thread sat 97% idle waiting for
 * the decode queue to drain. The title menu draws about a dozen sprites. It was
 * paying for two thousand it would never show, every single launch, and the
 * bill grew with every sprite anybody added to the game.
 *
 * So the map is lazy: a name is cut the first time something asks for it and
 * cached forever after, and a launch pays only for what it draws.
 *
 * **The surface is a CANVAS and not an `ImageBitmap`, and that follows from the
 * laziness rather than being a preference.** `createImageBitmap` is
 * asynchronous, and the renderer reads `sprites[name]` in the middle of a frame
 * — there is nowhere to await. `drawImage(atlas, sx, sy, sw, sh, …)` into a
 * canvas of the sprite's size is the synchronous equivalent, it is a pure GPU
 * blit of a region already decoded and resident, and every consumer in this
 * repo takes a `CanvasImageSource`.
 *
 * **THE ATLAS IMAGE IS CAPTURED AND HELD FOR THE PROCESS'S LIFE.** It has to
 * be — it is the source every not-yet-cut sprite will be cut from — where the
 * eager version could let it go once the last bitmap was made. One decoded PNG
 * is a cheap thing to keep, and far cheaper than the 2,333 surfaces it replaces.
 *
 * The returned map behaves like the plain object it replaced: it can be written
 * to (a mod overriding a sprite), deleted from (dropping that override — the
 * shipped sprite is simply cut again on the next read) and enumerated
 * (`Object.keys` lists the whole catalogue, cut or not, cutting nothing).
 */
export function sliceAtlas<K extends string>(
  atlas: HTMLImageElement,
  rects: Record<K, AtlasRect>,
): Record<K, SpriteImage> {
  // Every sprite handed out so far: the atlas's own, cut on demand, plus
  // whatever a mod has written over or added. One map, because "what does this
  // name resolve to right now" is one question.
  const cut = new Map<string, SpriteImage>();
  const table = rects as Record<string, AtlasRect | undefined>;

  const target: Record<string, SpriteImage> = {};
  return new Proxy(target, {
    get(_t, key) {
      if (typeof key !== "string") return undefined;
      const ready = cut.get(key);
      if (ready) return ready;
      const rect = table[key];
      if (!rect) return undefined;
      const [x, y, w, h] = rect;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      // A context can genuinely be refused (too many live canvases, a lost
      // GPU). Returning undefined is what `spriteByName` already treats as "not
      // drawn", and it is not cached, so the next frame tries again.
      if (!ctx) return undefined;
      ctx.drawImage(atlas, x, y, w, h, 0, 0, w, h);
      cut.set(key, canvas);
      return canvas;
    },
    set(_t, key, value: SpriteImage) {
      if (typeof key !== "string") return false;
      cut.set(key, value);
      return true;
    },
    // Dropping a name forgets the surface. For a MOD's own sprite that removes
    // it; for one the atlas also has, the next read simply cuts the shipped
    // sprite again — which is exactly what "remove the override" has to mean.
    deleteProperty(_t, key) {
      if (typeof key !== "string") return false;
      cut.delete(key);
      return true;
    },
    has(_t, key) {
      return typeof key === "string" && (!!table[key] || cut.has(key));
    },
    ownKeys() {
      return [...new Set([...Object.keys(table), ...cut.keys()])];
    },
    // ENUMERATION MUST NOT CUT ANYTHING. `Object.keys` asks for a descriptor per
    // key to test enumerability, so resolving the sprite here would make listing
    // the catalogue as expensive as the eager slice this replaced. The value is
    // reported only when it has already been cut; reading one is `get`'s job.
    getOwnPropertyDescriptor(_t, key) {
      if (typeof key !== "string") return undefined;
      if (!table[key] && !cut.has(key)) return undefined;
      // `configurable: true` is required of a proxy reporting a property its
      // target does not have — and it is also true: these can be deleted.
      return {
        enumerable: true,
        configurable: true,
        writable: true,
        value: cut.get(key),
      };
    },
  }) as Record<K, SpriteImage>;
}

/** One sprite in a `composeDataUrl` stack, offset inside the canvas. */
export type ComposeLayer = {
  image: SpriteImage;
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
export function bitmapDataUrl(bitmap: SpriteImage): string {
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
export function monochromeDataUrl(bitmap: SpriteImage, color: string): string {
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

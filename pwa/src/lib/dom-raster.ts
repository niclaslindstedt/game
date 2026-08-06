// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RASTERIZING A PIXEL-UI SUBTREE — turning a laid-out box of canvases, sprites
// and framed panels into a single bitmap the player can put on a clipboard.
// Generic React/UI game code — lives in pwa/src/lib/, the pool a later game
// keeps as-is.
//
// WHY THIS EXISTS RATHER THAN A LIBRARY. The usual answer is html2canvas or an
// SVG <foreignObject>, and both are wrong here for the same reason: this game's
// UI text is not text. Every word on a card is a CANVAS the pixel font painted
// (see PixelText), and a foreignObject serialization deliberately drops canvas
// bitmaps — the card would come back with its frame and its icons and not one
// readable line on it. Walking the real, already-laid-out DOM sidesteps the
// whole question: a canvas is drawn with drawImage, a sprite is drawn with
// drawImage, and the layout is whatever the browser already computed.
//
// WHAT IT UNDERSTANDS is deliberately the vocabulary of the game's own skins
// and nothing more: background colour, ONE linear-gradient fill, borders (with
// radius), outer box-shadows, <canvas>, <img>, and nesting. It does NOT render
// DOM text — there is none to render — and it does not reproduce the panel
// GRAIN (the four checker tiles and two turbulence washes `--panel-grain`
// layers over the fill), because that is texture rather than information and a
// pasted card reads cleaner without it.

export type RasterizeOptions = {
  /**
   * Integer output scale. The UI's canvases are painted at 1 device-independent
   * pixel per art pixel, so anything above 1 is a nearest-neighbour blow-up —
   * which is exactly what a pixel-art image wants when it lands in a chat
   * window sized for photographs.
   */
  scale?: number;
  /** Transparent margin (CSS px) around the root, so an outer glow isn't cut off. */
  padPx?: number;
  /**
   * Leave this element (and everything under it) out of the picture.
   *
   * The walk is over the LIVE, laid-out DOM, so anything that is on screen is
   * in the raster — including chrome that exists to talk ABOUT the picture. The
   * screenshot flash is the case that forced this: press the key twice in a
   * row and the second picture has the first one's miniature pasted in the
   * corner. Hiding the element instead would cost a reflow and a frame.
   */
  skip?: (el: Element) => boolean;
};

/**
 * Split a CSS list value on its TOP-LEVEL commas — the separator between
 * background layers or box-shadow layers. Naive splitting breaks on the first
 * `rgb(43, 49, 58)` it meets, which is every value this module actually reads.
 */
export function splitCssLayers(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

/** Split on top-level whitespace — the token separator inside ONE layer. */
function splitCssTokens(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if ((ch === undefined || /\s/.test(ch)) && depth === 0) {
      const token = value.slice(start, i).trim();
      if (token) tokens.push(token);
      start = i + 1;
    }
  }
  return tokens;
}

export type ColorStop = { color: string; pos: number | null };
export type LinearGradientSpec = { angleDeg: number; stops: ColorStop[] };

/** `50%` / `12px` against a gradient line of `linePx` → a 0..1 fraction. */
function stopPosition(token: string, linePx: number): number | null {
  const pct = /^(-?[\d.]+)%$/.exec(token);
  if (pct) return Number(pct[1]) / 100;
  const px = /^(-?[\d.]+)px$/.exec(token);
  if (px && linePx > 0) return Number(px[1]) / linePx;
  return null;
}

/**
 * Parse ONE `linear-gradient(...)` layer, as `getComputedStyle` hands it over —
 * which matters in two ways worth stating: the browser normalizes colours to
 * `rgb()`/`rgba()` (so the stops can go straight to a canvas gradient), and it
 * OMITS the direction when it is the default. A value that opens on a colour is
 * therefore `to bottom`, not a parse failure.
 *
 * `linePx` is the gradient line's length, needed only to resolve px-valued
 * stops; pass 0 when unknown and those stops fall back to even spacing.
 * Returns null for anything that isn't a linear gradient (a `url()` wash, a
 * conic grain tile, `none`).
 */
export function parseLinearGradient(
  layer: string,
  linePx = 0,
): LinearGradientSpec | null {
  const open = layer.indexOf("(");
  if (open < 0) return null;
  if (!/^(-webkit-)?linear-gradient$/.test(layer.slice(0, open).trim())) {
    return null;
  }
  const inner = layer.slice(open + 1, layer.lastIndexOf(")"));
  const parts = splitCssLayers(inner);
  if (parts.length === 0) return null;

  // CSS angles: 0deg points to the TOP and grows clockwise.
  const KEYWORDS: Record<string, number> = {
    "to top": 0,
    "to right": 90,
    "to bottom": 180,
    "to left": 270,
    "to top right": 45,
    "to right top": 45,
    "to bottom right": 135,
    "to right bottom": 135,
    "to bottom left": 225,
    "to left bottom": 225,
    "to top left": 315,
    "to left top": 315,
  };
  let angleDeg = 180;
  const head = parts[0] ?? "";
  const deg = /^(-?[\d.]+)deg$/.exec(head);
  if (deg) {
    angleDeg = Number(deg[1]);
    parts.shift();
  } else if (head.startsWith("to ")) {
    angleDeg = KEYWORDS[head] ?? 180;
    parts.shift();
  }

  const stops: ColorStop[] = [];
  for (const part of parts) {
    const tokens = splitCssTokens(part);
    const color = tokens[0];
    if (color === undefined) continue;
    if (tokens.length === 1) {
      stops.push({ color, pos: null });
      continue;
    }
    // `red 0% 40%` is shorthand for two stops of the same colour.
    for (const token of tokens.slice(1)) {
      stops.push({ color, pos: stopPosition(token, linePx) });
    }
  }
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last || stops.length < 2) return null;

  // Fill the unpositioned stops: the ends anchor at 0 and 1, and a run of
  // interior nulls spreads evenly between its positioned neighbours.
  first.pos ??= 0;
  last.pos ??= 1;
  let anchor = first.pos ?? 0;
  let pending = 0;
  for (let i = 1; i < stops.length; i++) {
    const stop = stops[i];
    if (!stop) continue;
    if (stop.pos === null) {
      pending++;
      continue;
    }
    for (let k = 1; k <= pending; k++) {
      const gap = stops[i - pending - 1 + k];
      if (gap) gap.pos = anchor + ((stop.pos - anchor) * k) / (pending + 1);
    }
    // A gradient's stops never step backwards.
    stop.pos = Math.max(stop.pos, anchor);
    anchor = stop.pos;
    pending = 0;
  }
  return { angleDeg, stops };
}

export type BoxShadowSpec = {
  color: string;
  x: number;
  y: number;
  blur: number;
  spread: number;
  inset: boolean;
};

/**
 * Parse a computed `box-shadow` into its layers. Tolerant about where the
 * colour sits in the layer (engines disagree) — the colour is simply the token
 * that is not a length and not `inset`.
 */
export function parseBoxShadows(value: string): BoxShadowSpec[] {
  if (!value || value === "none") return [];
  const shadows: BoxShadowSpec[] = [];
  for (const layer of splitCssLayers(value)) {
    const lengths: number[] = [];
    let color = "";
    let inset = false;
    for (const token of splitCssTokens(layer)) {
      if (token === "inset") {
        inset = true;
        continue;
      }
      const px = /^(-?[\d.]+)px$/.exec(token);
      if (px) {
        lengths.push(Number(px[1]));
        continue;
      }
      if (/^-?[\d.]+$/.test(token)) {
        lengths.push(Number(token));
        continue;
      }
      color = token;
    }
    if (!color || lengths.length < 2) continue;
    shadows.push({
      color,
      x: lengths[0] ?? 0,
      y: lengths[1] ?? 0,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      inset,
    });
  }
  return shadows;
}

/** A box in the output's own coordinates (CSS px from the root's top-left). */
type Box = { x: number; y: number; w: number; h: number };

/** The four corner radii of a box, in CSS px. */
type Radii = { tl: number; tr: number; br: number; bl: number };

/** Grow or shrink every corner by the same amount, never past zero. */
function insetRadii(radii: Radii, by: number): Radii {
  return {
    tl: Math.max(0, radii.tl + by),
    tr: Math.max(0, radii.tr + by),
    br: Math.max(0, radii.br + by),
    bl: Math.max(0, radii.bl + by),
  };
}

/** The four corner radii, clamped so opposite corners can never overlap. */
function cornerRadii(style: CSSStyleDeclaration, box: Box): Radii {
  const limit = Math.min(box.w, box.h) / 2;
  const read = (value: string) => {
    const px = /^(-?[\d.]+)px/.exec(value.trim());
    return Math.min(limit, px ? Math.max(0, Number(px[1])) : 0);
  };
  return {
    tl: read(style.borderTopLeftRadius),
    tr: read(style.borderTopRightRadius),
    br: read(style.borderBottomRightRadius),
    bl: read(style.borderBottomLeftRadius),
  };
}

/** Trace a rounded rectangle. Written with arcs rather than `roundRect` so the
 * module needs no feature detection on the shells' older WebViews. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  box: Box,
  radii: Radii,
): void {
  const limit = Math.min(box.w, box.h) / 2;
  const clamp = (r: number) => Math.max(0, Math.min(r, limit));
  const tl = clamp(radii.tl);
  const tr = clamp(radii.tr);
  const br = clamp(radii.br);
  const bl = clamp(radii.bl);
  const { x, y, w, h } = box;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** Whether a computed colour would paint nothing at all. */
function transparent(color: string): boolean {
  return (
    !color ||
    color === "transparent" ||
    /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0\s*\)$/.test(color)
  );
}

function paintShadows(
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  box: Box,
  radii: Radii,
): void {
  for (const shadow of parseBoxShadows(style.boxShadow)) {
    // Only the OUTER glow reaches the picture: an inset groove is a one-pixel
    // highlight inside a two-pixel border, and faking it with a canvas shadow
    // costs more than it shows.
    if (shadow.inset || transparent(shadow.color)) continue;
    const grown: Box = {
      x: box.x - shadow.spread,
      y: box.y - shadow.spread,
      w: box.w + shadow.spread * 2,
      h: box.h + shadow.spread * 2,
    };
    ctx.save();
    ctx.shadowColor = shadow.color;
    // CSS's blur radius and the canvas's shadowBlur are the same quantity
    // (both twice the Gaussian deviation), so this needs no conversion.
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.x;
    ctx.shadowOffsetY = shadow.y;
    ctx.fillStyle = shadow.color;
    roundRectPath(ctx, grown, insetRadii(radii, shadow.spread));
    ctx.fill();
    ctx.restore();
  }
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  box: Box,
  radii: Radii,
): void {
  if (!transparent(style.backgroundColor)) {
    ctx.fillStyle = style.backgroundColor;
    roundRectPath(ctx, box, radii);
    ctx.fill();
  }
  // The LAST background layer is the bottom one — the panel's own fill, under
  // whatever grain rides above it (see the note at the top of the file).
  const layers = splitCssLayers(style.backgroundImage ?? "");
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const spec = layer
      ? parseLinearGradient(layer, Math.max(box.w, box.h))
      : null;
    if (!spec) continue;
    const rad = (spec.angleDeg * Math.PI) / 180;
    // CSS 0deg points up the screen; the canvas's y grows downward.
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const line = Math.abs(box.w * dx) + Math.abs(box.h * dy);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const gradient = ctx.createLinearGradient(
      cx - (dx * line) / 2,
      cy - (dy * line) / 2,
      cx + (dx * line) / 2,
      cy + (dy * line) / 2,
    );
    for (const stop of spec.stops) {
      gradient.addColorStop(
        Math.min(1, Math.max(0, stop.pos ?? 0)),
        stop.color,
      );
    }
    ctx.fillStyle = gradient;
    roundRectPath(ctx, box, radii);
    ctx.fill();
    return;
  }
}

function paintBorders(
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  box: Box,
  radii: Radii,
): void {
  const side = (width: string, color: string, kind: string) => ({
    w: kind === "none" || kind === "hidden" ? 0 : parseFloat(width) || 0,
    color,
  });
  const top = side(
    style.borderTopWidth,
    style.borderTopColor,
    style.borderTopStyle,
  );
  const right = side(
    style.borderRightWidth,
    style.borderRightColor,
    style.borderRightStyle,
  );
  const bottom = side(
    style.borderBottomWidth,
    style.borderBottomColor,
    style.borderBottomStyle,
  );
  const left = side(
    style.borderLeftWidth,
    style.borderLeftColor,
    style.borderLeftStyle,
  );
  const uniform =
    top.w > 0 &&
    [right, bottom, left].every((s) => s.w === top.w && s.color === top.color);
  if (uniform) {
    // One stroke down the middle of the frame reproduces a rounded border
    // exactly; four filled rects could not round the corners.
    if (transparent(top.color)) return;
    ctx.strokeStyle = top.color;
    ctx.lineWidth = top.w;
    roundRectPath(
      ctx,
      {
        x: box.x + top.w / 2,
        y: box.y + top.w / 2,
        w: Math.max(0, box.w - top.w),
        h: Math.max(0, box.h - top.w),
      },
      insetRadii(radii, -top.w / 2),
    );
    ctx.stroke();
    return;
  }
  // A partial frame — the set block's single green rule above its own
  // heading — paints per side, square-cornered.
  const fill = (edge: { w: number; color: string }, rect: Box) => {
    if (edge.w <= 0 || transparent(edge.color)) return;
    ctx.fillStyle = edge.color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  };
  fill(top, { x: box.x, y: box.y, w: box.w, h: top.w });
  fill(bottom, {
    x: box.x,
    y: box.y + box.h - bottom.w,
    w: box.w,
    h: bottom.w,
  });
  fill(left, { x: box.x, y: box.y, w: left.w, h: box.h });
  fill(right, { x: box.x + box.w - right.w, y: box.y, w: right.w, h: box.h });
}

/** Where an <img> actually lands inside its box under `object-fit`. */
function objectFitBox(img: HTMLImageElement, box: Box, fit: string): Box {
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (fit !== "contain" || !natW || !natH) return box;
  const scale = Math.min(box.w / natW, box.h / natH);
  const w = natW * scale;
  const h = natH * scale;
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

/**
 * Draw `root` and everything inside it onto a fresh canvas. The element must be
 * laid out (in the document, not `display: none`) — every position comes from
 * the browser's own boxes, which is the whole point: nothing here re-implements
 * flexbox or word wrap.
 */
export function rasterizeElement(
  root: HTMLElement,
  options: RasterizeOptions = {},
): HTMLCanvasElement {
  const scale = Math.max(0.05, options.scale ?? 1);
  const pad = Math.max(0, options.padPx ?? 0);
  const rootRect = root.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((rootRect.width + pad * 2) * scale));
  canvas.height = Math.max(1, Math.round((rootRect.height + pad * 2) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  // Everything below draws in CSS px relative to the root's top-left corner.
  ctx.setTransform(scale, 0, 0, scale, pad * scale, pad * scale);

  const skip = options.skip;
  const paint = (el: Element, alpha: number) => {
    if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return;
    if (skip?.(el)) return;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return;
    const opacity = alpha * (Number(style.opacity) || 0);
    if (opacity <= 0) return;
    const rect = el.getBoundingClientRect();
    const box: Box = {
      x: rect.left - rootRect.left,
      y: rect.top - rootRect.top,
      w: rect.width,
      h: rect.height,
    };
    // A NEGATIVE z-index PAINTS EARLY — after this element's own background,
    // before its content. It is the one bit of CSS's stacking order a tree walk
    // cannot infer from document order, and the one the item card leans on: its
    // kind glyph is a watermark BEHIND every line, written last in the markup.
    // Drawn in tree order it would land on top of the text, and the copied
    // picture would disagree with the card on screen.
    const behind: Element[] = [];
    const above: Element[] = [];
    for (const child of el.children) {
      const z = Number(getComputedStyle(child).zIndex);
      (Number.isFinite(z) && z < 0 ? behind : above).push(child);
    }
    ctx.globalAlpha = opacity;
    if (box.w > 0 && box.h > 0) {
      const radii = cornerRadii(style, box);
      paintShadows(ctx, style, box, radii);
      paintBackground(ctx, style, box, radii);
      paintBorders(ctx, style, box, radii);
    }
    for (const child of behind) paint(child, opacity);
    ctx.globalAlpha = opacity;
    if (box.w > 0 && box.h > 0) {
      // A pixel sprite is blown up by repetition, never by interpolation —
      // the same promise `image-rendering: pixelated` makes on screen.
      const pixelated = style.imageRendering === "pixelated";
      ctx.imageSmoothingEnabled = !pixelated;
      // ...and it lands on WHOLE output pixels. Layout puts a box wherever the
      // rem arithmetic puts it, which is routinely a fraction of a pixel;
      // blitting a sprite from there makes nearest-neighbour sample unevenly
      // ACROSS one glyph — a letter with a 3px stem beside a 4px one.
      const place = (rect: Box) =>
        pixelated
          ? {
              x: Math.round(rect.x * scale) / scale,
              y: Math.round(rect.y * scale) / scale,
              w: rect.w,
              h: rect.h,
            }
          : rect;
      if (el instanceof HTMLCanvasElement && el.width > 0 && el.height > 0) {
        const at = place(box);
        ctx.drawImage(el, at.x, at.y, at.w, at.h);
      } else if (el instanceof HTMLImageElement && el.naturalWidth > 0) {
        const at = place(objectFitBox(el, box, style.objectFit));
        ctx.drawImage(el, at.x, at.y, at.w, at.h);
      }
    }
    for (const child of above) paint(child, opacity);
    ctx.globalAlpha = alpha;
  };

  paint(root, 1);
  ctx.globalAlpha = 1;
  return canvas;
}

/** The tightest box holding a non-transparent pixel, or null when every pixel
 * is transparent. `[left, top, right, bottom]`, all inclusive. */
export function opaqueBounds(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
): [number, number, number, number] | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((data[(row + x) * 4 + 3] ?? 0) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  return maxX < 0 ? null : [minX, minY, maxX, maxY];
}

/**
 * Crop away the fully transparent border — so the picture is the size of what
 * was actually DRAWN rather than the size of the box it was drawn in.
 *
 * This is what lets a caller pad generously without paying for the padding.
 * A card's ink does not stop at its own border box: a legendary's halo bleeds
 * out past it, and rasterizing with no room at all shears the halo off at the
 * edge. Padding for the widest possible glow and then trimming back to the ink
 * gives both — the halo survives, and a card that has none comes out hugging
 * its own corners instead of floating in a field of nothing.
 */
export function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) return canvas;
  const bounds = opaqueBounds(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
  // Nothing drawn at all: hand back the canvas rather than a 0×0 one nothing
  // downstream can encode.
  if (!bounds) return canvas;
  const [left, top, right, bottom] = bounds;
  const w = right - left + 1;
  const h = bottom - top + 1;
  if (w === canvas.width && h === canvas.height) return canvas;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(canvas, -left, -top);
  return out;
}

/** The canvas as a PNG blob. Rejects when the browser declines to encode. */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas encode failed"));
    }, "image/png");
  });
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared helpers for the YAML sprite format (see docs/sprite-yaml-plan.md).
// One self-describing YAML file per atlas entry replaces the bundled
// per-family `.mjs` grid modules: colors are concrete hex, the grid is a
// literal block scalar, and `.` is the reserved transparent key. These
// helpers convert between the packed [r,g,b,a] surfaces the generator renders
// and the hex strings the files carry, and stringify our fixed shapes so the
// emitted files stay clean and diff-able.

import { Document, visit } from "yaml";

/** Two-digit lowercase hex for one 0–255 channel. */
const hex2 = (v) =>
  Math.max(0, Math.min(255, v | 0))
    .toString(16)
    .padStart(2, "0");

/**
 * `[r,g,b,a]` → `#rrggbb` (opaque) or `#rrggbbaa` (translucent). Alpha is
 * only spelled out when it isn't fully opaque so the common case reads clean.
 */
export function rgbaToHex([r, g, b, a = 255]) {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return a === 255 ? base : `${base}${hex2(a)}`;
}

/**
 * `#rgb` / `#rrggbb` / `#rrggbbaa` (case-insensitive) → `[r,g,b,a]`. Alpha
 * defaults to 255. Throws on anything else so a mistyped color fails the
 * build instead of rendering a silent wrong pixel.
 */
export function hexToRgba(hex) {
  if (typeof hex !== "string") throw new Error(`color is not a string: ${hex}`);
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(
    hex.trim(),
  );
  if (!m) throw new Error(`invalid hex color "${hex}"`);
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255];
}

/** A char → hex map from a char → `[r,g,b,a]` palette, keys sorted for stable diffs. */
export function paletteToHex(palette) {
  const out = {};
  for (const char of Object.keys(palette).sort())
    out[char] = rgbaToHex(palette[char]);
  return out;
}

/** A char → `[r,g,b,a]` palette from a char → hex map (the inverse of the above). */
export function paletteFromHex(hexMap) {
  const out = {};
  for (const [char, hex] of Object.entries(hexMap)) out[char] = hexToRgba(hex);
  return out;
}

/**
 * Stringify one of our fixed shapes to YAML text. Short scalar collections
 * (coordinate pairs, frame lists, wound/animation records) render inline so a
 * sprite file stays compact; the grid stays a literal block scalar.
 */
export function toYaml(obj) {
  const doc = new Document(obj);
  visit(doc, {
    Pair(_key, pair, path) {
      const key = pair.key?.value;
      // Inline the small, obviously-one-line collections.
      if (key === "size" || key === "frames" || key === "contrastExempt") {
        if (pair.value?.items) pair.value.flow = true;
      }
      // Animation entries and wound-style records are single-line records:
      // a MAP whose grandparent pair is `animations:` or `wounds:`.
      if (pair.value?.items && pair.value.type !== "BLOCK_LITERAL") {
        const grandparent = path[path.length - 2];
        const underKey = grandparent?.key?.value;
        if (underKey === "animations" || underKey === "wounds") {
          pair.value.flow = true;
        }
      }
    },
  });
  return doc.toString({ lineWidth: 0 });
}

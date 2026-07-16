// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Turn a sprite's self-describing metadata into an image-generation prompt, so
// a sprite can be born from its fields alone: the description (the intent), the
// family's shared look, the target resolution, and the palette it should paint
// with. The grid is deliberately excluded — the prompt exists to regenerate it.
//
// The produced image is a bootstrap, not the ship: it feeds the `analyze` tool
// (image → palette + grid), and the description stays the authority when the
// two disagree. Everything here is a pure string transform, so the same fields
// always synthesize the same prompt.

import { parseDocument } from "yaml";

/**
 * The fixed look every sprite shares — the constant top of every prompt. It
 * pins the medium (flat 16-bit pixel art, no anti-aliasing), the framing
 * (single subject, centered, front-facing, transparent background, no cast
 * shadow), and the read (bold silhouette that survives at phone distance).
 */
export const STYLE_PREAMBLE = [
  "Flat 16-bit pixel art game sprite.",
  "Hard-edged pixels, no anti-aliasing, no gradients, no dithering, no outline glow.",
  "A single subject, centered and filling the frame, drawn front-facing and orthographic — no perspective, no cast shadow, no ground plane.",
  "Fully transparent background.",
  "A handful of flat colors with a bold, high-contrast silhouette that stays readable shrunk to a tiny icon at phone distance.",
].join(" ");

/** Trim, collapse inner whitespace/newlines, and drop a trailing period. */
const oneLine = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");

/**
 * Extract the human color names from a sprite file's palette comments — the
 * `# steel` trailing each `s: "#c8ccd4"` line. Returns a `char → name` map
 * (only the keys that carry a comment); absent for a plain palette. Reads the
 * raw text via the YAML CST because `parse` throws comments away.
 */
export function paletteComments(yamlText) {
  const names = {};
  try {
    const palette = parseDocument(yamlText).get("palette", true);
    for (const item of palette?.items ?? []) {
      const name = oneLine(item.value?.comment);
      if (name) names[item.key.value] = name;
    }
  } catch {
    /* a palette we can't read for comments just yields hex-only guidance */
  }
  return names;
}

/**
 * Render the palette as color guidance: `steel #c8ccd4, gold crest #f4c430`
 * when names are known, bare `#c8ccd4` otherwise. Ordered by palette key so the
 * line is stable across runs. Returns "" for an empty palette.
 */
function paletteGuidance(palette, names = {}) {
  return Object.keys(palette ?? {})
    .sort()
    .map((char) => {
      const hex = palette[char];
      const name = names[char];
      return name ? `${name} ${hex}` : hex;
    })
    .join(", ");
}

/**
 * Synthesize the image-generation prompt for one sprite from its tier-1 fields.
 *
 * @param {object} args
 * @param {string} args.description  the sprite's intent (the acceptance target)
 * @param {string} [args.familyStyle]  the family's shared style anchor
 * @param {[number, number]} [args.size]  `[w, h]` target resolution
 * @param {Record<string,string>} [args.palette]  char → hex the sprite paints with
 * @param {Record<string,string>} [args.paletteNames]  char → human color name
 * @returns the full prompt string (sections separated by blank lines)
 */
export function buildImagePrompt({
  description,
  familyStyle,
  size,
  palette,
  paletteNames,
} = {}) {
  const sections = [STYLE_PREAMBLE];

  const anchor = oneLine(familyStyle);
  if (anchor) sections.push(anchor);

  const subject = oneLine(description);
  sections.push(
    `Subject: ${subject || "(no description — the acceptance target is unset; describe the sprite before generating)"}.`,
  );

  if (Array.isArray(size) && size.length === 2) {
    sections.push(`Target resolution: ${size[0]}×${size[1]} pixels.`);
  }

  const guidance = paletteGuidance(palette, paletteNames);
  if (guidance) {
    sections.push(`Paint only with this palette: ${guidance}.`);
  }

  return sections.join("\n\n");
}

/**
 * The provenance record written beside a generated reference image
 * (`<name>.ref.json`). Image generation isn't deterministic (model version +
 * sampling), so a generation is made *auditable* rather than reproducible: the
 * exact prompt, model id, and seed that produced the committed grid — the
 * analog of recording an RNG seed. Null for whatever the caller didn't supply.
 */
export function provenanceRecord({ prompt, model, seed } = {}) {
  return {
    model: model ?? null,
    seed: seed ?? null,
    prompt: prompt ?? null,
  };
}

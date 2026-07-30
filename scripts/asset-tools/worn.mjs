// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Worn-gear overlays — derive the on-body look of every armor piece from a
// per-slot silhouette template plus the piece's inventory-icon colors. The
// hero never gets a hand-drawn sprite per outfit: a worn overlay is a sparse
// 16×16 grid that repaints only the clothing pixels of the shared hero body
// plan (sprites/hero/*.yaml — hair rows 2–4, shirt rows 7–10, hips/legs
// rows 11–12, shoes row 13), so drawing it over ANY frame of either costume
// lines up by construction. Head pieces pick one of four silhouette styles
// (GearDef.worn); the other slots have one silhouette each. Colors are a
// standard ramp off the icon's dominant color, so a new gear def gets its
// worn look for free from the icon it already ships.
//
// Chars: "1" base, "2" dark, "3" light, "4" OUTLINE — resolved per def by
// `wornRamp`. The outline is only ever used by a piece that hangs OFF the
// hero's silhouette (the shield): a clothing overlay repaints pixels the body's
// own outline already surrounds, but a shield held out past his arm would
// otherwise be a shape with no edge, which is the one thing no sprite in this
// game is.

import { shade, tint } from "./palette.mjs";

/** The game's house outline — the near-black every authored sprite is edged in
 * (the `_family.yaml` palettes under content/sprites), as the `[r,g,b,a]` the
 * palette maps carry rather than the hex those files author it as. */
const OUTLINE = [0x1a, 0x1c, 0x2c, 255];

// Head rows 2–4 sit above the face; the brim/band rows overpaint the
// forehead (row 4) or the eye row (row 5) where a real hat would.
const HEAD_TEMPLATES = {
  // A brimmed cap: crown over the hair, dark brim line across the forehead.
  cap: [
    "................",
    "................",
    ".....311111.....",
    "....11111111....",
    "....22222222....",
    "................",
  ],
  // A full helm: crown to jaw, cheek guards around the eyes.
  helm: [
    "................",
    "................",
    ".....311111.....",
    "....31111111....",
    "....11111111....",
    "....22....22....",
  ],
  // A mirrored visor: one reflective band straight across the eyes.
  visor: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "....21331112....",
  ],
  // A face mask: forehead to chin, one dark eye slit.
  mask: [
    "................",
    "................",
    "................",
    "................",
    "....31111111....",
    "....11222211....",
    ".....211112.....",
  ],
};

// The torso: shirt rows 7–10 minus arms and hands (they stay skin/suit).
const CHEST_TEMPLATE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....311111.....",
  "....31111111....",
  "....11122111....",
  ".....112211.....",
];

// Hips + thighs per stride frame. The jump pose tucks the legs into the
// frame-0 columns, so `_0` doubles as the airborne overlay.
const LEGS_TEMPLATES = {
  _0: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....31111112....",
    "....12....12....",
  ],
  _1: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....31111112....",
    "...12......12...",
  ],
};

// Shoes per stride frame (the jump pose hides the feet entirely).
const FEET_TEMPLATES = {
  _0: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....31....31....",
    "................",
  ],
  _1: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "...31......31...",
    "................",
  ],
};

/**
 * A SHIELD on the hero's off arm — the one worn overlay that is not clothing.
 *
 * It sits on the LEFT of the body plan because the held weapon is anchored on
 * the right (`HELD_DX` in pwa/src/game/paper-doll.ts), so the two arms read as
 * two arms; and it is drawn INSIDE the 16-wide cell rather than overhanging it,
 * because the doll's canvas only has room to spare on the weapon's side. The
 * shape is a plain heater outline — a shield sized to cover a torso, seen from
 * the side and slightly behind, which is what a top-down hero holding one looks
 * like. Frame-independent like the chest: the arm holding it does not bob.
 *
 * Colours come from the piece's own icon (`wornRamp`), so a rust-brown pavise
 * and a blue riot shield each carry their own look with nothing authored twice.
 */
const SHIELD_TEMPLATE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "44444...........",
  "431114..........",
  "4311114.........",
  "4111124.........",
  "4111124.........",
  "4111124.........",
  ".411124.........",
  "..41124.........",
  "...4444.........",
];

/**
 * A BAG on the hero's off arm — the shield's opposite number, and it has to READ
 * as the opposite number: same side, same slot, but slung low and small where a
 * shield is raised and broad, so a glance at a hero says which lane he took
 * without a label anywhere. The flap band across the top is what keeps a six-px
 * blob from reading as a rock.
 */
const BAG_TEMPLATE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..444...........",
  ".422224.........",
  ".411114.........",
  ".411114.........",
  ".413114.........",
  ".411124.........",
  "..4444..........",
];

/**
 * The overlay grids for one worn piece: suffix → grid. Head, chest and the two
 * off-hand kinds are frame-independent (the hero's upper body never bobs) and
 * map from the empty suffix; legs/feet track the stride and map from "_0"/"_1".
 */
export function wornFrames(slot, style = "helm") {
  switch (slot) {
    case "head": {
      const grid = HEAD_TEMPLATES[style];
      if (!grid) throw new Error(`unknown worn head style "${style}"`);
      return { "": grid };
    }
    case "chest":
      return { "": CHEST_TEMPLATE };
    case "shield":
      return { "": SHIELD_TEMPLATE };
    case "bag":
      return { "": BAG_TEMPLATE };
    case "legs":
      return LEGS_TEMPLATES;
    case "feet":
      return FEET_TEMPLATES;
    default:
      throw new Error(`slot "${slot}" has no worn overlay`);
  }
}

/**
 * The 1/2/3 ramp a worn overlay renders with, derived from the piece's
 * inventory icon: the icon's dominant color (most-painted char, transparency
 * and outline excluded) becomes the base, with the dark/light steps derived
 * exactly like every other subject ramp — so the worn look re-themes itself
 * whenever the icon does. A piece whose signature color is an accent rather
 * than its main material overrides the pick with `GearDef.wornChar`.
 */
export function wornRamp(iconGrid, iconPalette, preferredChar) {
  let char = preferredChar;
  if (!char) {
    const counts = new Map();
    for (const row of iconGrid) {
      for (const c of row) {
        if (c === "." || c === "O") continue;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    const dominant = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0];
    if (!dominant) throw new Error("icon grid has no body pixels");
    char = dominant[0];
  }
  const base = iconPalette[char];
  if (!base) throw new Error(`icon char "${char}" not in palette`);
  return {
    1: base,
    2: shade(base, 0.35),
    3: tint(base, 0.4),
    // The house outline, not a deeper shade of the piece: every sprite in the
    // game is built on this one near-black, so a shield drawn in a dark shade of
    // its own colour would read as a different kind of object than everything
    // beside it.
    4: OUTLINE,
  };
}

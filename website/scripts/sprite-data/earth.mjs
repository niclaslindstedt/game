// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The earth family (see the `pixel-assets` skill): grass-biome tiles and
// the slime, parked for a future level. One string per pixel row, one
// character per pixel; `.` is transparent and every other char must exist
// in CORE_PALETTE (sprite-data/core.mjs) or this family's local palette.

import { SLIME } from "./core.mjs";

const DIRT = [104, 84, 56];

/** Chars only this family draws with — merged with the core at build time. */
const PALETTE = {
  D: DIRT,
  Q: SLIME.dark,
};

const SPRITES = {
  // Earth biome tiles + the slime, parked for level 1 (the NASA heist).
  grass_0: [
    "GGGGGGGGGGGGGGGG",
    "GGlGGGGGGGGGgGGG",
    "GGlGGGGgGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GgGGGGGGGGlGGGGG",
    "GGGGGGGGGGlGGGGG",
    "GGGGlGGGGGGGgGGG",
    "GGGGlGGGGgGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GlGGGGGGGGGGGDGG",
    "GlGGGGgGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGlGGGGG",
    "GGgGGGGGGGlGGGGG",
    "GGGGGGGDGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
  ],
  grass_1: [
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGlGGGG",
    "GGgGGGGGGGGlGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGlGGGGGGgGG",
    "GGGGGGlGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GDGGGGGGGgGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGgGGGGGGlGGG",
    "GGGGGGGGGGGGlGGG",
    "GWyWGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGgGGGGGGG",
    "GGGGGGGGGGGGGgGG",
    "GGGGGGGGGGGGGGGG",
  ],
  slime_0: [
    "................",
    "................",
    "................",
    "................",
    ".....OOOOOO.....",
    "....OLLPPPPO....",
    "...OLPPPPPPPO...",
    "..OLPPPPPPPPPO..",
    "..OPPOPPPPOPPO..",
    "..OPPOPPPPOPPO..",
    "..OPPPPOOPPPPO..",
    "..OQPPPPPPPPQO..",
    "..OQQPPPPPPQQO..",
    "...OQQQQQQQQO...",
    "....OOOOOOOO....",
    "................",
  ],
  slime_1: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....OOOOOOOO....",
    "..OOLLPPPPPPOO..",
    ".OLPPPPPPPPPPPO.",
    ".OPPOPPPPPPOPPO.",
    ".OPPPPOOOOPPPPO.",
    ".OQPPPPPPPPPPQO.",
    ".OQQQPPPPPPQQQO.",
    "..OQQQQQQQQQQO..",
    "...OOOOOOOOOO...",
    "................",
  ],
};

export default {
  name: "earth",
  /** Ground tile behind this family's contact sheet. */
  ground: "grass_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {
    slime_bounce: { frames: ["slime_0", "slime_1"], delayMs: 280 },
  },
  /** Ground tiles the contrast lint skips. */
  contrastExempt: ["grass_0", "grass_1"],
};

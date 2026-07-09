// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The map markers family (see the `pixel-assets` skill): the little glyphs the
// level-map modal pins on the fog to tell the run's story back — where the
// hero stands, where story was found, where an elite or boss fell. (The
// merchant pin reuses the icons family's gold `icon_coin`.)
// Each is a 12×12 UI icon (never
// drawn on the ground — only in the MapOverlay and its legend), one string per
// pixel row, one character per pixel; `.` is transparent and every other char
// must exist in CORE_PALETTE (sprite-data/core.mjs) or this family's palette.
// The shapes carry the meaning (icons, not colored dots); the colors echo the
// old legend swatches so a returning player still reads them at a glance.

// Local palette — bright marker inks on the dark map. Chars are chosen to not
// collide with the shared core (buildPalette throws on a shadowed core char).
const PALETTE = {
  // YOU — the hero's mint beacon (map pin).
  t: [126, 240, 200],
  s: [190, 252, 230],
  // STORY — a golden dossier page.
  d: [255, 213, 90],
  e: [255, 235, 150],
  // ELITE — a magenta star.
  C: [214, 150, 240],
  D: [238, 205, 252],
  // BOSS — a bone skull.
  X: [230, 232, 238],
  Z: [248, 250, 252],
};

const SPRITES = {
  // YOU: a classic "you are here" map pin, teardrop head with a hollow center,
  // tapering to a point — the only marker that reads as a location, not a
  // thing, so it never gets mistaken for an item.
  map_you: [
    "....OOOO....",
    "..OOssttOO..",
    ".OssttttttO.",
    ".OttOOOOttO.",
    ".OttO..OttO.",
    ".OttOOOOttO.",
    ".OttttttttO.",
    "..OttttttO..",
    "...OttttO...",
    "....OttO....",
    ".....OO.....",
    "............",
  ],
  // STORY: a dossier page with a lighter header band and four ink lines of
  // varying length — the paper trail (keycards, dossiers, recovered logs).
  map_story: [
    ".OOOOOOOOOO.",
    ".OeeddddddO.",
    ".OdOOOOOOdO.",
    ".OddddddddO.",
    ".OdOOOOdddO.",
    ".OddddddddO.",
    ".OdOOOOOOdO.",
    ".OddddddddO.",
    ".OdOOOOdddO.",
    ".OOOOOOOOOO.",
    "............",
    "............",
  ],
  // ELITE: a four-point star — a shine that says "someone special stood here"
  // (an elite fell). Magenta, the old elite swatch.
  map_elite: [
    "............",
    ".....OO.....",
    "....ODDO....",
    "...ODDCCO...",
    "...ODCCCO...",
    "ODCCCCCCCCCO",
    "OCCCCCCCCCCO",
    "...OCCCCO...",
    "...OCCCCO...",
    "....OCCO....",
    ".....OO.....",
    "............",
  ],
  // BOSS: a bone skull — the universal "a boss died here". Bone white with dark
  // sockets and a toothy jaw.
  map_boss: [
    "............",
    "...OOOOO....",
    "..OZXXXXO...",
    ".OZXXXXXXO..",
    ".OXXXXXXXO..",
    ".OXOOXOOXO..",
    ".OXXXXXXXO..",
    "..OXXOXXO...",
    "..OXOXOXO...",
    "..OOOOOOO...",
    "............",
    "............",
  ],
  // MERCHANT reuses the icons family's gold `icon_coin` (the coin that bobs
  // over the vendor's head), so it lives there, not here.
};

export default {
  name: "markers",
  // Ground tile behind this family's contact sheet (UI icons, never truly on
  // ground — a neutral dark floor just makes the bright inks easy to judge).
  ground: "lab_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {},
  // UI-only markers: they live on the dark map modal and its legend, never on a
  // level's ground, so the ground-contrast lint doesn't apply.
  contrastExempt: ["map_you", "map_story", "map_elite", "map_boss"],
};

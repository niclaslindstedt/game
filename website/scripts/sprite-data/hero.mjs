// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The hero family (see the `pixel-assets` skill): the astronaut and the
// bits that follow him around. One string per pixel row, one character per
// pixel; `.` is transparent and every other char must exist in
// CORE_PALETTE (sprite-data/core.mjs) or this family's local palette.

/** Chars only this family draws with — merged with the core at build time. */
const PALETTE = {
  z: [12, 14, 22, 110], // soft jump shadow
};

const SPRITES = {
  // The hero: an astronaut in a white EVA suit, 3/4 top-down.
  // Frames 0/1 alternate the leg stride; player_jump tucks the legs.
  player_0: [
    "................",
    ".....OOOOOO.....",
    "....OaaaaaaO....",
    "...OaaaaaaaaO...",
    "...OaOYyyyOaO...",
    "...OaOyyyyOaO...",
    "....OaaaaaaO....",
    "...OOaaaaaaOO...",
    "..OaaaaaaaaaaO..",
    "..OAaaarraaaAO..",
    "..OWOaaaaaaOWO..",
    "...OAAAAAAAAO...",
    "...OaaO..OaaO...",
    "...OAAO..OAAO...",
    "...OOOO..OOOO...",
    "................",
  ],
  player_1: [
    "................",
    ".....OOOOOO.....",
    "....OaaaaaaO....",
    "...OaaaaaaaaO...",
    "...OaOYyyyOaO...",
    "...OaOyyyyOaO...",
    "....OaaaaaaO....",
    "...OOaaaaaaOO...",
    "..OaaaaaaaaaaO..",
    "..OAaaarraaaAO..",
    "..OWOaaaaaaOWO..",
    "...OAAAAAAAAO...",
    "..OaaO....OaaO..",
    "..OAAO....OAAO..",
    "..OOOO....OOOO..",
    "................",
  ],
  player_jump: [
    "................",
    ".....OOOOOO.....",
    "....OaaaaaaO....",
    "...OaaaaaaaaO...",
    "...OaOYyyyOaO...",
    "...OaOyyyyOaO...",
    "....OaaaaaaO....",
    "...OOaaaaaaOO...",
    "..OaaaaaaaaaaO..",
    "..OAaaarraaaAO..",
    "..OWOaaaaaaOWO..",
    "...OAAAAAAAAO...",
    "...OaaO..OaaO...",
    "...OOOO..OOOO...",
    "................",
    "................",
  ],
  // The hero before the suit: SpaceZ HQ opens with him in his couch clothes —
  // brown hair (k), skin face (p), white tee (W), blue jeans (j), dark shoes
  // (E). Same silhouette and foot anchor as the astronaut so the sprite swap
  // on donning the suit is seamless. Frames 0/1 stride; hero_jump tucks.
  hero_0: [
    "................",
    ".....OOOOOO.....",
    "....OkkkkkkO....",
    "...OkkkkkkkkO...",
    "...OkkppppkkO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOWWWWWWOO...",
    "..OpWWWWWWWWpO..",
    "..OpWWWwwWWWpO..",
    "..OpOWWWWWWOpO..",
    "...OjjjjjjjjO...",
    "...OjjO..OjjO...",
    "...OEEO..OEEO...",
    "...OOOO..OOOO...",
    "................",
  ],
  hero_1: [
    "................",
    ".....OOOOOO.....",
    "....OkkkkkkO....",
    "...OkkkkkkkkO...",
    "...OkkppppkkO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOWWWWWWOO...",
    "..OpWWWWWWWWpO..",
    "..OpWWWwwWWWpO..",
    "..OpOWWWWWWOpO..",
    "...OjjjjjjjjO...",
    "..OjjO....OjjO..",
    "..OEEO....OEEO..",
    "..OOOO....OOOO..",
    "................",
  ],
  hero_jump: [
    "................",
    ".....OOOOOO.....",
    "....OkkkkkkO....",
    "...OkkkkkkkkO...",
    "...OkkppppkkO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOWWWWWWOO...",
    "..OpWWWWWWWWpO..",
    "..OpWWWwwWWWpO..",
    "..OpOWWWWWWOpO..",
    "...OjjjjjjjjO...",
    "...OjjO..OjjO...",
    "...OOOO..OOOO...",
    "................",
    "................",
  ],
  // Soft blob shadow under the player while jumping.
  shadow: ["...zzzzzz...", ".zzzzzzzzzz.", ".zzzzzzzzzz.", "...zzzzzz..."],
};

export default {
  name: "hero",
  /** Ground tile behind this family's contact sheet. */
  ground: "moon_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {
    player_walk: { frames: ["player_0", "player_1"], delayMs: 160 },
    hero_walk: { frames: ["hero_0", "hero_1"], delayMs: 160 },
  },
  /** Sprites the ground-contrast lint skips (translucent floor overlay). */
  contrastExempt: ["shadow"],
};

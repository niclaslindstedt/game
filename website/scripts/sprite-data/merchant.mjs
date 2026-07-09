// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MERCHANT family (see the `pixel-assets` skill): the wandering trader
// who roams every level, dressed for the venue — the hooded look (default,
// and the rift's reveal), the SpaceZ vending-machine man, the moon's
// salvage-run trader, and the Mars commissary keeper. One string per pixel
// row, one character per pixel; `.` is transparent and every other char
// must exist in CORE_PALETTE (sprite-data/core.mjs) or this family's local
// palette. All four looks share the hero's 16×16 body plan and foot anchor
// so the walk frames read consistently beside him.

import { ramp } from "../asset-tools/palette.mjs";

/** The hooded cloak: deep violet, mysterious between universes. */
const CLOAK = ramp([106, 78, 152], { shadeBy: 0.4 });
/** The moon trader's retro salvage suit: 70s orange. */
const RETRO_SUIT = ramp([224, 138, 56], { shadeBy: 0.38 });
/** The Mars sutler's poncho: oxidized teal against the red dust. */
const PONCHO = ramp([80, 150, 134], { shadeBy: 0.38 });

/** Chars only this family draws with — merged with the core at build time. */
const PALETTE = {
  u: CLOAK.base,
  d: CLOAK.dark,
  t: RETRO_SUIT.base,
  D: RETRO_SUIT.dark,
  e: PONCHO.base,
  C: PONCHO.dark,
};

const SPRITES = {
  // The hooded trader (default look, and the rift's "you again" reveal):
  // face lost in the hood's shadow, two gold glints for eyes, a gold clasp
  // at the chest and a brown pack over one shoulder. Frames 0/1 stride.
  merchant_0: [
    "................",
    "......OOOO......",
    ".....OuuuuO.....",
    "....OuuuuuuO....",
    "...OuOOOOOOuO...",
    "...OuOyOOyOuO...",
    "....OuOOOOuO....",
    "...OOuuuuuuOO...",
    "..OBBuuuuuuuuO..",
    "..OBBuuoouuuuO..",
    "..OEBuuuuuuudO..",
    "...OdddddddO....",
    "...OuuO..OuuO...",
    "...OddO..OddO...",
    "...OOOO..OOOO...",
    "................",
  ],
  merchant_1: [
    "................",
    "......OOOO......",
    ".....OuuuuO.....",
    "....OuuuuuuO....",
    "...OuOOOOOOuO...",
    "...OuOyOOyOuO...",
    "....OuOOOOuO....",
    "...OOuuuuuuOO...",
    "..OBBuuuuuuuuO..",
    "..OBBuuoouuuuO..",
    "..OEBuuuuuuudO..",
    "...OdddddddO....",
    "..OuuO....OuuO..",
    "..OddO....OddO..",
    "..OOOO....OOOO..",
    "................",
  ],
  // The SpaceZ HQ vending-machine man: navy service cap and apron over a
  // white shirt, a coin pouch on the belt. Jeans like everyone off the
  // clock; he is not staff, whatever the badge scanner thinks.
  merchant_vendor_0: [
    "................",
    ".....OOOOOO.....",
    "....OJJJJJJO....",
    "...OJJJJJJJJO...",
    "...OJppppppJO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOWWWWWWOO...",
    "..OpWWJJJJWWpO..",
    "..OpWWJooJWWpO..",
    "..OpOWJJJJWOpO..",
    "...OJJJJJJJJO...",
    "...OjjO..OjjO...",
    "...OEEO..OEEO...",
    "...OOOO..OOOO...",
    "................",
  ],
  merchant_vendor_1: [
    "................",
    ".....OOOOOO.....",
    "....OJJJJJJO....",
    "...OJJJJJJJJO...",
    "...OJppppppJO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOWWWWWWOO...",
    "..OpWWJJJJWWpO..",
    "..OpWWJooJWWpO..",
    "..OpOWJJJJWOpO..",
    "...OJJJJJJJJO...",
    "..OjjO....OjjO..",
    "..OEEO....OEEO..",
    "..OOOO....OOOO..",
    "................",
  ],
  // The moon's salvage-run trader: a 70s orange pressure suit under a white
  // open-visor helmet, gold clasp, dark utility belt — up since '76.
  merchant_moon_0: [
    "................",
    ".....OOOOOO.....",
    "....OWWWWWWO....",
    "...OWWWWWWWWO...",
    "...OWWppppWWO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOttttttOO...",
    "..OttttttttttO..",
    "..OtttDooDtttO..",
    "..OtOttttttOtO..",
    "...ODDDDDDDDO...",
    "...OttO..OttO...",
    "...ODDO..ODDO...",
    "...OOOO..OOOO...",
    "................",
  ],
  merchant_moon_1: [
    "................",
    ".....OOOOOO.....",
    "....OWWWWWWO....",
    "...OWWWWWWWWO...",
    "...OWWppppWWO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOttttttOO...",
    "..OttttttttttO..",
    "..OtttDooDtttO..",
    "..OtOttttttOtO..",
    "...ODDDDDDDDO...",
    "..OttO....OttO..",
    "..ODDO....ODDO..",
    "..OOOO....OOOO..",
    "................",
  ],
  // The Mars commissary keeper: a wide-brim hat against the dust and an
  // oxidized-teal poncho with a woven pattern; work boots underneath.
  merchant_mars_0: [
    "................",
    "................",
    "....OSkkkkkO....",
    "..OSkkkkkkkkkO..",
    "...OkppppppkO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOeeeeeeOO...",
    "..OeeeeeeeeeeO..",
    "..OeeCeeeeCeeO..",
    "..OCeeeeeeeeCO..",
    "...OCCCCCCCCO...",
    "...OkkO..OkkO...",
    "...OEEO..OEEO...",
    "...OOOO..OOOO...",
    "................",
  ],
  merchant_mars_1: [
    "................",
    "................",
    "....OSkkkkkO....",
    "..OSkkkkkkkkkO..",
    "...OkppppppkO...",
    "...OppOppOppO...",
    "....OppppppO....",
    "...OOeeeeeeOO...",
    "..OeeeeeeeeeeO..",
    "..OeeCeeeeCeeO..",
    "..OCeeeeeeeeCO..",
    "...OCCCCCCCCO...",
    "..OkkO....OkkO..",
    "..OEEO....OEEO..",
    "..OOOO....OOOO..",
    "................",
  ],
};

export default {
  name: "merchant",
  /** Ground tile behind this family's contact sheet. */
  ground: "moon_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {
    merchant_walk: { frames: ["merchant_0", "merchant_1"], delayMs: 200 },
    merchant_vendor_walk: {
      frames: ["merchant_vendor_0", "merchant_vendor_1"],
      delayMs: 200,
    },
    merchant_moon_walk: {
      frames: ["merchant_moon_0", "merchant_moon_1"],
      delayMs: 200,
    },
    merchant_mars_walk: {
      frames: ["merchant_mars_0", "merchant_mars_1"],
      delayMs: 200,
    },
  },
  /** Sprites the ground-contrast lint skips (none — every look must read). */
  contrastExempt: [],
};

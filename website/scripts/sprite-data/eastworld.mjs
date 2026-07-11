// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Eastworld family (see the `pixel-assets` skill): level 5 — the rift's
// far side, a knockoff wild-west theme park built in Russia and run on ZAI
// robotics. Sun-baked hardpan tiles, big WOODEN HOUSES (the town's tight
// streets — the largest obstacles in the game, built programmatically from a
// facade recipe), storefront wall rows, the control-center compound fence,
// robot cowboys (COWBOT, SALOON BRAWLER, TIN OUTLAW, LONGHORN), the
// celebrity staff (STEVEN SEAGULL, VLADIMIR PUTAIN, GERALD DEPARDIEU,
// EDWARD SNOW), the
// three GROK controllers (one drawing, three accent palettes) and THE ZAI
// SUPERCORE — a mainframe the size of a barn. One string per pixel row, one
// character per pixel; `.` is transparent and every other char must exist in
// CORE_PALETTE (sprite-data/core.mjs) or this family's local palette.

import { swapPalette } from "../asset-tools/palette.mjs";
import moon from "./moon.mjs";

/** Chars only this family draws with — merged with the core at build time. */
const PALETTE = {
  // The desert floor: sun-baked hardpan, kept warm and light so the dark
  // horde separates. Scrub patches in dry olive.
  z: [206, 172, 120], // hardpan base
  Z: [176, 142, 96], // hardpan shade
  u: [226, 196, 148], // hardpan light
  e: [138, 126, 70], // scrub olive
  d: [102, 92, 52], // scrub dark
  // Park architecture: weathered plank wood rides the core RAT ramp (B/E/S);
  // these add the dark roofing tin and glass.
  N: [58, 54, 68], // roofing tin / dark metal shells
  K: [12, 11, 18], // near-black: windows at night, SEAGULL's shades
  C: [70, 96, 150], // denim / PUTAIN's suit
  D: [92, 62, 40], // dark leather: hats, holsters, DEPARDIEU's coat
  X: [150, 60, 70], // wine red: DEPARDIEU's shirt, saloon trim
  // ZAI hardware accents: the controller glows (one char per controller so
  // BETA/GAMMA are palette swaps of ALPHA, never redraws).
  Q: [96, 240, 208], // GROK ALPHA cyan (the ZAI glow, as on the rift)
  I: [236, 96, 190], // GROK BETA magenta
  U: [240, 198, 88], // GROK GAMMA amber
  // MOSQUE's beach body: a belly-shade under the core skin `p`.
  s: [196, 142, 108],
};

// ---- Houses ------------------------------------------------------------------
// The town's signature: building-sized obstacles (rockSizes footprints at
// 16 px/cell — 3×2, 4×3, 5×3 cells) that make the streets genuinely tight.
// Hand-typing 80×48 grids is noise, so the facades are BUILT from a recipe:
// plank walls off the core wood ramp, a tin roof band, a dark doorway and
// glowing windows — deterministic, so the atlas only diffs when the recipe
// does. Same philosophy as the generated wound/worn variants.

/** Build one western house facade grid, `w`×`h` pixels. */
function buildHouse(w, h) {
  const rows = [];
  const roofH = Math.round(h * 0.3);
  const row = (chars) => chars.join("");
  for (let y = 0; y < h; y++) {
    const chars = [];
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      if (edge) {
        chars.push("O");
        continue;
      }
      if (y < roofH) {
        // The tin roof: dark band with a lit ridge and seams every 6 px.
        if (y === 1) chars.push("v");
        else if (x % 6 === 0) chars.push("O");
        else chars.push("N");
        continue;
      }
      if (y === roofH) {
        // The awning lip under the roof.
        chars.push("E");
        continue;
      }
      // Plank wall: horizontal boards with a seam every 4 rows, posts at the
      // corners, a centered doorway and one window per 2 cells of width.
      const doorW = 6;
      const doorL = Math.floor(w / 2 - doorW / 2);
      const inDoor =
        x >= doorL && x < doorL + doorW && y >= h - 1 - Math.round(h * 0.36);
      if (inDoor) {
        chars.push(x === doorL || x === doorL + doorW - 1 ? "E" : "K");
        continue;
      }
      // Windows: one per wing, glowing faintly (the hosts keep the lights on).
      const winY = roofH + 3;
      const winH = 5;
      const wing = Math.floor(w / 4);
      const inWin =
        y >= winY &&
        y < winY + winH &&
        ((x >= wing - 2 && x <= wing + 2) ||
          (x >= w - wing - 2 && x <= w - wing + 2));
      if (inWin) {
        chars.push(
          y === winY || y === winY + winH - 1 || x % 5 === 0 ? "E" : "U",
        );
        continue;
      }
      if (x === 1 || x === w - 2) {
        chars.push("E"); // corner posts
      } else if (y % 4 === 0) {
        chars.push("E"); // board seams
      } else if (y % 4 === 1 && x % 7 === 3) {
        chars.push("S"); // worn plank highlights
      } else {
        chars.push("B");
      }
    }
    rows.push(row(chars));
  }
  return rows;
}

const SPRITES = {
  // ---- Ground tiles (16×16, edges featureless so they tile) -----------------
  hardpan_0: [
    "zzzzzzzzzzzzzzzz",
    "zzzzuzzzzzzzzzzz",
    "zzzzzzzzzzzZzzzz",
    "zzzzzzzzzzzzzzzz",
    "zZzzzzzzuzzzzzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzzZzzzzzzuzz",
    "zzzzzzzzzzzzzzzz",
    "zzuzzzzzzzzzzzzz",
    "zzzzzzzzzZzzzzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzZzzzzzzuzzz",
    "zzzzzzzzzzzzzzzz",
    "zuzzzzzzzzZzzzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzuzzzzzzzz",
  ],
  hardpan_1: [
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzzzzuzzzzz",
    "zzZZzzzzzzzzzzzz",
    "zzzZzzzzzzzzuzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzZZzzzzzzz",
    "zuzzzzzZzzzzzzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzzzzzzZzzz",
    "zzzzuzzzzzzzzzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzzuzzzzzzz",
    "zzZzzzzzzzzzzzzz",
    "zzzzzzzzzzzzzuzz",
    "zzzzzzzzZzzzzzzz",
    "zzzzzzzzzzzzzzzz",
  ],
  scrub_0: [
    "zzzzzzzzzzzzzzzz",
    "zzzezzzzzzzzzzzz",
    "zzeeezzzzzzdzzzz",
    "zzzezzzzzzzzzzzz",
    "zzzzzzzzezzzzzzz",
    "zzzzzzzeeezzzzzz",
    "zzdzzzzzezzzzzzz",
    "zzzzzzzzzzzzezzz",
    "zzzzzzzzzzzeeezz",
    "zzzezzzzzzzzezzz",
    "zzeeezzzzzzzzzzz",
    "zzzezzzdzzzzzzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzzzzezzzzz",
    "zzzzzezzzeeezzzz",
    "zzzzzzzzzzezzzzz",
  ],
  scrub_1: [
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzzezzzzzzz",
    "zzzzzzzeeezzzzzz",
    "zzzzzzzzezzzzzzz",
    "zzezzzzzzzzzzdzz",
    "zeeezzzzzzzzzzzz",
    "zzezzzzzzzzzzzzz",
    "zzzzzzzzzzzezzzz",
    "zzzzzzzzzzeeezzz",
    "zzzzdzzzzzzezzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzezzzzzzzzzzzz",
    "zzeeezzzzzzzzzzz",
    "zzzezzzzzzdzzzzz",
    "zzzzzzzzzzzzzzzz",
    "zzzzzzzzzzzzzzzz",
  ],
  // ---- The houses (built from the recipe above) -----------------------------
  house_3x2: buildHouse(48, 32),
  house_4x3: buildHouse(64, 48),
  house_5x3: buildHouse(80, 48),
  // ---- Walls -----------------------------------------------------------------
  // The storefront wall block: a plank facade with an awning lip, chained
  // every ~16 px by the engine's wall segments into a main-street row.
  storefront: [
    "OOOOOOOOOOOOOOOO",
    "OvvvvvvvvvvvvvvO",
    "ONNNNNONNNNNONNO",
    "ONNNNNONNNNNONNO",
    "OEEEEEEEEEEEEEEO",
    "OBBBSBBBBBBBBBBO",
    "OBBBBBBBBBSBBBBO",
    "OEEEEEEEEEEEEEEO",
    "OBBBBBUUBBBBBBBO",
    "OBSBBBUUBBBBSBBO",
    "OBBBBBEEBBBBBBBO",
    "OEEEEEEEEEEEEEEO",
    "OBBBBBBBBBBBBBBO",
    "OBBSBBBBBBSBBBBO",
    "OEEEEEEEEEEEEEEO",
    "OOOOOOOOOOOOOOOO",
  ],
  // The compound fence: ZAI-printed steel panels with a warning stripe.
  compound_fence: [
    "OOOOOOOOOOOOOOOO",
    "OVVVVVVVVVVVVVVO",
    "OvvvvvvvvvvvvvvO",
    "OvvQvvvvvvvvQvvO",
    "OvvvvvvvvvvvvvvO",
    "ObbbbbbbbbbbbbbO",
    "OyyKKyyKKyyKKyyO",
    "OKKyyKKyyKKyyKKO",
    "ObbbbbbbbbbbbbbO",
    "OvvvvvvvvvvvvvvO",
    "OvvvvvvvvvvvvvvO",
    "ObvvvvvvvvvvvvbO",
    "ObbbbbbbbbbbbbbO",
    "ObbbbbbbbbbbbbbO",
    "ObbbbbbbbbbbbbbO",
    "OOOOOOOOOOOOOOOO",
  ],
  // ---- Street furniture -------------------------------------------------------
  // A whiskey barrel (jumpable cover).
  barrel: [
    "................",
    "................",
    "....OOOOOOOO....",
    "...OBSSBBSBBO...",
    "...OEEEEEEEEO...",
    "..OBBSBBBBSBBO..",
    "..OBBBBBBBBBBO..",
    "..OEEEEEEEEEEO..",
    "..OBBBBSBBBBBO..",
    "..OBSBBBBBBSBO..",
    "..OEEEEEEEEEEO..",
    "...OBBBBSBBBO...",
    "...OBBBBBBBBO...",
    "....OOOOOOOO....",
    "................",
    "................",
  ],
  // A buckboard wagon, parked forever (jumpable).
  wagon: [
    "................",
    "................",
    "................",
    "..O..........O..",
    ".OBOOOOOOOOOOBO.",
    ".OBBBBBBBBBBBBO.",
    ".OEBSBBBBSBBBEO.",
    ".OEEEEEEEEEEEEO.",
    "..OOOOOOOOOOOO..",
    "...ONNO..ONNO...",
    "..ONKKNOONKKNO..",
    "..ONKKNOONKKNO..",
    "...ONNO..ONNO...",
    "....O......O....",
    "................",
    "................",
  ],
  // The park's fake cactus (jumpable — it's foam over a servo).
  cactus: [
    "................",
    "......OOO.......",
    ".....OGlGO......",
    ".....OGGGO......",
    ".OO..OGGGO......",
    "OGlO.OGGGO.OOO..",
    "OGGO.OGGGO.OlGO.",
    "OGGO.OGGGO.OGGO.",
    "OGGOOOGGGOOOGGO.",
    "OGgGGGGGGGGGgGO.",
    ".OOGGGGGGGGGOO..",
    "...OGgGGGgGO....",
    "....OGGGGGO.....",
    "....OGGGGGO.....",
    "....OgGGGgO.....",
    "....OOOOOOO.....",
  ],
  // ---- Decor (flat scatter, no collision) -------------------------------------
  tumbleweed: [
    "............",
    "...OEEBO....",
    "..OBSBEBO...",
    ".OEBOBOBEO..",
    ".OBOBSBOBO..",
    ".OEBOBOBEO..",
    ".OBOBBSOBO..",
    "..OBEBOBO...",
    "...OBEBO....",
    "............",
    "............",
    "............",
  ],
  cow_skull: [
    "............",
    ".OO......OO.",
    "OaaO....OaaO",
    "OaaaOOOOaaaO",
    ".OOaaaaaaOO.",
    "..OaaaaaaO..",
    "..OaKaaKaO..",
    "..OaaaaaaO..",
    "...OaaaaO...",
    "...OaKKaO...",
    "....OOOO....",
    "............",
  ],
  dry_shrub: [
    "............",
    "............",
    "....ee.dd...",
    "..dde.ee....",
    "...eedeee...",
    "....dedd....",
    "..eeede.....",
    "....OEO.....",
    "....OEO.....",
    "............",
    "............",
    "............",
  ],
  horseshoe: [
    "........",
    ".OO..OO.",
    ".OvO.OvO",
    ".OvO.OvO",
    ".OvO.OvO",
    ".OvvOvvO",
    "..OvvvO.",
    "...OOO..",
  ],
  // ---- Landmarks ---------------------------------------------------------------
  // The park gate: a top-heavy BILLBOARD reading EASTWORLD on two tall timber
  // posts, with the "POWERED BY ZAI" cyan fine-print plate hung beneath (both
  // named in the hero's arrival monologue). Legible wordmark in a 3x5 block
  // font; wine-red rule under it, stone footings at the base (anchor: base).
  eastworld_gate: [
    "..OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO..",
    "..OEOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOEO..",
    "..OEOuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuOEO..",
    "..OEOSKKKSKKKSKKKSKKKSKSKSKKKSKKKSKSSSKKSSSOEO..",
    "..OEOSKSSSKSKSKSSSSKSSKSKSKSKSKSKSKSSSKSKSSOEO..",
    "..OEOSKKKSKKKSKKKSSKSSKSKSKSKSKKKSKSSSKSKSSOEO..",
    "..OEOSKSSSKSKSSSKSSKSSKKKSKSKSKKSSKSSSKSKSSOEO..",
    "..OEOSKKKSKSKSKKKSSKSSKKKSKKKSKSKSKKKSKKSSSOEO..",
    "..OEOSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSOEO..",
    "..OEOXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXOEO..",
    "..OEOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOEO..",
    "..OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO..",
    "....OOEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEOO....",
    "....OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO....",
    "....OSBBO.....ONQQQQQQQQQQQQQQQQNO.....OSBBO....",
    "....OSEEO.....ONccccccccccccccccNO.....OSEEO....",
    "....OSBBO.....OOOOOOOOOOOOOOOOOOOO.....OSBBO....",
    "....OSBBO..............................OSBBO....",
    "....OSBBO..............................OSBBO....",
    "....OSEEO..............................OSEEO....",
    "....OSBBO..............................OSBBO....",
    "....OSBBO..............................OSBBO....",
    "....OSBBO..............................OSBBO....",
    "....OSEEO..............................OSEEO....",
    "....OSBBO..............................OSBBO....",
    "....OSBBO..............................OSBBO....",
    "....OSBBO..............................OSBBO....",
    "....OSEEO..............................OSEEO....",
    "....OSBBO..............................OSBBO....",
    "....OSBBO..............................OSBBO....",
    "....OSBBO..............................OSBBO....",
    "...EEEEEEE............................EEEEEEE...",
  ],
  // The town water tower, leaking since opening day.
  water_tower: [
    "....OOOOOOOOOOOOOOOOOOOO....",
    "...OvvvvvvvvvvvvvvvvvvvvO...",
    "..OBBBBBBBBBBBBBBBBBBBBBBO..",
    "..OBSBBBBSBBBBBBSBBBBBSBBO..",
    "..OEEEEEEEEEEEEEEEEEEEEEEO..",
    "..OBBBBBBBBBBBBBBBBBBBBBBO..",
    "..OBBBSBBBBBBSBBBBBBBBSBBO..",
    "..OEEEEEEEEEEEEEEEEEEEEEEO..",
    "..OBBBBBBBBBBBBBBBBBBBBBBO..",
    "..OBBBBBBSBBBBBBSBBBBBBBBO..",
    "...OEEEEEEEEEEEEEEEEEEEEO...",
    "....OOOOOOOOOOOOOOOOOOOO....",
    "......OEEO........OEEO......",
    "......OBBO..OEEO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBOOOBBBBOOOBBO......",
    "......OBBEEEBBBBEEEBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OBBO..OBBO..OBBO......",
    "......OEEO..OEEO..OEEO......",
    "......OEEO..OEEO..OEEO......",
    "......OOOO..OOOO..OOOO......",
    "............................",
    "............................",
  ],
  // The control center: ZAI's barn-sized ops building, deck plating and glow.
  control_center: [
    "....OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO....",
    "...OvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvO...",
    "..ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO..",
    "..ONNQNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNQNNNO..",
    "..ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO..",
    "..OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO..",
    "..OvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvO..",
    "..OvvQQvvvvvvvvQQvvvvvvvvvvvvvvvvvvvvvvQQvvvvvvvvvvvvQQvvO..",
    "..OvvQQvvvvvvvvQQvvvvvvvvvvvvvvvvvvvvvvQQvvvvvvvvvvvvQQvvO..",
    "..OvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvO..",
    "..ObbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbO..",
    "..OvvvvvvvvvvvvvvvvvvvvvKKKKKKKKvvvvvvvvvvvvvvvvvvvvvvvvvO..",
    "..OvvvvvvvvvvvvvvvvvvvvKKKKKKKKKKvvvvvvvvvvvvvvvvvvvvvvvvO..",
    "..OvvvvvvvvvvvvvvvvvvvvKKQQQQQQKKvvvvvvvvvvvvvvvvvvvvvvvvO..",
    "..OvvvvvvvvvvvvvvvvvvvvKKKKKKKKKKvvvvvvvvvvvvvvvvvvvvvvvvO..",
    "..OvvvvvvvvvvvvvvvvvvvvKKKKKKKKKKvvvvvvvvvvvvvvvvvvvvvvvvO..",
    "..ObbbbbbbbbbbbbbbbbbbbKKKKKKKKKKbbbbbbbbbbbbbbbbbbbbbbbbO..",
    "..ObbbbbbbbbbbbbbbbbbbbKKKKKKKKKKbbbbbbbbbbbbbbbbbbbbbbbbO..",
    "...OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO...",
    "............................................................",
    "............................................................",
  ],
  // ELON MOSQUE, beach form — two universes of fleeing have not been kind.
  // Traced from the infamous beach photo: SIDE PROFILE, facing left — the
  // swept-back hair, the puckered lips leading the face, the magnificent
  // belly ballooning out front (shaded underside, sunburn blotch), the back
  // arm hanging with the one gold watch he couldn't sell, black board
  // shorts, skinny bare legs. 48×48 boss frames; the stride alternates.
  elon_mosque_beach_0: [
    "................................................",
    "................................................",
    "...................OOOOOOO......................",
    ".................OOkkkkkkkO.....................",
    "................OkkkkkkkkkkO....................",
    "...............OkkkkkkkkkkkkO...................",
    "...............OppkkkkkkkkkkO...................",
    "...............OppppppppkkkkO...................",
    "...............OppppppppkkkkO...................",
    "..............OppOppppppkkkkO...................",
    "..............OOpppppppskkkkO...................",
    ".............OrrppppppppkkkkO...................",
    "..............OsppppppppkkkkO...................",
    "...............OspppppppppOO....................",
    "................OOpppppppO......................",
    "................OOOppppppOOO....................",
    "...............OppppppppppppO.OO................",
    "..............OppppppppppppppOppO...............",
    ".............OpppppppppppppppOppO...............",
    "............OppppppppppppppppOppO...............",
    "...........OppppOppppppppppppOppO...............",
    "..........OppppppppppppppppppOppO...............",
    ".........OpppppppppppppppppppOppO...............",
    ".........OpppppppppppppppppppOppO...............",
    "........OppppppppppppppppppppOppO...............",
    "........OpppprrppppppppppppppOppO...............",
    "........OpppprprpppppppppppppOyyO...............",
    "........OssssssspppppppppppppOppO...............",
    ".........OsssssspppppppppppppOssO...............",
    "..........OssssspppppppppppppOOO................",
    "...........OOssssppppppppppppO..................",
    ".............OOsssppppppppppO...................",
    "............OKKKKKKKKKKKKKKKKO..................",
    "............OKKKKKKKKKKKKKKKKO..................",
    "............OKKNNNNNNNNNNNNKKO..................",
    "............OKKKKKKKKKKKKKKKKO..................",
    ".............OKKKKKKKKKKKKKKO...................",
    ".............OKKNNNNNNNNNNKKO...................",
    ".............OKKKKKKOOKKKKKKO...................",
    ".............OKKKKKKOOKKKKKKO...................",
    "..............OpppOO..OpppOO....................",
    "..............OpppO...OpppO.....................",
    "..............OpppO...OpppO.....................",
    "..............OpppO...OpppO.....................",
    "............OOOpppO..OOpppO.....................",
    "...........OppppppO.OpppppO.....................",
    "............OOOOOO...OOOOO......................",
    "................................................",
  ],
  elon_mosque_beach_1: [
    "................................................",
    "................................................",
    "...................OOOOOOO......................",
    ".................OOkkkkkkkO.....................",
    "................OkkkkkkkkkkO....................",
    "...............OkkkkkkkkkkkkO...................",
    "...............OppkkkkkkkkkkO...................",
    "...............OppppppppkkkkO...................",
    "...............OppppppppkkkkO...................",
    "..............OppOppppppkkkkO...................",
    "..............OOpppppppskkkkO...................",
    ".............OrrppppppppkkkkO...................",
    "..............OsppppppppkkkkO...................",
    "...............OspppppppppOO....................",
    "................OOpppppppO......................",
    "................OOOppppppOOO....................",
    "...............OppppppppppppO.OO................",
    "..............OppppppppppppppOppO...............",
    ".............OpppppppppppppppOppO...............",
    "............OppppppppppppppppOppO...............",
    "...........OppppOppppppppppppOppO...............",
    "..........OppppppppppppppppppOppO...............",
    ".........OpppppppppppppppppppOppO...............",
    ".........OpppppppppppppppppppOppO...............",
    "........OppppppppppppppppppppOppO...............",
    "........OpppprrppppppppppppppOppO...............",
    "........OpppprprpppppppppppppOyyO...............",
    "........OssssssspppppppppppppOppO...............",
    ".........OsssssspppppppppppppOssO...............",
    "..........OssssspppppppppppppOOO................",
    "...........OOssssppppppppppppO..................",
    ".............OOsssppppppppppO...................",
    "............OKKKKKKKKKKKKKKKKO..................",
    "............OKKKKKKKKKKKKKKKKO..................",
    "............OKKNNNNNNNNNNNNKKO..................",
    "............OKKKKKKKKKKKKKKKKO..................",
    ".............OKKKKKKKKKKKKKKO...................",
    ".............OKKNNNNNNNNNNKKO...................",
    ".............OKKKKKKOOKKKKKKO...................",
    ".............OKKKKKKOOKKKKKKO...................",
    "..............OOOpppOOpppOOO....................",
    "................OpppOOpppO......................",
    "................OpppOOpppO......................",
    "................OpppOOpppO......................",
    "..............OOOpppOOpppO......................",
    ".............OpppppppppppO......................",
    "..............OOOOOOOOOOO.......................",
    "................................................",
  ],
  // ---- The horde (16×16 minions, two walk frames each) ------------------------
  // COWBOT — the greeter host: steel body, leather hat, red bandana.
  cowbot_0: [
    "................",
    "....ODDDDDO.....",
    "..ODDDDDDDDDO...",
    "...OvvvvvvvO....",
    "...OvKvvvKvO....",
    "...OvvvvvvvO....",
    "...OrrrrrrrO....",
    "..OvvvvvvvvvO...",
    ".OvOvvvvvvvOvO..",
    ".OvOvvbvbvvOvO..",
    ".OvOvvvvvvvOvO..",
    "..OOvbbbbbvOO...",
    "....ObbObbO.....",
    "....ObbObbO.....",
    "....ONNONNO.....",
    "................",
  ],
  cowbot_1: [
    "................",
    "....ODDDDDO.....",
    "..ODDDDDDDDDO...",
    "...OvvvvvvvO....",
    "...OvKvvvKvO....",
    "...OvvvvvvvO....",
    "...OrrrrrrrO....",
    "..OvvvvvvvvvO...",
    ".OvOvvvvvvvOvO..",
    ".OvOvvbvbvvOvO..",
    ".OvOvvvvvvvOvO..",
    "..OOvbbbbbvOO...",
    "...ObbO.ObbO....",
    "..ObbO...ObbO...",
    "..ONNO...ONNO...",
    "................",
  ],
  // SALOON BRAWLER — the bar-fight host: a burly steel robot in a torn red
  // saloon vest (white shirt column, gold button), broad shoulders and big
  // low FISTS. Bulkier than the cowbot greeter. _1 bobs the fists up a row
  // and splays the legs (winding a swing).
  saloon_brawler_0: [
    "......OOOO......",
    "......ONNO......",
    "......ORRO......",
    "......OOOO......",
    ".OOOOOOOOOOOOOO.",
    ".OvOOOOOOOOOOvO.",
    "..v.OXXwwXXr.v..",
    "..v.OXXowXXO.v..",
    "..v.OXXwwXXO.v..",
    "OOOOrXXwwXXOOOOO",
    "OVAOOXXwwXXOOAVO",
    "OAAOOOOOOOOOOAAO",
    "OOOO.OO..OO.OOOO",
    ".....OO..OO.....",
    ".....OO..OO.....",
    "................",
  ],
  saloon_brawler_1: [
    "......OOOO......",
    "......ONNO......",
    "......ORRO......",
    "......OOOO......",
    ".OOOOOOOOOOOOOO.",
    ".OvOOOOOOOOOOvO.",
    "..v.OXXwwXXr.v..",
    "..v.OXXowXXO.v..",
    "OOOOOXXwwXXOOOOO",
    "OVAOrXXwwXXOOAVO",
    "OAAOOXXwwXXOOAAO",
    "OOOOOOOOOOOOOOOO",
    "....OO....OO....",
    "....OO....OO....",
    "....OO....OO....",
    "................",
  ],
  // TIN OUTLAW — the quick-draw bandit: a LEAN robot gunslinger under a
  // wide-brim hat and a blue bandana MASK, a dark duster with a buckled
  // gunbelt, and a steel six-shooter leveled at the hip. Leaner than the
  // brawler. _1 splays the legs and re-levels the gun a pixel (recoil).
  tin_outlaw_0: [
    "......OOOO......",
    "......OOOO......",
    "...DDDDDDDDDD...",
    "...EEEOOOOEEE...",
    "......KvvK......",
    "......CCCC......",
    "....OOOOOOOO....",
    "...NONNDDNNO....",
    "...NONNDDNNON...",
    "...NOEEoEEEODAVA",
    "...NONNDDNNO.D..",
    "...NODDDDDDO....",
    "....OOOOOOOO....",
    ".....OO..OO.....",
    ".....OO..OO.....",
    "................",
  ],
  tin_outlaw_1: [
    "......OOOO......",
    "......OOOO......",
    "...DDDDDDDDDD...",
    "...EEEOOOOEEE...",
    "......KvvK......",
    "......CCCC......",
    "....OOOOOOOO....",
    "...NONNDDNNON...",
    "...NONNDDNNODAVA",
    "...NOEEoEEEO.D..",
    "...NONNDDNNO....",
    "...NODDDDDDO....",
    "....OOOOOOOO....",
    "....OO....OO....",
    "....OO....OO....",
    "................",
  ],
  // LONGHORN — the robotic steer HEAVY (290hp, "size of a stagecoach"): drawn
  // on a bigger 24x20 canvas so it LOOMS over the 16px fodder. Broad steel
  // horns, a dark iron faceplate head with cyan eyes and a vented muzzle, a
  // bulky plated brown chassis with an amber hazard brand, four thick legs.
  longhorn_0: [
    "........................",
    "..O..................O..",
    "..a..................a..",
    "..a..................a..",
    "...Aa..............aA...",
    ".....aaOOOOOOOOOOaa.....",
    ".......ONNNAvNNNO.......",
    ".......OQQNAvNQQO.......",
    ".......ONNNAvNNNO.......",
    ".......ONNNAvNNNO.......",
    ".......ONOOOOOONO.......",
    "..OOOOOOOOOOOOOOOOOOOO..",
    "..OESSSSSSSSSSSSSSSSEO..",
    "..OEBBBBBBOOOOBBBBBBEO..",
    "..OEEEEEEEOUUOEEEEEEEO..",
    "..OEBBBBBBOOOOBBBBBBEO..",
    "..OEEEEEEEEEEEEEEEEEEO..",
    "..OOOOOOOOOOOOOOOOOOOO..",
    "...OO...OO....OO...OO...",
    "...OO...OO....OO...OO...",
  ],
  longhorn_1: [
    "........................",
    "..O..................O..",
    "..a..................a..",
    "..a..................a..",
    "...Aa..............aA...",
    ".....aaOOOOOOOOOOaa.....",
    ".......ONNNAvNNNO.......",
    ".......OQQNAvNQQO.......",
    ".......ONNNAvNNNO.......",
    ".......ONNNAvNNNO.......",
    ".......ONOOOOOONO.......",
    "..OOOOOOOOOOOOOOOOOOOO..",
    "..OESSSSSSSSSSSSSSSSEO..",
    "..OEBBBBBBOOOOBBBBBBEO..",
    "..OEEEEEEEOUUOEEEEEEEO..",
    "..OEBBBBBBOOOOBBBBBBEO..",
    "..OEEEEEEEEEEEEEEEEEEO..",
    "..OOOOOOOOOOOOOOOOOOOO..",
    "..OO.....OO..OO.....OO..",
    "..OO................OO..",
  ],
  // ---- The celebrity staff (24×24 elites) --------------------------------------
  // STEVEN SEAGULL — all black, shades, the ponytail. He is not in a hurry.
  steven_seagull_0: [
    "........................",
    "........................",
    "..........OOOO..........",
    ".........OkkkkO.........",
    "........OkkkkkkO........",
    "........OppppppO........",
    "........OKKKKKKO........",
    "........OppppppO........",
    ".........OppppO.kO......",
    "........OONNNNOOkO......",
    "......OONNNNNNNNkO......",
    ".....ONNNNNNNNNNOO......",
    ".....ONNONNNNONNO.......",
    ".....ONNONNNNONNO.......",
    ".....ONNONNNNONNO.......",
    ".....OppONNNNOppO.......",
    "......OONNNNNNOO........",
    ".......ONNNNNNO.........",
    ".......ONNONNNO.........",
    ".......ONNONNNO.........",
    ".......ONNONNNO.........",
    ".......OKKOOKKO.........",
    ".......OOOO.OOO.........",
    "........................",
  ],
  steven_seagull_1: [
    "........................",
    "........................",
    "..........OOOO..........",
    ".........OkkkkO.........",
    "........OkkkkkkO........",
    "........OppppppO........",
    "........OKKKKKKO........",
    "........OppppppO........",
    ".........OppppO.kO......",
    "........OONNNNOOkO......",
    "......OONNNNNNNNkO......",
    ".....ONNNNNNNNNNOO......",
    ".....ONNONNNNONNO.......",
    ".....ONNONNNNONNO.......",
    ".....ONNONNNNONNO.......",
    ".....OppONNNNOppO.......",
    "......OONNNNNNOO........",
    ".......ONNNNNNO.........",
    "......ONNO.ONNNO........",
    "......ONNO..ONNO........",
    "......ONNO..ONNO........",
    "......OKKO..OKKO........",
    "......OOOO..OOOO........",
    "........................",
  ],
  // VLADIMIR PUTAIN — small, pale, dark suit, red tie, riding posture.
  vladimir_putain_0: [
    "........................",
    "........................",
    "........................",
    "..........OOOO..........",
    ".........OppppO.........",
    ".........OppppO.........",
    ".........OpKpKO.........",
    ".........OppppO.........",
    "..........OppO..........",
    ".........OCCCCO.........",
    ".......OCCCrrCCCO.......",
    "......OCCCCrrCCCCO......",
    "......OCpOCrrCOpCO......",
    "......OCpOCCCCOpCO......",
    "......OCpOCCCCOpCO......",
    "......OppOCCCCOppO......",
    ".......OOCCCCCCOO.......",
    "........OCCCCCCO........",
    "........OCCOOCCO........",
    "........OCCO.OCCO.......",
    "........OCCO.OCCO.......",
    "........OKKO.OKKO.......",
    "........OOOO.OOOO.......",
    "........................",
  ],
  vladimir_putain_1: [
    "........................",
    "........................",
    "........................",
    "..........OOOO..........",
    ".........OppppO.........",
    ".........OppppO.........",
    ".........OpKpKO.........",
    ".........OppppO.........",
    "..........OppO..........",
    ".........OCCCCO.........",
    ".......OCCCrrCCCO.......",
    "......OCCCCrrCCCCO......",
    "......OCpOCrrCOpCO......",
    "......OCpOCCCCOpCO......",
    "......OCpOCCCCOpCO......",
    "......OppOCCCCOppO......",
    ".......OOCCCCCCOO.......",
    "........OCCCCCCO........",
    ".......OCCO.OCCO........",
    "......OCCO...OCCO.......",
    "......OCCO...OCCO.......",
    "......OKKO...OKKO.......",
    "......OOOO...OOOO.......",
    "........................",
  ],
  // GERALD DEPARDIEU — enormous: a 24-wide wall of coat, scarf and appetite.
  gerald_depardieu_0: [
    "........................",
    "........................",
    ".........OOOOO..........",
    "........OkkkkkO.........",
    ".......OppppppppO.......",
    ".......OppppppppO.......",
    ".......OpKppppKpO.......",
    ".......OppppppppO.......",
    ".......OpppppppppO......",
    "......OXXXXXXXXXXO......",
    "....OXXXXXXXXXXXXXXO....",
    "..ODDXXXXXXXXXXXXDDDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".OppODXXXXXXXXXXDOppO...",
    "..OOODXXXXXXXXXXDOOO....",
    ".....ODDDDDDDDDDO.......",
    ".....ODDDODDDODDO.......",
    ".....ODDDODDDODDO.......",
    ".....ODDDODDDODDO.......",
    ".....OKKKO...OKKKO......",
    ".....OOOOO...OOOOO......",
  ],
  gerald_depardieu_1: [
    "........................",
    "........................",
    ".........OOOOO..........",
    "........OkkkkkO.........",
    ".......OppppppppO.......",
    ".......OppppppppO.......",
    ".......OpKppppKpO.......",
    ".......OppppppppO.......",
    ".......OpppppppppO......",
    "......OXXXXXXXXXXO......",
    "....OXXXXXXXXXXXXXXO....",
    "..ODDXXXXXXXXXXXXDDDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".ODDODXXXXXXXXXXDODDO...",
    ".OppODXXXXXXXXXXDOppO...",
    "..OOODXXXXXXXXXXDOOO....",
    ".....ODDDDDDDDDDO.......",
    "....ODDDO.ODDDDDO.......",
    "....ODDDO..ODDDO........",
    "....ODDDO..ODDDO........",
    "....OKKKO..OKKKO........",
    "....OOOOO..OOOOO........",
  ],
  // EDWARD SNOW — the whistleblower in exile: pale, slight, rectangular
  // glasses, dark hair, a grey jacket over a dark shirt — and the laptop
  // that never leaves his side, its screen edge glowing ZAI cyan (the
  // archive is always plugged in somewhere).
  edward_snow_0: [
    "........................",
    "..........OOOO..........",
    ".........OkkkkO.........",
    "........OkkkkkkO........",
    "........OppppppO........",
    "........OVVppVVO........",
    "........OppppppO........",
    ".........OppppO.........",
    ".........OvvvvO.........",
    ".......OvvvNNvvvO.......",
    "......OvvvvNNvvvvO......",
    "......OvvvvNNvvvvO......",
    "......OvpOvNNvOpvO......",
    "......OvpOvNNvOpvOOOO...",
    "......OvpOvvvvOpvOQVO...",
    "......OppOvvvvOppOQVO...",
    ".......OOvvvvvvOO.OOO...",
    "........OvvvvvvO........",
    "........ONNOONNO........",
    "........ONNO.ONNO.......",
    "........ONNO.ONNO.......",
    "........OKKO.OKKO.......",
    "........OOOO.OOOO.......",
    "........................",
  ],
  edward_snow_1: [
    "........................",
    "..........OOOO..........",
    ".........OkkkkO.........",
    "........OkkkkkkO........",
    "........OppppppO........",
    "........OVVppVVO........",
    "........OppppppO........",
    ".........OppppO.........",
    ".........OvvvvO.........",
    ".......OvvvNNvvvO.......",
    "......OvvvvNNvvvvO......",
    "......OvvvvNNvvvvO......",
    "......OvpOvNNvOpvO......",
    "......OvpOvNNvOpvOOOO...",
    "......OvpOvvvvOpvOQVO...",
    "......OppOvvvvOppOQVO...",
    ".......OOvvvvvvOO.OOO...",
    "........OvvvvvvO........",
    ".......ONNO.ONNO........",
    "......ONNO...ONNO.......",
    "......ONNO...ONNO.......",
    "......OKKO...OKKO.......",
    "......OOOO...OOOO.......",
    "........................",
  ],
  // GROK ALPHA — a ZAI controller on a mobile chassis: monolith head, one
  // bright eye, spindle legs. BETA and GAMMA are palette swaps (below).
  grok_alpha_0: [
    "........................",
    "........................",
    "........OOOOOOOO........",
    ".......ONNNNNNNNO.......",
    ".......ONQQQQQQNO.......",
    ".......ONQNNNNQNO.......",
    ".......ONQNQQNQNO.......",
    ".......ONQNQQNQNO.......",
    ".......ONQNNNNQNO.......",
    ".......ONQQQQQQNO.......",
    ".......ONNNNNNNNO.......",
    "........ONNNNNNO........",
    ".......ONvNNNNvNO.......",
    "......ONvvNNNNvvNO......",
    "......ONvONNNNOvNO......",
    "......ONvONNNNOvNO......",
    ".......OOONNNNOOO.......",
    "........ONNONNO.........",
    "........ONNONNO.........",
    "........ObbObbO.........",
    "........ONNONNO.........",
    "........OOOOOOO.........",
    "........................",
    "........................",
  ],
  grok_alpha_1: [
    "........................",
    "........................",
    "........................",
    "........OOOOOOOO........",
    ".......ONNNNNNNNO.......",
    ".......ONQQQQQQNO.......",
    ".......ONQNNNNQNO.......",
    ".......ONQNQQNQNO.......",
    ".......ONQNQQNQNO.......",
    ".......ONQNNNNQNO.......",
    ".......ONQQQQQQNO.......",
    ".......ONNNNNNNNO.......",
    "........ONNNNNNO........",
    ".......ONvNNNNvNO.......",
    "......ONvvNNNNvvNO......",
    "......ONvONNNNOvNO......",
    ".......OOONNNNOOO.......",
    ".......ONNO.ONNO........",
    "......ONNO...ONNO.......",
    "......ObbO...ObbO.......",
    "......ONNO...ONNO.......",
    "......OOOO...OOOO.......",
    "........................",
    "........................",
  ],
  // THE ZAI SUPERCORE — a 48×48 mainframe: server towers, one enormous eye,
  // cooling stacks. It does not walk; the frames pulse its lights.
  zai_supercore_0: [
    "................................................",
    "................................................",
    "......OOOO..........OOOO..........OOOO..........",
    "......ONNO..........ONNO..........ONNO..........",
    "....OOONNOOOOOOOOOOOONNOOOOOOOOOOOONNOOOO.......",
    "...ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO......",
    "...ONvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvNQNQNQNNNNNNNNNNNNNNNNNNNNNQNQNQNvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvNNNNNNNNNOOOOOOOOOOOONNNNNNNNNNNNvNO......",
    "...ONvNNNNNNNOONNNNNNNNNNNNOONNNNNNNNNNvNO......",
    "...ONvNNNNNOONNNNNNNNNNNNNNNNOONNNNNNNNvNO......",
    "...ONvNNNNONNNNNNQQQQQQQQNNNNNNONNNNNNNvNO......",
    "...ONvNNNNONNNNQQQQQQQQQQQQNNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQQKKKKKKQQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKKKKKKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKKQQKKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKQQQQKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKKQQKKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKKKKKKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQQKKKKKKQQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNNQQQQQQQQQQQQNNNNONNNNNNNvNO......",
    "...ONvNNNNONNNNNNQQQQQQQQNNNNNNONNNNNNNvNO......",
    "...ONvNNNNNOONNNNNNNNNNNNNNNNOONNNNNNNNvNO......",
    "...ONvNNNNNNNOONNNNNNNNNNNNOONNNNNNNNNNvNO......",
    "...ONvNNNNNNNNNOOOOOOOOOOOONNNNNNNNNNNNvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvNQNQNNNNNNNNNNNNNNNNNNNNNNNNNQNQNvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvNO......",
    "...ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO......",
    "...ONbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNO......",
    "...ONbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNO......",
    "...ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO......",
    "....OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO......",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
  ],
  zai_supercore_1: [
    "................................................",
    "................................................",
    "......OOOO..........OOOO..........OOOO..........",
    "......ONQO..........ONQO..........ONQO..........",
    "....OOONNOOOOOOOOOOOONNOOOOOOOOOOOONNOOOO.......",
    "...ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO......",
    "...ONvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvQNQNQNNNNNNNNNNNNNNNNNNNNNNQNQNQNvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvNNNNNNNNNOOOOOOOOOOOONNNNNNNNNNNNvNO......",
    "...ONvNNNNNNNOONNNNNNNNNNNNOONNNNNNNNNNvNO......",
    "...ONvNNNNNOONNNNNNNNNNNNNNNNOONNNNNNNNvNO......",
    "...ONvNNNNONNNNNNQQQQQQQQNNNNNNONNNNNNNvNO......",
    "...ONvNNNNONNNNQQQQQQQQQQQQNNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQQKKKKKKQQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKKKKKKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKQQQQKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKQQQQKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKQQQQKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQKKKKKKKKQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNQQQQKKKKKKQQQQNNNONNNNNNNvNO......",
    "...ONvNNNNONNNNQQQQQQQQQQQQNNNNONNNNNNNvNO......",
    "...ONvNNNNONNNNNNQQQQQQQQNNNNNNONNNNNNNvNO......",
    "...ONvNNNNNOONNNNNNNNNNNNNNNNOONNNNNNNNvNO......",
    "...ONvNNNNNNNOONNNNNNNNNNNNOONNNNNNNNNNvNO......",
    "...ONvNNNNNNNNNOOOOOOOOOOOONNNNNNNNNNNNvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvQNQNNNNNNNNNNNNNNNNNNNNNNNNNNQNQNvNO......",
    "...ONvNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNvNO......",
    "...ONvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvNO......",
    "...ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO......",
    "...ONbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNO......",
    "...ONbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNbbNNO......",
    "...ONNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNO......",
    "....OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.......",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
    "................................................",
  ],
};

// GROK BETA / GAMMA — the same controller chassis, re-accented (never a
// redraw): magenta and amber glows over the shared monolith body.
for (const frame of ["0", "1"]) {
  SPRITES[`grok_beta_${frame}`] = swapPalette(SPRITES[`grok_alpha_${frame}`], {
    Q: "I",
  });
  SPRITES[`grok_gamma_${frame}`] = swapPalette(SPRITES[`grok_alpha_${frame}`], {
    Q: "U",
  });
}

// EASTROCK — the desert boulders, a warm-sand palette swap of the moonrock
// slabs (the mars precedent: terrain furniture costs zero redraws). The
// plain 16×16 doubles as the compound's hand-placed cover rocks.
SPRITES.eastrock = swapPalette(moon.sprites.moonrock_1x1, { f: "Z", F: "u" });
SPRITES.eastrock_1x1 = SPRITES.eastrock;
SPRITES.eastrock_1x2 = swapPalette(moon.sprites.moonrock_1x2, {
  f: "Z",
  F: "u",
});
SPRITES.eastrock_2x2 = swapPalette(moon.sprites.moonrock_2x2, {
  f: "Z",
  F: "u",
});

export default {
  name: "eastworld",
  /** Ground tile behind this family's contact sheet. */
  ground: "hardpan_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {
    cowbot_walk: { frames: ["cowbot_0", "cowbot_1"], delayMs: 320 },
    saloon_brawler_walk: {
      frames: ["saloon_brawler_0", "saloon_brawler_1"],
      delayMs: 320,
    },
    tin_outlaw_walk: { frames: ["tin_outlaw_0", "tin_outlaw_1"], delayMs: 260 },
    longhorn_walk: { frames: ["longhorn_0", "longhorn_1"], delayMs: 340 },
    mosque_beach_walk: {
      frames: ["elon_mosque_beach_0", "elon_mosque_beach_1"],
      delayMs: 340,
    },
    supercore_pulse: {
      frames: ["zai_supercore_0", "zai_supercore_1"],
      delayMs: 420,
    },
  },
  // Wound overrides: the dark steel hosts swallow the default splat — hot
  // spark gold reads on their grey/black bodies (the lint's own suggestion).
  wounds: {
    cowbot: { splat: "y", core: "Y" },
    // The outlaw's lean, dark duster offers little stable body for splats, so
    // add an amber scuff on the lower body to carry the wound read.
    tin_outlaw: { splat: "y", core: "Y", scuff: "H" },
  },
  // The desert floor and its scatter read as terrain, not subjects.
  contrastExempt: [
    "hardpan_0",
    "hardpan_1",
    "scrub_0",
    "scrub_1",
    "dry_shrub",
    "tumbleweed",
  ],
};

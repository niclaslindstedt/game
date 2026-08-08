// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CARD, PHOTOGRAPHED — the in-game item card rasterised by rendering the
// real thing and taking its picture.
//
// The arsenal page already shows THE ACTUAL item card: `itemCard()` emits the
// game's own `.item-card` / `.tier-*` / `.card-foot` markup, and ./styles.mjs
// inlines the very stylesheet the game imports (pwa/src/lib/item-card.css) plus
// the WOFF2 packed from the game's own glyph map. So the card a reader sees in
// the document IS the card the game draws.
//
// A picture of that card cannot be drawn a second time in SVG without becoming
// a lookalike — a second layout, a second set of colours, a second font, drifting
// from the first the moment either changes. That is exactly what the note at the
// top of render-arsenal.mjs forbids. So this module does not redraw anything: it
// loads the same markup with the same stylesheet and the same webfont in a real
// browser and screenshots the element. The picture is the card, by construction.
//
// THE COST, STATED PLAINLY: this puts a headless Chromium on the library build,
// and therefore on the deploy. The alternative was ~370 committed PNGs that go
// stale the first time an item is renamed or rebalanced — and everything else
// derived in this repo (the atlas, the levels, the enemies, the item catalogs)
// is gitignored and regenerated precisely so it cannot drift. This follows that
// rule rather than the `make screenshots` one, because unlike a store
// screenshot, a card is a mechanical function of a catalog that changes often.

/* global document, window -- `page.evaluate`'s callback is serialised and run
   by the browser, not by node, so its body legitimately reaches the DOM. */

import { availableParallelism } from "node:os";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { libraryCss } from "./styles.mjs";

/**
 * The stage the cards are shot on.
 *
 * It is written INTO the library directory and navigated to as a real `file://`
 * URL rather than pushed in with `setContent`. That is load-bearing: a page
 * created by `setContent` has an opaque origin, and Chromium refuses to fetch
 * `file://` subresources from one — the sprites AND the pixel webfont both
 * silently fail, and what comes out is a card in the wrong font with a broken
 * icon that still looks plausible enough to ship.
 *
 * The card is drawn at its NATURAL size and the resolution comes from the device
 * scale factor instead. Enlarging the root font-size to get a big image was the
 * obvious move and it is wrong: the skin mixes `rem` box metrics (`padding:
 * 0.6rem`, `gap: 0.35rem`) with PIXEL type (`.card-name { font-size: 32px }`),
 * so scaling the root grows the padding while the text stays put and every
 * margin on the card comes out wrong. Scaling the whole raster instead moves
 * both together, which is the only way the proportions stay the game's.
 *
 * The viewport is deliberately desktop-wide so the skin's own `min-width` rule
 * applies — that is the card as a reader actually sees it on the arsenal page.
 */
const STAGE_FILE = ".card-stage.html";
const FRAME_FILE = ".frame-stage.html";
const SHOT_SCALE = 4;

/**
 * HOW MANY CARDS ARE IN FRONT OF A CAMERA AT ONCE.
 *
 * A shot is `innerHTML` + layout + font/image settle + a raster, and one page
 * means one renderer process doing all of it while every other core on the
 * machine waits. That was the whole deploy's critical path: ~1000 pictures at
 * a third of a second each, serial.
 *
 * A LANE IS A WHOLE BROWSER, with a pair of pages on it — the element stage
 * and the 1200x630 frame stage, because a card job shoots both and a page can
 * only hold one composition at a time. **The browser is the unit, and that is
 * the measurement, not a preference.** With one browser and four pages the set
 * went 4m52 to 3m46 and stopped: the shots fan out across renderers, but every
 * screenshot is still marshalled over CDP by the single BROWSER process, which
 * sat pinned near a full core. Raising the page count to eight moved nothing —
 * same 74% on the same one process. Four browsers spread that work too, and
 * the same set takes 2m36.
 *
 * Every page is navigated to the same two `file://` stages, so the stylesheet
 * and the webfont are parsed once per page and nothing about a picture depends
 * on which lane drew it — the whole set comes out byte-identical to the serial
 * one, which is the only reason this is allowed to be a speedup rather than a
 * rewrite.
 *
 * Capped at the core count. Each lane is a browser process plus two renderers,
 * so past it the lanes only take turns more expensively.
 */
const LANES = Math.max(1, Math.min(4, availableParallelism()));

/**
 * Hand out one of `items` at a time, waiting when they are all out.
 *
 * The pool is what bounds the concurrency — callers may fire every job at
 * once and the lanes queue them. Deliberately FIFO: a waiter that jumps the
 * line would be invisible here and unpleasant anywhere else.
 */
function pool(items) {
  const free = [...items];
  const waiting = [];
  return async function take(fn) {
    const item = free.pop() ?? (await new Promise((r) => waiting.push(r)));
    try {
      return await fn(item);
    } finally {
      const next = waiting.shift();
      if (next) next(item);
      else free.push(item);
    }
  };
}

function stageHtml(extraCss = "") {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
${libraryCss()}
html, body { margin: 0; background: transparent; }
#stage { display: inline-block; padding: 0; }
${extraCss}
</style>
<script>
/* Everything the browser must finish before the shutter: the webfont parsed and
   every image decoded. It lives IN the page rather than being passed in from
   node, because an evaluate() callback is serialised and cannot close over
   anything on this side.

   The images matter twice over. The img() helper marks page images lazy, which
   is right in a document and wrong on a stage — a lazy image never loads if the
   layout thinks it is out of view, and the shot catches the placeholder. */
window.__settle = async () => {
  const stage = document.getElementById("stage");
  for (const img of stage.querySelectorAll("img")) {
    img.setAttribute("loading", "eager");
  }
  await document.fonts.ready;
  await Promise.all(
    [...stage.querySelectorAll("img")].map((img) =>
      img.complete ? null : img.decode().catch(() => null),
    ),
  );
};
</script>
</head><body><div id="stage"></div></body></html>`;
}

/**
 * Open the browsers and keep them open for the whole run.
 *
 * `LANES` browsers, two pages each, one navigation per page: the font and the
 * stylesheet are parsed once per page and every card after the first is an
 * `innerHTML` swap and a screenshot. Launching per card would dominate the
 * build.
 *
 * `shoot`/`shootFrame` are safe to call concurrently — each takes a free page
 * out of the pool and gives it back when its raster is in hand — so the caller
 * decides how many jobs to have in flight and the pool decides how many of
 * them touch a browser.
 */
export async function openCardShooter(libraryDir) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "library: playwright is required to render the item cards.\n" +
        "  npm install   (it is a devDependency)\n" +
        "  npx playwright install chromium",
    );
  }

  // A sandbox may ship browsers that do not match the installed playwright's
  // expected build; PLAYWRIGHT_CHROMIUM points at one that does.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
  let browsers;
  try {
    browsers = await Promise.all(
      Array.from({ length: LANES }, () => chromium.launch({ executablePath })),
    );
  } catch (cause) {
    throw new Error(
      "library: could not launch chromium to render the item cards.\n" +
        "  npx playwright install chromium   (or set PLAYWRIGHT_CHROMIUM to a browser binary)",
      { cause },
    );
  }

  // The webfont has to be on disk BEFORE the first shot, and a browser that
  // cannot fetch it silently falls back to a system monospace — every card comes
  // out in the wrong typeface and the build reports nothing. This once shipped:
  // the font was written after the shooting, so it only worked when a previous
  // build had left the file behind. Checked rather than trusted.
  if (!existsSync(resolve(libraryDir, "pixel.woff2"))) {
    throw new Error(
      "library: pixel.woff2 must be written before the cards are shot — " +
        "without it every card renders in a fallback monospace",
    );
  }

  // Absolute: `file://` needs a full path, and a relative one yields a URL that
  // fails to navigate rather than an obviously wrong path.
  const stagePath = resolve(libraryDir, STAGE_FILE);
  writeFileSync(stagePath, stageHtml());

  // A SECOND stage, for whole-frame pictures rather than one element: the
  // social card (og-card.mjs) is a fixed 1200x630 composition, and it is drawn
  // here — not in SVG through sharp — for one reason. Sharp rasterises SVG with
  // librsvg, which resolves fonts through fontconfig and so cannot see the
  // game's WOFF2; every string it drew came out in a system sans. In a browser
  // the same `@font-face` the library pages use just works, so the card gets
  // the game's own pixel font.
  const framePath = resolve(libraryDir, FRAME_FILE);
  writeFileSync(
    framePath,
    stageHtml("#stage { display: block; width: 1200px; height: 630px; }"),
  );

  /** One page per browser on the given stage, all settled before the first shot. */
  const openStage = (path, options) =>
    Promise.all(
      browsers.map(async (browser) => {
        const opened = await browser.newPage(options);
        await opened.goto(`file://${path}`, { waitUntil: "load" });
        return opened;
      }),
    );

  const [cardPages, framePages] = await Promise.all([
    openStage(stagePath, {
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: SHOT_SCALE,
    }),
    openStage(framePath, {
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    }),
  ]);
  const takeCardPage = pool(cardPages);
  const takeFramePage = pool(framePages);

  return {
    /** How many shots may be in flight at once — the caller's batch size. */
    lanes: LANES,
    /** Screenshot `cardHtml` as a transparent PNG of the card element alone. */
    shoot(cardHtml) {
      return takeCardPage(async (page) => {
        await page.evaluate(async (html) => {
          document.getElementById("stage").innerHTML = html;
          await window.__settle();
        }, cardHtml);
        return page.locator("#stage > *").first().screenshot({
          omitBackground: true,
        });
      });
    },
    /** Screenshot a whole 1200x630 composition. */
    shootFrame(html) {
      return takeFramePage(async (page) => {
        await page.evaluate(async (body) => {
          document.getElementById("stage").innerHTML = body;
          await window.__settle();
        }, html);
        return page.locator("#stage").screenshot();
      });
    },
    async close() {
      await Promise.all(browsers.map((browser) => browser.close()));
      for (const file of [stagePath, framePath]) {
        try {
          unlinkSync(file);
        } catch {
          /* the stages are disposable; a failed unlink is not worth failing on */
        }
      }
    },
  };
}

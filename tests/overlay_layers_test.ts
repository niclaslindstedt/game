// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The game shell's LAYER BANDS (see the map above `.game-overlay` in
// styles.css). A modal has to cover the run — the field, the HUD, and every
// screen-space effect the run throws. That does NOT fall out of DOM order: the
// FX layers carry explicit z-indices to sit over the HUD, so a modal left at
// `z-index: auto` paints UNDER them however late it mounts. That is how the
// NUKE's fireball and the AREA CAPTION ended up drawn across the AUTO PILOT
// history — the one modal the world keeps running behind. These tests pin the
// ordering so a new surface can't quietly reopen the leak.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  fileURLToPath(new URL("../pwa/src/styles.css", import.meta.url)),
  "utf8",
);

/**
 * The `z-index` a top-level rule declares for exactly `selector`, or null when
 * it declares none (the element stays at `auto`, i.e. in DOM order). Matches
 * the rule whose selector list is the bare class — so `.game-overlay` never
 * picks up `.game-overlay canvas` — and reads its LAST declaration.
 */
function zIndexOf(selector: string): number | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  expect(rule, `no rule for ${selector}`).not.toBeNull();
  const decls = [...(rule?.[2] ?? "").matchAll(/z-index:\s*(-?\d+)/g)];
  const last = decls.at(-1);
  return last ? Number(last[1]) : null;
}

/** Like `zIndexOf`, but the selector is required to declare one. */
function bandOf(selector: string): number {
  const z = zIndexOf(selector);
  expect(z, `${selector} declares no z-index`).not.toBeNull();
  return z as number;
}

/** Screen-space FX layers: over the HUD/docks, under every modal. */
const FX_LAYERS = [
  ".tap-fx-layer",
  ".powerup-aura-layer",
  ".nuke-fx-layer",
  ".levelup-fx-layer",
];

/** Full-screen modals — the band that occludes the running game. */
const MODALS = [".game-overlay", ".game-splash"];

/** The few surfaces that must float OVER a modal. */
const ABOVE_MODALS = [
  ".item-tooltip",
  ".achievement-toast",
  ".achievement-reveal",
  ".demo-tip",
];

/** Chrome anchored to the running game — a modal covers it. */
const RUN_CHROME = [".area-caption", ".pickup-card", ".pickup-feed"];

/** The declaration block of the top-level rule for exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  expect(rule, `no rule for ${selector}`).not.toBeNull();
  return rule?.[2] ?? "";
}

/** The full-screen browsers the TITLE menu raises over itself. */
const TITLE_BROWSERS = [
  ".arsenal-overlay",
  ".achievements-overlay",
  ".effects-gallery",
];

/** Everything the title screen paints over its own sky. */
const OVER_THE_SKY = [
  ".title-sun-glare",
  ".store-backdrop",
  ".title-footer",
  ".title-plate",
  ".title-content",
  ".pixel-prompt",
  ...TITLE_BROWSERS,
  ".sun-boom",
  ".sun-boom-whiteout",
];

describe("game shell layer bands", () => {
  it("puts every modal above every screen-space FX layer", () => {
    const fxTop = Math.max(...FX_LAYERS.map(bandOf));
    for (const modal of MODALS) {
      expect(
        bandOf(modal),
        `${modal} must cover the FX layers`,
      ).toBeGreaterThan(fxTop);
    }
  });

  it("keeps the FX layers over the HUD's own band", () => {
    // A burst still has to wash over the whole frame, docks included.
    expect(Math.min(...FX_LAYERS.map(bandOf))).toBeGreaterThan(
      bandOf(".bot-dpad"),
    );
  });

  it("leaves the run's own chrome below the modal band", () => {
    const modalFloor = Math.min(...MODALS.map(bandOf));
    for (const chrome of RUN_CHROME) {
      const z = zIndexOf(chrome);
      // `auto` is fine — DOM order can never beat a positive z-index.
      if (z !== null) {
        expect(z, `${chrome} must not out-bid a modal`).toBeLessThan(
          modalFloor,
        );
      }
    }
  });

  it("floats the tooltip, toast and demo tip over the modal band", () => {
    const modalTop = Math.max(...MODALS.map(bandOf));
    for (const above of ABOVE_MODALS) {
      expect(bandOf(above), `${above} must sit over a modal`).toBeGreaterThan(
        modalTop,
      );
    }
  });

  it("puts the drive over the curtain it is the far side of", () => {
    // THE REGRESSION THIS PINS: the drive-out fades the shell to black and hands
    // the trip to the road, and the curtain never lifts for it — the departing
    // run stays mounted with `state.departure` set, so its opacity is held at 1
    // for the whole minigame. At `z-index: auto` the road therefore played
    // underneath a black sheet: nothing on screen, and the departed car's engine
    // still audible behind it.
    expect(bandOf(".drive-screen")).toBeGreaterThan(
      bandOf(".departure-curtain"),
    );
  });

  it("lets the drive own the whole picture, modals included", () => {
    // While a road is up there is no run to look at — the one it left has washed
    // to black and the one it is going to has not been built — so nothing the
    // shell can raise may paint over it.
    const shellTop = Math.max(
      ...[...MODALS, ...ABOVE_MODALS, ...FX_LAYERS].map(bandOf),
    );
    expect(bandOf(".drive-screen")).toBeGreaterThan(shellTop);
  });

  it("prints the screenshot receipt over the drive that raised it", () => {
    // THE REGRESSION THIS PINS: the road answers the SCREENSHOT bind itself
    // (the run's control layer is not listening under an interlude), and then
    // owns the whole picture — so a receipt left in the modal band printed
    // UNDERNEATH the thing it was a receipt for, and the key looked dead on
    // the one screen a player most wants a picture of.
    for (const selector of [".shot-flash", ".shot-flash-burst"]) {
      expect(
        bandOf(selector),
        `${selector} must clear the drive`,
      ).toBeGreaterThan(bandOf(".drive-screen"));
    }
  });

  it("leaves the screenshot receipt inert at that band", () => {
    // It out-bids every modal in the shell, so it had better never take a
    // press: the canvas hit-tests the banner and routes the tap instead.
    for (const selector of [
      ".shot-flash",
      ".shot-flash *",
      ".shot-flash-burst",
    ]) {
      const rule = new RegExp(
        `(^|\\n)${selector.replace(/[.*]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`,
      ).exec(CSS);
      expect(rule, `no rule for ${selector}`).not.toBeNull();
      expect(rule?.[2], selector).toMatch(/pointer-events:\s*none/);
    }
  });

  it("leaves the legend reveal inert while it covers the whole screen", () => {
    // The top-tier unlock takes the ENTIRE viewport for six seconds while a
    // hero is still being steered under it. `pointer-events` only inherits to
    // descendants, and on iOS a composited replaced child (the badge <img>, a
    // PixelText <canvas>) gets its own hit-test layer — so the root being inert
    // is not enough, exactly as the banner's own comment records. Both rules or
    // the reveal eats every steering press it is on screen for.
    for (const selector of [".achievement-reveal", ".achievement-reveal *"]) {
      const rule = new RegExp(
        `(^|\\n)${selector.replace(/[.*]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`,
      ).exec(CSS);
      expect(rule, `no rule for ${selector}`).not.toBeNull();
      expect(rule?.[2], selector).toMatch(/pointer-events:\s*none/);
    }
  });

  it("keeps the demo's catcher and exit confirm on top of everything", () => {
    const highest = Math.max(...ABOVE_MODALS.map(bandOf));
    expect(bandOf(".demo-exit-catch")).toBeGreaterThan(highest);
    expect(bandOf(".demo-exit-overlay")).toBeGreaterThan(
      bandOf(".demo-exit-catch"),
    );
  });
});

describe("title screen layer bands", () => {
  // THE REGRESSION THESE PIN: the title backdrop's solar system sorts its
  // bodies with a WIDE inline z-band (SUN_Z ± Z_SPREAD in title-sky.ts, i.e.
  // 150..850 — wide on purpose, because z-index is an integer and two solid
  // worlds a hair apart in depth must not round onto the same index). Those
  // numbers used to be written into the title screen's own stacking context,
  // where they beat every band the menu had: the SCREENSHOT gallery, the
  // trophy shelf, the LOST & FOUND and the arsenal all sit at 70, so a planet
  // crossing the middle of the screen drew straight over the picture being
  // viewed. `.title-sky` makes the band private.

  it("keeps the sky a stacking context, so its band stays private", () => {
    const sky = ruleBody(".title-sky");
    // Positioned AND banded — either one alone is not a stacking context, and
    // without one the whole 150..850 leaks back out onto the menu.
    expect(sky, ".title-sky must be positioned").toMatch(
      /position:\s*(absolute|relative|fixed)/,
    );
    expect(bandOf(".title-sky")).toBe(0);
  });

  it("paints every title surface over the sky", () => {
    const sky = bandOf(".title-sky");
    for (const selector of OVER_THE_SKY) {
      expect(
        bandOf(selector),
        `${selector} must clear the sky`,
      ).toBeGreaterThan(sky);
    }
  });

  it("stacks the menu column over the sub-screen wash it reads against", () => {
    // The wash exists so a settings row's label never sits on the sun. It has
    // to dim the sky and nothing else: over the glare and the store's coins,
    // under the column whose text it is there to make readable.
    expect(bandOf(".title-plate")).toBeGreaterThan(bandOf(".title-sun-glare"));
    expect(bandOf(".title-plate")).toBeGreaterThan(bandOf(".store-backdrop"));
    expect(bandOf(".title-content")).toBeGreaterThan(bandOf(".title-plate"));
  });

  it("raises every full-screen browser over the menu it was opened from", () => {
    for (const selector of TITLE_BROWSERS) {
      expect(
        bandOf(selector),
        `${selector} must cover the menu column`,
      ).toBeGreaterThan(bandOf(".title-content"));
    }
    expect(bandOf(".pixel-prompt")).toBeGreaterThan(bandOf(".title-content"));
  });

  it("lets the supernova swallow the menu, white-out and all", () => {
    // The blast is the ONE title surface meant to paint over the UI — and the
    // white-out is the half that kept being forgotten: left in a low band while
    // the menu was lifted to clear the sky, it bloomed BEHIND the rows it is
    // supposed to swallow.
    const browserTop = Math.max(...TITLE_BROWSERS.map(bandOf));
    for (const selector of [".sun-boom", ".sun-boom-whiteout"]) {
      expect(
        bandOf(selector),
        `${selector} must clear the whole title screen`,
      ).toBeGreaterThan(browserTop);
    }
  });
});

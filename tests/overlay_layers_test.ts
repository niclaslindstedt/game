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
const ABOVE_MODALS = [".item-tooltip", ".achievement-toast", ".demo-tip"];

/** Chrome anchored to the running game — a modal covers it. */
const RUN_CHROME = [".area-caption", ".pickup-card", ".pickup-feed"];

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

  it("keeps the demo's catcher and exit confirm on top of everything", () => {
    const highest = Math.max(...ABOVE_MODALS.map(bandOf));
    expect(bandOf(".demo-exit-catch")).toBeGreaterThan(highest);
    expect(bandOf(".demo-exit-overlay")).toBeGreaterThan(
      bandOf(".demo-exit-catch"),
    );
  });
});

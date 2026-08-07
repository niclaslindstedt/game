// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WAGON'S DIALS, pinned at the two places their geometry can silently come
// apart — both of which it already had.
//
// A dial is authored as two `kind: gauge` nodes stacked on one face
// (`content/hud/elements/drive_speedo.yaml`), and everything about WHERE the
// inner one lands is CSS. There is no render to assert against here (the arcs
// are an `<svg>` the browser lays out), so these read the stylesheet the same
// way `overlay_layers_test.ts` reads it for the layer bands: the rule's own
// declarations, checked for the two things that made the tachometer wrong.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  fileURLToPath(new URL("../pwa/src/styles.css", import.meta.url)),
  "utf8",
);

/** The declaration block of the top-level rule for exactly `selector`. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  expect(rule, `no rule for ${selector}`).not.toBeNull();
  return rule?.[2] ?? "";
}

describe("the drive dashboard's dials", () => {
  // An `<svg>` is a REPLACED element, so an absolutely positioned one does NOT
  // stretch between `left` and `right` when its width is `auto` — it takes its
  // intrinsic width, which for an outermost svg carrying only a viewBox is 100%
  // of the containing block, and the over-constrained `right`/`bottom` are
  // dropped. `inset: 13px` alone therefore drew the tachometer at the
  // SPEEDOMETER'S OWN diameter, shoved 13px down and to the right, straddling
  // the arc it is supposed to sit inside.
  it("sizes an inset ring explicitly rather than leaving it auto", () => {
    for (const selector of [".drive-dial-ring-inner", ".wpn-ring"]) {
      const decls = ruleFor(selector);
      expect(decls, `${selector} must state its own width`).toMatch(
        /(^|[\s;])width:\s*(?!auto)/,
      );
      expect(decls, `${selector} must state its own height`).toMatch(
        /(^|[\s;])height:\s*(?!auto)/,
      );
    }
  });

  // The dash is mounted by TWO hosts — the minigame and the effects gallery's
  // gearbox exhibit, which mounts `HudRoot` by itself so the shelf shows the
  // dials the game actually draws. Declared on the minigame's own element these
  // were undefined in the gallery, and every dial collapsed to nothing.
  it("declares the dashboard's footprint where every host can read it", () => {
    const root = ruleFor(":root");
    expect(root).toMatch(/--drive-dial-size:/);
    expect(root).toMatch(/--drive-dash-w:/);
  });
});

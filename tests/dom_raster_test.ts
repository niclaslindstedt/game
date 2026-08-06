// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CSS THE RASTERIZER READS (`@ui/lib/dom-raster.ts`). The drawing itself
// needs a browser; the parsing does not, and the parsing is where the traps
// are — every one of these cases is a real computed value off the game's own
// window skin, and getting one wrong paints a card with no fill or no glow at
// all rather than failing loudly.

import { describe, expect, it } from "vitest";

import {
  parseBoxShadows,
  parseLinearGradient,
  splitCssLayers,
} from "@ui/lib/dom-raster.ts";

describe("css layer splitting", () => {
  it("splits on the layer commas and not on a colour's own", () => {
    expect(
      splitCssLayers("rgb(43, 49, 58) 0px 6px, rgba(0, 0, 0, 0.65) 0px 0px"),
    ).toEqual(["rgb(43, 49, 58) 0px 6px", "rgba(0, 0, 0, 0.65) 0px 0px"]);
  });

  it("returns nothing for an empty value", () => {
    expect(splitCssLayers("")).toEqual([]);
  });
});

describe("linear gradient parsing", () => {
  it("reads the panel fill the way the browser hands it back", () => {
    // `--panel-fill`'s base layer. `getComputedStyle` normalizes the colours to
    // rgb() and OMITS the 180deg, because to-bottom is the default — a parser
    // that requires an angle sees no gradient and paints a transparent card.
    const spec = parseLinearGradient(
      "linear-gradient(rgb(43, 49, 58) 0%, rgb(26, 31, 39) 48%, rgb(14, 18, 25) 100%)",
    );
    expect(spec).not.toBeNull();
    expect(spec?.angleDeg).toBe(180);
    expect(spec?.stops).toEqual([
      { color: "rgb(43, 49, 58)", pos: 0 },
      { color: "rgb(26, 31, 39)", pos: 0.48 },
      { color: "rgb(14, 18, 25)", pos: 1 },
    ]);
  });

  it("keeps an explicit angle and a direction keyword", () => {
    expect(
      parseLinearGradient("linear-gradient(90deg, red, blue)")?.angleDeg,
    ).toBe(90);
    expect(
      parseLinearGradient("linear-gradient(to top, red, blue)")?.angleDeg,
    ).toBe(0);
  });

  it("spaces the stops nobody positioned", () => {
    const spec = parseLinearGradient("linear-gradient(red, green, blue)");
    expect(spec?.stops.map((s) => s.pos)).toEqual([0, 0.5, 1]);
  });

  it("expands the two-position shorthand into two stops", () => {
    // `repeating-*` grain layers are written this way, and so is any hard edge.
    const spec = parseLinearGradient("linear-gradient(red 0% 40%, blue 100%)");
    expect(spec?.stops).toEqual([
      { color: "red", pos: 0 },
      { color: "red", pos: 0.4 },
      { color: "blue", pos: 1 },
    ]);
  });

  it("never lets a stop step backwards", () => {
    const spec = parseLinearGradient("linear-gradient(red 60%, blue 20%)");
    expect(spec?.stops.map((s) => s.pos)).toEqual([0.6, 0.6]);
  });

  it("declines everything that is not a linear gradient", () => {
    expect(parseLinearGradient("none")).toBeNull();
    expect(
      parseLinearGradient('url("data:image/svg+xml,%3Csvg/%3E")'),
    ).toBeNull();
    expect(
      parseLinearGradient(
        "repeating-conic-gradient(rgba(255, 255, 255, 0.05) 0%, transparent 50%)",
      ),
    ).toBeNull();
    // One colour is not a gradient.
    expect(parseLinearGradient("linear-gradient(red)")).toBeNull();
  });
});

describe("box shadow parsing", () => {
  it("reads the item card's own stack, glow and groove alike", () => {
    // `.item-card.tier-legendary` — the inset groove, the drop shadow, and the
    // tier halo the copied picture would otherwise lose.
    const shadows = parseBoxShadows(
      "rgba(61, 70, 83, 0.55) 0px 0px 0px 1px inset, " +
        "rgba(0, 0, 0, 0.65) 0px 6px 18px 0px, " +
        "rgba(255, 167, 38, 0.45) 0px 0px 14px 2px",
    );
    expect(shadows).toHaveLength(3);
    expect(shadows[0]?.inset).toBe(true);
    expect(shadows[1]).toMatchObject({
      color: "rgba(0, 0, 0, 0.65)",
      x: 0,
      y: 6,
      blur: 18,
      spread: 0,
      inset: false,
    });
    expect(shadows[2]).toMatchObject({
      color: "rgba(255, 167, 38, 0.45)",
      blur: 14,
      spread: 2,
    });
  });

  it("finds the colour wherever the engine put it in the layer", () => {
    expect(parseBoxShadows("0px 2px 4px #000")[0]).toMatchObject({
      color: "#000",
      x: 0,
      y: 2,
      blur: 4,
      spread: 0,
    });
  });

  it("has nothing to say about `none`", () => {
    expect(parseBoxShadows("none")).toEqual([]);
    expect(parseBoxShadows("")).toEqual([]);
  });
});

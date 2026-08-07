// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CSS THE RASTERIZER READS (`@ui/lib/dom-raster.ts`). The drawing itself
// needs a browser; the parsing does not, and the parsing is where the traps
// are — every one of these cases is a real computed value off the game's own
// window skin, and getting one wrong paints a card with no fill or no glow at
// all rather than failing loudly.

import { describe, expect, it } from "vitest";

import {
  opaqueBounds,
  paintOrder,
  parseBoxShadows,
  parseDashArray,
  parseLinearGradient,
  splitCssLayers,
  viewBoxFit,
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

describe("trimming to the ink", () => {
  /** An RGBA buffer of `w`×`h` whose pixels are opaque exactly where `at` says. */
  const pixels = (
    w: number,
    h: number,
    at: (x: number, y: number) => boolean,
  ) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++)
        data[(y * w + x) * 4 + 3] = at(x, y) ? 255 : 0;
    }
    return data;
  };

  it("finds the box the drawing actually fills", () => {
    // A 2×2 blot at (3,1) in a 8×5 field — the bounds are INCLUSIVE, so a
    // one-pixel mark reads as a 1×1 box rather than an empty one.
    const bounds = opaqueBounds(
      pixels(8, 5, (x, y) => x >= 3 && x <= 4 && y >= 1 && y <= 2),
      8,
      5,
    );
    expect(bounds).toEqual([3, 1, 4, 2]);
  });

  it("keeps a pixel the eye can barely see", () => {
    // A tier halo fades to alpha 1 at its outermost ring. Trimming on anything
    // but "not fully transparent" would shear the last of the glow off.
    const data = pixels(4, 4, () => false);
    data[(1 * 4 + 2) * 4 + 3] = 1;
    expect(opaqueBounds(data, 4, 4)).toEqual([2, 1, 2, 1]);
  });

  it("says nothing was drawn when nothing was", () => {
    expect(
      opaqueBounds(
        pixels(4, 4, () => false),
        4,
        4,
      ),
    ).toBeNull();
  });

  it("spans the whole field when the drawing fills it", () => {
    expect(
      opaqueBounds(
        pixels(3, 2, () => true),
        3,
        2,
      ),
    ).toEqual([0, 0, 2, 1]);
  });
});

describe("the order the picture is painted in", () => {
  /** `paintOrder` over a list of `[name, computed z-index]` pairs. */
  const order = (bands: [string, string][]) =>
    paintOrder(bands, (band) => band[1]);

  it("keeps siblings in the order they were written", () => {
    // The overwhelming majority: everything at `auto`, layered by markup.
    const { above } = order([
      ["field", "auto"],
      ["hud", "auto"],
      ["dock", "auto"],
    ]);
    expect(above.map((e) => e[0])).toEqual(["field", "hud", "dock"]);
  });

  it("paints a raised sibling last however early it was mounted", () => {
    // THE REGRESSION THIS PINS: a drive is mounted before the departure
    // curtain and beats it with a z-index (styles.css's band map), so a walk
    // that went by document order painted the curtain over the whole minigame
    // — every screenshot of the road came back a solid black sheet.
    const { above } = order([
      ["drive", "300"],
      ["hud", "auto"],
      ["curtain", "200"],
    ]);
    expect(above.map((e) => e[0])).toEqual(["hud", "curtain", "drive"]);
  });

  it("still paints a negative band before the parent's own content", () => {
    // The item card's kind glyph: a watermark BEHIND every line, written last.
    const { behind, above } = order([
      ["name", "auto"],
      ["stats", "auto"],
      ["watermark", "-1"],
    ]);
    expect(behind.map((e) => e[0])).toEqual(["watermark"]);
    expect(above.map((e) => e[0])).toEqual(["name", "stats"]);
  });

  it("sorts the negative bands among themselves too", () => {
    const { behind } = order([
      ["near", "-1"],
      ["far", "-5"],
    ]);
    expect(behind.map((e) => e[0])).toEqual(["far", "near"]);
  });
});

describe("the gauge rings", () => {
  it("reads the dash lengths a fraction is drawn with", () => {
    // `pathLength={1}` + `stroke-dasharray: 0.42 1` is "42% of the way round",
    // and the browser hands the computed value back in px.
    expect(parseDashArray("0.42px, 1px")).toEqual([0.42, 1]);
    expect(parseDashArray("4px 2px")).toEqual([4, 2]);
  });

  it("has nothing to say about an undashed stroke", () => {
    expect(parseDashArray("none")).toEqual([]);
    expect(parseDashArray("")).toEqual([]);
  });

  it("fits a round gauge inside its box and centres it", () => {
    // The speedometer: a 44×44 viewBox in a box wider than it is tall. `meet`
    // scales to the SHORT side, so the ring stays round rather than an oval.
    const fit = viewBoxFit({ w: 100, h: 44 }, { width: 44, height: 44 }, "");
    expect(fit.sx).toBe(1);
    expect(fit.sy).toBe(1);
    expect(fit.dx).toBe(28);
    expect(fit.dy).toBe(0);
  });

  it("stretches the one that asked to be stretched", () => {
    // The minimap's rampage ring: an oblong frame around an oblong map.
    const fit = viewBoxFit(
      { w: 200, h: 66 },
      { width: 100, height: 66 },
      "none",
    );
    expect(fit).toEqual({ sx: 2, sy: 1, dx: 0, dy: 0 });
  });

  it("leaves a box alone when there is no viewBox to fit", () => {
    expect(viewBoxFit({ w: 40, h: 40 }, { width: 0, height: 0 }, "")).toEqual({
      sx: 1,
      sy: 1,
      dx: 0,
      dy: 0,
    });
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

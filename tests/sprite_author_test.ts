// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sprite authoring tools: trace a reference image into a palette + grid,
// and score a rendered sprite against a reference. These pin the properties
// the authoring loop leans on — DETERMINISM (same input → byte-stable YAML),
// stable palette-key ordering (OKLab lightness→hue), lossless pass-through of a
// clean pixel-art reference, and a compare gate that reads 1/0 for an identical
// pair and degrades sensibly.

import { describe, expect, it } from "vitest";

import {
  compareSurfaces,
  resizeNearest,
} from "../website/scripts/asset-tools/compare.mjs";
import {
  STYLE_PREAMBLE,
  buildImagePrompt,
  paletteComments,
  provenanceRecord,
} from "../website/scripts/asset-tools/prompt.mjs";
import { resampleToCells } from "../website/scripts/asset-tools/image.mjs";
import {
  labSortKey,
  oklabDistance,
  oklabToRgb,
  rgbToOklab,
} from "../website/scripts/asset-tools/oklab.mjs";
import { quantizeGrid } from "../website/scripts/asset-tools/quantize.mjs";
import { validateSprite } from "../website/scripts/asset-tools/sprite-schema.mjs";
import {
  createSurface,
  setPixel,
} from "../website/scripts/asset-tools/surface.mjs";

const BLACK: [number, number, number] = [26, 28, 44];
const WHITE: [number, number, number] = [244, 244, 244];
const RED: [number, number, number] = [216, 58, 58];

describe("oklab", () => {
  it("round-trips sRGB through OKLab within a pixel", () => {
    const samples: [number, number, number][] = [
      BLACK,
      WHITE,
      RED,
      [0, 0, 0],
      [255, 255, 255],
      [12, 200, 90],
    ];
    for (const rgb of samples) {
      const back = oklabToRgb(rgbToOklab(rgb));
      for (let c = 0; c < 3; c++) {
        expect(Math.abs((back[c] ?? 0) - (rgb[c] ?? 0))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("orders sort keys by lightness first", () => {
    const [kb, kr, kw] = [BLACK, RED, WHITE].map((c) =>
      labSortKey(rgbToOklab(c)),
    );
    expect(kb![0]).toBeLessThan(kr![0]);
    expect(kr![0]).toBeLessThan(kw![0]);
  });

  it("reads zero distance for the same color", () => {
    expect(oklabDistance(rgbToOklab(RED), rgbToOklab(RED))).toBe(0);
  });
});

describe("resampleToCells", () => {
  it("recovers exact colors from an integer-upscaled image", () => {
    // A 2×2 image scaled ×3 → back to a 2×2 cell grid must be the originals.
    const cells2: ([number, number, number] | null)[][] = [
      [BLACK, WHITE],
      [null, RED],
    ];
    const src = createSurface(6, 6);
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) {
        const cell = cells2[y < 3 ? 0 : 1]?.[x < 3 ? 0 : 1];
        if (cell) setPixel(src, x, y, [...cell, 255]);
      }
    const out = resampleToCells(src, 2, 2);
    expect(out).toEqual(cells2);
  });

  it("reads a majority-transparent cell as transparent", () => {
    const src = createSurface(2, 2);
    setPixel(src, 0, 0, [...RED, 255]); // 1 of 4 opaque
    const out = resampleToCells(src, 1, 1);
    expect(out[0]?.[0]).toBeNull();
  });
});

describe("quantizeGrid", () => {
  const cells = [
    [BLACK, WHITE],
    [null, RED],
  ];

  it("passes a clean reference through with no color loss", () => {
    const { palette, grid } = quantizeGrid(cells, 16);
    expect(Object.keys(palette)).toHaveLength(3);
    expect(grid).toBe("AC\n.B\n"); // '.' transparent; A darkest, C lightest
    expect(palette.A).toBe("#1a1c2c"); // BLACK → first key by lightness
    expect(palette.C).toBe("#f4f4f4"); // WHITE → last key by lightness
  });

  it("is deterministic — identical input yields byte-identical output", () => {
    expect(quantizeGrid(cells, 16)).toEqual(quantizeGrid(cells, 16));
  });

  it("caps the palette at maxColors", () => {
    const many: [number, number, number][][] = [
      [
        [10, 10, 10],
        [60, 60, 60],
        [120, 120, 120],
        [200, 200, 200],
      ],
    ];
    const { palette } = quantizeGrid(many, 2);
    expect(Object.keys(palette).length).toBeLessThanOrEqual(2);
  });

  it("emits a schema-valid sprite", () => {
    const { palette, grid } = quantizeGrid(cells, 16);
    const { errors } = validateSprite({
      name: "traced",
      family: "hero",
      size: [2, 2],
      description: "a traced sprite",
      palette,
      grid,
    });
    expect(errors).toEqual([]);
  });

  it("throws when maxColors exceeds the key alphabet", () => {
    expect(() => quantizeGrid(cells, 99)).toThrow(/alphabet/);
  });
});

describe("paletteComments", () => {
  it("reads the human color name trailing each palette entry", () => {
    const yaml =
      'palette:\n  s: "#c8ccd4" # steel\n  g: "#f4c430" # gold crest\n';
    expect(paletteComments(yaml)).toEqual({ s: "steel", g: "gold crest" });
  });

  it("returns an empty map for a plain, uncommented palette", () => {
    expect(paletteComments('palette:\n  s: "#c8ccd4"\n')).toEqual({});
  });
});

describe("buildImagePrompt", () => {
  const full = {
    description: "Front-facing knight in silver plate with a gold crest.",
    familyStyle: "Grey lunar station tech.",
    size: [16, 16] as [number, number],
    palette: { s: "#c8ccd4", g: "#f4c430" },
    paletteNames: { s: "steel", g: "gold crest" },
  };

  it("opens with the shared style preamble", () => {
    expect(buildImagePrompt(full).startsWith(STYLE_PREAMBLE)).toBe(true);
  });

  it("carries the family anchor, description, size, and named palette", () => {
    const prompt = buildImagePrompt(full);
    expect(prompt).toContain("Grey lunar station tech");
    expect(prompt).toContain("Subject: Front-facing knight");
    expect(prompt).toContain("16×16 pixels");
    expect(prompt).toContain("steel #c8ccd4");
    expect(prompt).toContain("gold crest #f4c430");
  });

  it("excludes the grid — the prompt exists to regenerate it", () => {
    // A grid field must never leak into the prompt even if handed in.
    const prompt = buildImagePrompt({ ...full, grid: "ss\ngg" } as never);
    expect(prompt).not.toContain("ss");
  });

  it("falls back to hex-only guidance when no names are known", () => {
    const prompt = buildImagePrompt({ ...full, paletteNames: {} });
    expect(prompt).toContain("#f4c430, #c8ccd4"); // ordered by palette key
  });

  it("flags an empty description as the unset acceptance target", () => {
    const prompt = buildImagePrompt({ ...full, description: "" });
    expect(prompt).toContain("no description");
  });

  it("is deterministic — same fields synthesize the same prompt", () => {
    expect(buildImagePrompt(full)).toBe(buildImagePrompt(full));
  });
});

describe("provenanceRecord", () => {
  it("records prompt, model, and seed for an audit", () => {
    expect(provenanceRecord({ prompt: "p", model: "m", seed: 7 })).toEqual({
      prompt: "p",
      model: "m",
      seed: 7,
    });
  });

  it("nulls whatever the caller did not supply", () => {
    expect(provenanceRecord({})).toEqual({
      prompt: null,
      model: null,
      seed: null,
    });
  });
});

describe("compareSurfaces", () => {
  const paint = (color: [number, number, number]) => {
    const s = createSurface(4, 4);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) setPixel(s, x, y, [...color, 255]);
    return s;
  };

  it("scores an identical pair as a perfect match", () => {
    const a = paint(RED);
    const { ssim, meanDeltaE, coverage } = compareSurfaces(a, paint(RED));
    expect(ssim).toBeCloseTo(1, 5);
    expect(meanDeltaE).toBeCloseTo(0, 5);
    expect(coverage).toBe(1);
  });

  it("penalizes silhouette disagreement through coverage", () => {
    const solid = paint(RED);
    const holed = paint(RED);
    setPixel(holed, 0, 0, [0, 0, 0, 0]); // punch one transparent pixel
    const { coverage } = compareSurfaces(solid, holed);
    expect(coverage).toBeLessThan(1);
  });

  it("resizes a larger reference down to the sprite grid", () => {
    const big = createSurface(8, 8);
    const small = resizeNearest(big, 4, 4);
    expect([small.width, small.height]).toEqual([4, 4]);
  });
});

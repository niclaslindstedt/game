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
} from "../scripts/asset-tools/compare.mjs";
import {
  promptSelfCheck,
  proseSizeMismatch,
  unnamedPaletteKeys,
} from "../scripts/asset-tools/coherence.mjs";
import {
  STYLE_PREAMBLE,
  buildImagePrompt,
  paletteComments,
  provenanceRecord,
} from "../scripts/asset-tools/prompt.mjs";
import { resampleToCells } from "../scripts/asset-tools/image.mjs";
import {
  labSortKey,
  oklabDistance,
  oklabToRgb,
  rgbToOklab,
} from "../scripts/asset-tools/oklab.mjs";
import { quantizeGrid } from "../scripts/asset-tools/quantize.mjs";
import {
  validateSprite,
  validateSubject,
} from "../scripts/asset-tools/sprite-schema.mjs";
import { createSurface, setPixel } from "../scripts/asset-tools/surface.mjs";

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

  describe("structured subject", () => {
    const subject = {
      kind: "elite bodyguard",
      name: "ALIGNMENT OFFICER",
      build: "heavyset, a wall of a man",
      attire: "matte-black suit",
      accent: "mint-green tie",
      pose: "arms out from the bulk",
      flavor: "one of six told apart only by livery",
    };

    it("folds kind + name into the Subject line and labels each slot", () => {
      const prompt = buildImagePrompt({ ...full, subject });
      expect(prompt).toContain(
        'Subject: elite bodyguard named "ALIGNMENT OFFICER".',
      );
      expect(prompt).toContain("Build: heavyset, a wall of a man.");
      expect(prompt).toContain("Wears: matte-black suit.");
      expect(prompt).toContain("Accent: mint-green tie.");
      expect(prompt).toContain("Pose: arms out from the bulk.");
    });

    it("renders flavor LAST, as Mood, after the palette", () => {
      const prompt = buildImagePrompt({ ...full, subject });
      expect(prompt.indexOf("Mood:")).toBeGreaterThan(
        prompt.indexOf("Paint only with this palette"),
      );
      expect(prompt.trimEnd().endsWith("livery.")).toBe(true);
    });

    it("drops the free-prose description when a subject is present", () => {
      const prompt = buildImagePrompt({ ...full, subject });
      expect(prompt).not.toContain("Front-facing knight");
    });

    it("falls back to the description when the subject is empty", () => {
      const prompt = buildImagePrompt({ ...full, subject: {} });
      expect(prompt).toContain("Subject: Front-facing knight");
    });

    it("is deterministic with a subject too", () => {
      expect(buildImagePrompt({ ...full, subject })).toBe(
        buildImagePrompt({ ...full, subject }),
      );
    });
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

describe("validateSubject", () => {
  it("accepts an absent subject", () => {
    expect(validateSubject("s", undefined)).toEqual([]);
    expect(validateSubject("s", null)).toEqual([]);
  });

  it("accepts a subject with only known slots", () => {
    expect(
      validateSubject("s", { kind: "boss", name: "X", accent: "gold" }),
    ).toEqual([]);
  });

  it("rejects an unknown slot", () => {
    const errors = validateSubject("s", { kind: "boss", color: "gold" });
    expect(errors.join()).toMatch(/unknown subject slot "color"/);
  });

  it("rejects a non-string slot value", () => {
    const errors = validateSubject("s", { kind: 3 });
    expect(errors.join()).toMatch(/subject "kind" must be a string/);
  });

  it("rejects a non-map subject", () => {
    expect(validateSubject("s", ["boss"]).join()).toMatch(/must be a map/);
  });
});

describe("promptSelfCheck", () => {
  const named = { s: "steel", g: "gold crest" };
  const palette = { s: "#c8ccd4", g: "#f4c430" };

  it("finds nothing when prompt and sprite are in sync", () => {
    expect(
      promptSelfCheck({
        description: "A knight in silver plate with a gold crest.",
        size: [16, 16],
        palette,
        paletteNames: named,
      }),
    ).toEqual([]);
  });

  it("flags a size the prose contradicts as a fix", () => {
    const found = promptSelfCheck({
      description: "A 20x20 knight.",
      size: [16, 16],
      palette,
      paletteNames: named,
    });
    expect(found.some((f) => f.level === "fix")).toBe(true);
  });

  it("flags a restated matching size as trim", () => {
    const found = promptSelfCheck({
      description: "A 16x16 knight.",
      size: [16, 16],
      palette,
      paletteNames: named,
    });
    expect(found.some((f) => f.level === "trim")).toBe(true);
  });

  it("flags restated facing and medium as trim", () => {
    const found = promptSelfCheck({
      description: "A front-facing knight in flat 16-bit pixel art.",
      size: [16, 16],
      palette,
      paletteNames: named,
    });
    expect(found.filter((f) => f.level === "trim")).toHaveLength(2);
  });

  it("notes unnamed palette colors as a recreatability gap", () => {
    const found = promptSelfCheck({
      description: "A knight.",
      size: [16, 16],
      palette,
      paletteNames: { s: "steel" }, // g is unnamed
    });
    expect(
      found.some((f) => f.level === "note" && /g #f4c430/.test(f.message)),
    ).toBe(true);
  });

  it("scans the subject slots too, not just the description", () => {
    const found = promptSelfCheck({
      subject: { kind: "boss", build: "a front-facing colossus" },
      size: [16, 16],
      palette,
      paletteNames: named,
    });
    expect(found.some((f) => /front-facing/.test(f.message))).toBe(true);
  });
});

describe("unnamedPaletteKeys", () => {
  it("returns the sorted keys that carry no name", () => {
    expect(
      unnamedPaletteKeys({ s: "#c8ccd4", g: "#f4c430" }, { s: "steel" }),
    ).toEqual(["g"]);
  });

  it("returns nothing when every color is named", () => {
    expect(unnamedPaletteKeys({ s: "#c8ccd4" }, { s: "steel" })).toEqual([]);
  });

  it("treats a blank name as unnamed", () => {
    expect(unnamedPaletteKeys({ s: "#c8ccd4" }, { s: "  " })).toEqual(["s"]);
  });
});

describe("proseSizeMismatch", () => {
  it("returns the offending size when prose contradicts the field", () => {
    expect(
      proseSizeMismatch({ description: "a 20x20 rock", size: [16, 16] }),
    ).toEqual([20, 20]);
  });

  it("returns null when the prose agrees or is silent", () => {
    expect(
      proseSizeMismatch({ description: "a 16x16 rock", size: [16, 16] }),
    ).toBeNull();
    expect(
      proseSizeMismatch({ description: "a rock", size: [16, 16] }),
    ).toBeNull();
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

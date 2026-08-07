// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sprite ROUND-TRIP: what the asset generator DRAWS, the sprite reader
// must READ BACK. `generate-assets.mjs` renders every sprite's grid into a
// PNG (`<name>@8x.png`, the grid upscaled ×8) and `sprite-author analyze`
// traces a PNG back into a sprite YAML — so those two are inverses, and this
// pins that they are.
//
// The one thing a PNG cannot carry is THE PROMPT: `description`, `subject`,
// and the human color names commented onto the palette are the words that
// ASKED for the pixels, not anything the pixels record. `analyze` therefore
// re-derives every other field exactly and leaves the description blank for
// an author to fill — which is why the byte-for-byte case below compares
// against a fixture with the prompt stripped out.
//
// Three things are load-bearing here and each has bitten a pixel pipeline
// before: the resample must take a cell's DOMINANT color (an average smears a
// crisp two-color edge into a muddy third), the palette keys must be assigned
// in a stable order (or a re-analyze churns the whole grid), and `.` must
// survive as transparent rather than becoming a black pixel.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { gridToSurface } from "../scripts/asset-tools/grid.mjs";
import { loadImage } from "../scripts/asset-tools/image.mjs";
import { writePng } from "../scripts/asset-tools/preview.mjs";
import {
  hexToRgba,
  paletteFromHex,
} from "../scripts/asset-tools/sprite-yaml.mjs";
import { upscale } from "../scripts/asset-tools/surface.mjs";
import { traceImage } from "../scripts/asset-tools/trace.mjs";
import { loadSprites } from "../scripts/sprite-data/load-yaml.mjs";

type Rgba = [number, number, number, number];

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const authorScript = fileURLToPath(
  new URL("../scripts/sprite-author.mjs", import.meta.url),
);

/** The atlas preview scale — `generate-assets.mjs` writes `<name>@8x.png`. */
const PREVIEW_SCALE = 8;

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "gis-sprite-rt-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Draw a sprite exactly as the asset generator does — its grid rendered
 * through its palette, upscaled ×8 — and write the PNG. Returns the path.
 */
async function renderPreviewPng(
  name: string,
  grid: string[],
  palette: Record<string, Rgba>,
): Promise<string> {
  const path = join(dir, `${name}@${PREVIEW_SCALE}x.png`);
  await writePng(upscale(gridToSurface(grid, palette), PREVIEW_SCALE), path);
  return path;
}

/** Every cell's resolved `r,g,b` (or null for transparent) — palette-key blind. */
function pixels(
  grid: string[],
  color: (char: string) => Rgba | undefined,
): (string | null)[][] {
  return grid.map((row) =>
    [...row].map((char) => {
      if (char === ".") return null;
      const rgba = color(char);
      return rgba ? rgba.slice(0, 3).join(",") : `?${char}`;
    }),
  );
}

/** The same, for a traced sprite (hex palette, block-scalar grid). */
function tracedPixels(traced: {
  palette: Record<string, string>;
  grid: string;
}): (string | null)[][] {
  return pixels(traced.grid.trimEnd().split("\n"), (char) => {
    const hex = traced.palette[char];
    return hex ? (hexToRgba(hex) as Rgba) : undefined;
  });
}

// ---- byte-for-byte, through the real CLI -----------------------------------

// A 4×4 fixture carrying the full prompt apparatus: a prose description, a
// structured subject, and a human name commented onto every palette entry.
// Its palette keys are already the canonical ladder (A…C by OKLab lightness),
// which is the form `analyze` emits — see the key-renaming case below.
const AUTHORED = `name: roundtrip_dot
family: hero
size: [ 4, 4 ]
description: a red dot ringed in outline, one white glint
subject:
  kind: test fixture
  accent: a single white glint
palette:
  A: "#1a1c2c" # outline
  B: "#d83a3a" # red body
  C: "#f4f4f4" # white glint
grid: |
  .AA.
  ABBA
  ABCA
  .AA.
`;

// The same sprite with THE PROMPT STUFF GONE: no subject, no palette names,
// and a blank description for the author to write. Everything else — the
// name, the family, the size, every palette color and every grid cell — is
// re-derived from the picture alone.
const EXPECTED = `name: roundtrip_dot
family: hero
size: [ 4, 4 ]
description: ""
palette:
  A: "#1a1c2c"
  B: "#d83a3a"
  C: "#f4f4f4"
grid: |
  .AA.
  ABBA
  ABCA
  .AA.
`;

describe("a rendered sprite PNG traced back to YAML", () => {
  let emitted: string;

  beforeAll(async () => {
    const authored = parse(AUTHORED);
    const png = await renderPreviewPng(
      authored.name,
      authored.grid.trimEnd().split("\n"),
      paletteFromHex(authored.palette),
    );
    // The real CLI, not a re-implementation of it: a round-trip asserted
    // against a private copy of the pipeline proves nothing about the tool.
    emitted = execFileSync(
      process.execPath,
      [
        authorScript,
        "analyze",
        png,
        "--name",
        authored.name,
        "--family",
        authored.family,
        // The preview is ×8, so the target grid has to be stated — `analyze`
        // only infers the size for an image already at sprite resolution.
        "--size",
        `${authored.size[0]}x${authored.size[1]}`,
      ],
      { cwd: repoRoot, encoding: "utf8", stdio: "pipe" },
    );
  });

  it("re-emits the authored YAML byte-for-byte, minus the prompt", () => {
    expect(emitted).toBe(EXPECTED);
  });

  it("drops nothing from the sprite but the prompt fields", () => {
    const authored = parse(AUTHORED);
    const back = parse(emitted);
    expect(back).toEqual({ ...authored, description: "", subject: undefined });
    // `subject` is absent, not present-and-empty: an empty slot record would
    // read as "asked for nothing" rather than "not asked yet".
    expect("subject" in back).toBe(false);
  });

  it("leaves the description blank rather than inventing one", () => {
    // The description is the sprite's ACCEPTANCE TARGET (pixel-assets skill):
    // guessing it from the pixels would hand the next regeneration a target
    // derived from the very art it is meant to judge.
    expect(parse(emitted).description).toBe("");
    expect(emitted).not.toContain("red dot");
    expect(emitted).not.toContain("glint");
  });
});

// ---- the whole shipped tree -------------------------------------------------

describe("the shipped sprite tree", () => {
  const { SPRITES, SPRITE_PALETTES } = loadSprites();

  /** A sprite's distinct opaque colors, and whether any pixel is translucent. */
  function facts(name: string) {
    const grid = SPRITES[name]!;
    const palette = SPRITE_PALETTES[name]!;
    const used = new Set<string>();
    for (const row of grid) for (const c of row) if (c !== ".") used.add(c);
    const chars = [...used];
    return {
      grid,
      palette,
      translucent: chars.some((c) => (palette[c]?.[3] ?? 255) !== 255),
      colors: new Set(chars.map((c) => palette[c]!.slice(0, 3).join(","))).size,
    };
  }

  // The two lossy edges, each pinned by its own case below: a PNG cell is
  // read as opaque or not at all, and the palette is capped at `--colors`.
  const roundTrippable = Object.keys(SPRITES).filter((name) => {
    const { translucent, colors } = facts(name);
    return !translucent && colors <= 16;
  });

  it("has a large opaque, palette-capped majority to check", () => {
    // A skip rule that quietly matched nothing would turn the sweep below
    // into a green no-op.
    expect(roundTrippable.length).toBeGreaterThan(1000);
    expect(roundTrippable.length).toBeGreaterThan(
      Object.keys(SPRITES).length * 0.8,
    );
  });

  it("re-derives every one of them pixel-for-pixel", async () => {
    const broken: string[] = [];
    for (const name of roundTrippable) {
      const { grid, palette } = facts(name);
      const png = await renderPreviewPng(name, grid, palette);
      const traced = traceImage(await loadImage(png), {
        name,
        family: "sweep",
        size: [grid[0]!.length, grid.length],
      });
      const before = pixels(grid, (c) => palette[c] as Rgba | undefined);
      const after = tracedPixels(traced);
      if (JSON.stringify(before) !== JSON.stringify(after)) broken.push(name);
    }
    expect(broken).toEqual([]);
  }, 120_000);

  it("renames palette keys to the canonical lightness ladder", async () => {
    // The keys are the ONE field a trace does not preserve, and deliberately:
    // an authored sprite names its colors mnemonically (`O` outline, `y` gold
    // visor) where a trace has only the pixels, so it assigns `A…` in OKLab
    // lightness→hue order — stable across re-runs, which is what keeps a
    // re-analyze from churning the whole grid.
    const { grid, palette } = facts("player_0");
    const png = await renderPreviewPng("player_0_keys", grid, palette);
    const traced = traceImage(await loadImage(png), {
      name: "player_0",
      family: "hero",
      size: [16, 16],
    });
    expect(Object.keys(palette).sort()).not.toEqual(
      Object.keys(traced.palette).sort(),
    );
    // The hero paints eight colors, so the ladder runs A…H in order.
    expect(Object.keys(traced.palette)).toEqual([...("ABCDEFGH" as const)]);
    // …and the ladder really is by lightness: the outline is darkest, the
    // glove white lightest.
    expect(traced.palette.A).toBe("#1a1c2c");
    expect(traced.palette.H).toBe("#f4f4f4");
    // Same pixels regardless — the renaming is a relabelling, not a redraw.
    expect(tracedPixels(traced)).toEqual(
      pixels(grid, (c) => palette[c] as Rgba | undefined),
    );
  });
});

// ---- the two lossy edges ----------------------------------------------------

describe("what a PNG trace cannot recover", () => {
  it("reads a translucent pixel as opaque or as nothing at all", async () => {
    // The trace thresholds alpha at 128 and re-emits opaque, so a sprite with
    // translucent palette entries does NOT round-trip — which is exactly why
    // the sweep above excludes them rather than pretending otherwise.
    const palette: Record<string, Rgba> = {
      f: [216, 58, 58, 255],
      g: [216, 58, 58, 200], // above the threshold → snaps to opaque
      h: [216, 58, 58, 60], // below it → dropped to transparent
    };
    const grid = ["fg", "h."];
    const png = await renderPreviewPng("alpha", grid, palette);
    const traced = traceImage(await loadImage(png), {
      name: "alpha",
      family: "test",
      size: [2, 2],
    });
    expect(traced.grid).toBe("AA\n..\n");
    expect(traced.palette.A).toBe("#d83a3a");
  });

  it("collapses a palette past the color cap", async () => {
    // Four distinct greys traced with `--colors 2` median-cut down to two.
    const palette: Record<string, Rgba> = {
      a: [10, 10, 10, 255],
      b: [60, 60, 60, 255],
      c: [190, 190, 190, 255],
      d: [240, 240, 240, 255],
    };
    const png = await renderPreviewPng("greys", ["ab", "cd"], palette);
    const image = await loadImage(png);
    expect(
      Object.keys(
        traceImage(image, { name: "g", family: "t", size: [2, 2] }).palette,
      ),
    ).toHaveLength(4);
    const capped = traceImage(image, {
      name: "g",
      family: "t",
      size: [2, 2],
      colors: 2,
    });
    expect(Object.keys(capped.palette)).toHaveLength(2);
  });

  it("keeps `.` transparent rather than painting it", async () => {
    const palette: Record<string, Rgba> = { a: [216, 58, 58, 255] };
    const png = await renderPreviewPng("hole", [".a", "a."], palette);
    const traced = traceImage(await loadImage(png), {
      name: "hole",
      family: "test",
      size: [2, 2],
    });
    expect(traced.grid).toBe(".A\nA.\n");
    expect(traced.palette["."]).toBeUndefined();
  });
});

// ---- determinism ------------------------------------------------------------

describe("tracing the same PNG twice", () => {
  it("emits the identical sprite — no RNG anywhere in the path", async () => {
    // A trace that drifted between runs would make every re-analyze a diff,
    // and the authoring loop re-analyzes constantly.
    const { SPRITES, SPRITE_PALETTES } = loadSprites();
    const grid = SPRITES.player_0!;
    const png = await renderPreviewPng(
      "player_0_twice",
      grid,
      SPRITE_PALETTES.player_0!,
    );
    const trace = async () =>
      traceImage(await loadImage(png), {
        name: "player_0",
        family: "hero",
        size: [16, 16],
      });
    // Decoded afresh each time, so a stateful decoder would show up too.
    expect(await trace()).toEqual(await trace());
  });
});

// Keep the fixture writer honest: the two constants above must stay a valid
// YAML pair, or a typo in EXPECTED would silently weaken the byte comparison.
describe("the fixtures themselves", () => {
  it("differ only in the prompt fields", () => {
    const a = parse(AUTHORED);
    const b = parse(EXPECTED);
    expect({ ...a, description: "", subject: undefined }).toEqual(b);
  });
});

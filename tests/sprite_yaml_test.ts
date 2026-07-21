// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML sprite format (see the `pixel-assets` skill): one
// self-describing file per base sprite, loaded into the same maps the old
// per-family `.mjs` merge produced. These tests pin the schema validator (the
// guard that fails `make assets` on a malformed file — the block-scalar
// trailing-space footgun in particular), the hex ⇄ rgba round-trip that keeps
// the atlas byte-identical, and that the whole shipped tree loads clean.

import { describe, expect, it } from "vitest";

import {
  hexToRgba,
  paletteFromHex,
  paletteToHex,
  rgbaToHex,
} from "../scripts/asset-tools/sprite-yaml.mjs";
import {
  gridRows,
  validatePalette,
  validateSprite,
} from "../scripts/asset-tools/sprite-schema.mjs";
import { loadSprites } from "../scripts/sprite-data/load-yaml.mjs";

/** A minimal, schema-valid 2×2 sprite to mutate per case. */
const validSprite = () => ({
  name: "dot",
  family: "test",
  size: [2, 2],
  description: "a dot",
  palette: { a: "#ff0000" },
  grid: "a.\n.a\n",
});

describe("hex ⇄ rgba round-trip", () => {
  it("spells alpha only when not fully opaque", () => {
    expect(rgbaToHex([255, 176, 46, 255])).toBe("#ffb02e");
    expect(rgbaToHex([12, 14, 22, 110])).toBe("#0c0e166e");
  });

  it("parses 3/6/8-digit hex, defaulting alpha to 255", () => {
    expect(hexToRgba("#fff")).toEqual([255, 255, 255, 255]);
    expect(hexToRgba("#ffb02e")).toEqual([255, 176, 46, 255]);
    expect(hexToRgba("#0c0e166e")).toEqual([12, 14, 22, 110]);
  });

  it("is a lossless inverse for a palette map", () => {
    const palette = { O: [26, 28, 44, 255], z: [12, 14, 22, 110] };
    expect(paletteFromHex(paletteToHex(palette))).toEqual(palette);
  });

  it("rejects a malformed color", () => {
    expect(() => hexToRgba("#ggg")).toThrow(/invalid hex/);
    expect(() => hexToRgba("1a2b3c")).toThrow(/invalid hex/);
  });
});

describe("validateSprite", () => {
  it("accepts a well-formed sprite", () => {
    expect(validateSprite(validSprite()).errors).toEqual([]);
  });

  it("flags a row count that disagrees with size — the footgun guard", () => {
    const s = { ...validSprite(), grid: "a.\n" };
    expect(validateSprite(s).errors.join()).toMatch(
      /grid has 1 rows, size says 2/,
    );
  });

  it("flags a narrowed row (a stripped trailing pixel)", () => {
    const s = { ...validSprite(), grid: "a.\n.\n" };
    expect(validateSprite(s).errors.join()).toMatch(
      /row 1: width 1, size says 2/,
    );
  });

  it("flags a painted char missing from the palette", () => {
    const s = { ...validSprite(), grid: "ab\n.a\n" };
    expect(validateSprite(s).errors.join()).toMatch(/char "b" not in palette/);
  });

  it("rejects a non-integer size", () => {
    const s = { ...validSprite(), size: [2, 0] };
    expect(validateSprite(s).errors.join()).toMatch(/size must be/);
  });

  it("warns on an empty description (the acceptance target)", () => {
    const s = { ...validSprite(), description: "" };
    expect(validateSprite(s).warnings.join()).toMatch(/empty description/);
  });
});

describe("validatePalette", () => {
  it("rejects `.` as a palette key", () => {
    expect(validatePalette("x", { ".": "#000000" }).join()).toMatch(
      /reserved transparent/,
    );
  });

  it("rejects a multi-char or non-alphanumeric key", () => {
    expect(validatePalette("x", { ab: "#000000" }).join()).toMatch(
      /must match/,
    );
    expect(validatePalette("x", { "#": "#000000" }).join()).toMatch(
      /must match/,
    );
  });

  it("rejects an invalid color", () => {
    expect(validatePalette("x", { a: "red" }).join()).toMatch(
      /not a valid hex/,
    );
  });
});

describe("gridRows", () => {
  it("drops the block scalar's trailing newline", () => {
    expect(gridRows("a.\n.a\n")).toEqual(["a.", ".a"]);
  });
});

describe("the shipped sprite tree", () => {
  const loaded = loadSprites();

  it("loads without a schema error", () => {
    // loadSprites throws if any file violates the schema, so a clean return
    // is the assertion that the whole committed tree is valid.
    expect(Object.keys(loaded.SPRITES).length).toBeGreaterThan(500);
  });

  it("exposes the hero as a 16×16 sprite", () => {
    const grid = loaded.SPRITES.player_0;
    expect(grid).toHaveLength(16);
    expect(grid?.[0]).toHaveLength(16);
  });

  it("carries only base sprites — wounds and worn are derived later", () => {
    const names = Object.keys(loaded.SPRITES);
    expect(names.some((n) => /_(hurt|wrecked|dying)_\d+$/.test(n))).toBe(false);
    expect(names.some((n) => n.startsWith("worn_"))).toBe(false);
  });

  it("merges the shared core under each family palette", () => {
    const hero = loaded.FAMILIES.find((f) => f.name === "hero");
    // "O" is the core outline; every family's full palette resolves it.
    expect(hero?.palette.O).toEqual(loaded.CORE_PALETTE.O);
  });
});

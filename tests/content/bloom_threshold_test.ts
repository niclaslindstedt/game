// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLOOM'S THRESHOLD MUST CLEAR THE GAME'S OWN FLOORS.
//
// Bloom (pwa/src/game/render/bloom.ts) adds a halo around everything it decides
// is LIGHT. That decision is one luminance knee, and it only means "light" for
// as long as it sits ABOVE the ordinary ground — because the ground is not a
// minority of a frame here, it IS the frame: sample any moment of play and the
// moon's regolith (0.554) and GOODCO HQ's deck (0.701) are each the 50th AND the
// 90th percentile of their own picture.
//
// Ship a knee under them and the floor is classed as a light source and added
// back over itself. That is exactly what the first version of the pass did — a
// knee at 0.49, under every venue's floor — and it lifted the mean luminance of
// the whole picture by 14–24%: the moon came out a milky lavender and the HQ
// deck bleached with its tile grid gone.
//
// So this walks the ground tiles every level actually lays down, reads their
// PIXELS out of the authored sprite grids, and holds the knee above them. It is
// the guard for a failure that has no error message and no crash: a new pale
// floor tile, or a nudge to the filter, and the game starts glowing its own dirt
// again.
//
// It reads the ART rather than a rendered frame, which makes it CONSERVATIVE
// rather than exact — a venue can render darker than its tiles (the bunker's
// pale deck plate reaches only 0.34 on screen once its gloom and fog are over
// it, against 0.74 in the file). That is the right direction for a guard: it can
// fire early and ask a human, never miss.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { LEVELS } from "@game/core";
import type { TileSpec } from "@game/core";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { brightPassKnee } from "../../pwa/src/game/render/bloom.ts";

const SPRITE_ROOT = fileURLToPath(
  new URL("../../content/sprites", import.meta.url),
);

/** Every ground sprite a level can put under the hero — the level-wide pair,
 * its patch pair, and every zone's overrides. */
function groundSpriteNames(tiles: TileSpec): string[] {
  const names = [tiles.ground.common, tiles.ground.rare];
  if (tiles.patch) names.push(tiles.patch.a, tiles.patch.b);
  for (const zone of tiles.zones ?? []) {
    names.push(zone.ground.common, zone.ground.rare);
    if (zone.patch) names.push(zone.patch.a, zone.patch.b);
  }
  return names;
}

type SpriteFile = {
  name?: string;
  palette?: Record<string, string>;
  grid?: string;
};

/** Relative luminance of a `#rrggbb`, on the same flat channel mean the bloom's
 * `brightness()`/`contrast()` chain operates on. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return 0;
  const n = Number.parseInt(m[1], 16);
  return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 765;
}

/** The sprite files and the palette characters a sprite inherits rather than
 * declaring (its family's, and the shared core's). */
function loadSprites() {
  const sprites = new Map<string, SpriteFile>();
  const inherited: Record<string, string> = {};
  for (const family of readdirSync(SPRITE_ROOT, { withFileTypes: true })) {
    if (!family.isDirectory()) continue;
    const dir = `${SPRITE_ROOT}/${family.name}`;
    const fam = parse(
      readFileSync(`${dir}/_family.yaml`, "utf8"),
    ) as SpriteFile;
    Object.assign(inherited, fam?.palette ?? {});
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".yaml") || file.startsWith("_")) continue;
      const doc = parse(readFileSync(`${dir}/${file}`, "utf8")) as SpriteFile;
      if (doc?.name) sprites.set(doc.name, doc);
    }
  }
  const core = parse(
    readFileSync(`${SPRITE_ROOT}/_core.yaml`, "utf8"),
  ) as SpriteFile;
  Object.assign(inherited, core?.palette ?? {});
  return { sprites, inherited };
}

/** The luminance of every pixel a tile actually PAINTS — transparent cells and
 * palette entries the grid never uses don't reach the floor. */
function paintedLuminance(
  sprite: SpriteFile,
  inherited: Record<string, string>,
): number[] {
  const palette = { ...inherited, ...sprite.palette };
  const out: number[] = [];
  for (const row of (sprite.grid ?? "").split("\n")) {
    for (const ch of row.trim()) {
      if (ch === ".") continue;
      const hex = palette[ch];
      if (hex) out.push(luminance(hex));
    }
  }
  return out;
}

const { sprites, inherited } = loadSprites();

const FLOORS = [
  ...new Set(
    Object.values(LEVELS).flatMap((level) => groundSpriteNames(level.tiles)),
  ),
].map((name) => {
  const sprite = sprites.get(name);
  const pixels = sprite ? paintedLuminance(sprite, inherited) : [];
  const knee = brightPassKnee();
  return {
    name,
    found: Boolean(sprite && pixels.length > 0),
    mean: pixels.reduce((a, b) => a + b, 0) / Math.max(1, pixels.length),
    litShare:
      pixels.filter((v) => v > knee).length / Math.max(1, pixels.length),
  };
});

describe("the bloom's bright-pass threshold", () => {
  it("finds every ground tile the campaign lays down", () => {
    // A miss here would make every assertion below vacuously true.
    expect(FLOORS.length).toBeGreaterThan(5);
    expect(FLOORS.filter((f) => !f.found).map((f) => f.name)).toEqual([]);
  });

  it("sits above the body of every floor in the game", () => {
    const knee = brightPassKnee();
    // Reported as a list so a failure names the offending tile and its number
    // rather than just saying a bound was crossed.
    const over = FLOORS.filter((f) => f.mean >= knee).map(
      (f) => `${f.name} @ ${f.mean.toFixed(3)}`,
    );
    expect({ knee: knee.toFixed(3), over }).toEqual({
      knee: knee.toFixed(3),
      over: [],
    });
    // The bunker's deck plate is the palest floor authored (mean 0.742 against
    // a knee of 0.795), so the headroom here is genuinely thin — which is the
    // point. A new floor brighter than that one wants a human to look at what
    // it does to the bloom, not a margin quietly widened to let it through.
    const palest = FLOORS.reduce((a, b) => (b.mean > a.mean ? b : a));
    expect(palest.mean).toBeLessThan(knee);
  });

  it("lets a floor GLINT without letting it glow", () => {
    // The other half of the rule, and the reason this is not simply "no ground
    // pixel may pass the knee": the rift's void tile is a starfield, and its
    // stars are lights that SHOULD bloom. What must never happen is a floor
    // whose surface is mostly over the line — a few bright specks are a
    // texture, a majority is a lamp.
    const mostlyLit = FLOORS.filter((f) => f.litShare > 0.25).map(
      (f) => `${f.name} @ ${(f.litShare * 100).toFixed(0)}%`,
    );
    expect(mostlyLit).toEqual([]);
  });

  it("still sits low enough to catch a light", () => {
    // A knee that crept up toward white would leave the effect switched on and
    // doing nothing at all.
    expect(brightPassKnee()).toBeLessThan(0.9);
  });
});

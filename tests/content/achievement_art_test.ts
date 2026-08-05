// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PORTAL ARTWORK (scripts/achievement-art.mjs): the images a human uploads
// beside the achievement rows in App Store Connect and the Steamworks partner
// site. The rasters themselves are gitignored build output, so what is guarded
// here is what the generator RESTS on and what it PROMISES:
//
//   - every id in either committed manifest still names a badge whose `icon`
//     is a sprite the shipped atlas has (the run reads no other list);
//   - the badge is scaled by a WHOLE number and centered, never resampled;
//   - the locked variant is the shelf's own `grayscale(1) brightness(0.55)`,
//     so Steam's side-by-side pair reads as earned/unearned rather than as two
//     different pictures.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACHIEVEMENTS_BY_ID } from "../../pwa/src/game/achievement-defs.ts";
import {
  BADGE_BACKDROP,
  badgeCanvas,
  lockedBadge,
} from "../../scripts/asset-tools/achievement-badge.mjs";
import { createSurface } from "../../scripts/asset-tools/surface.mjs";

type Surface = { width: number; height: number; data: Uint8Array };

const read = (relative: string) =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));

const ATLAS: Record<string, [number, number, number, number]> = read(
  "../../pwa/src/game/assets/atlas.json",
);

const MANIFESTS = [
  {
    portal: "Game Center",
    rows: read("../../native/store/game-center-achievements.json")
      .achievements as Array<{ id: string }>,
  },
  {
    portal: "Steam",
    rows: read("../../electron/store/steam-achievements.json")
      .achievements as Array<{ id: string }>,
  },
];

/** A solid `w × h` test sprite in one color, fully opaque. */
function swatch(w: number, h: number, rgb: [number, number, number]): Surface {
  const surface = createSurface(w, h);
  for (let i = 0; i < surface.data.length; i += 4) {
    surface.data[i] = rgb[0];
    surface.data[i + 1] = rgb[1];
    surface.data[i + 2] = rgb[2];
    surface.data[i + 3] = 255;
  }
  return surface;
}

const pixel = (surface: Surface, x: number, y: number) => {
  const i = (y * surface.width + x) * 4;
  return [...surface.data.subarray(i, i + 4)];
};

describe("achievement portal artwork", () => {
  it("resolves every manifest row to a badge sprite in the shipped atlas", () => {
    for (const { portal, rows } of MANIFESTS) {
      expect(rows.length, portal).toBeGreaterThan(0);
      for (const row of rows) {
        const def = ACHIEVEMENTS_BY_ID.get(row.id);
        expect(def, `${portal} lists ${row.id}`).toBeDefined();
        expect(ATLAS[def!.icon], `${row.id} → ${def!.icon}`).toBeDefined();
      }
    }
  });

  it("upscales by a whole number and centers on the canvas", () => {
    // Game Center's raster: a 12×12 badge in a 1024 square that keeps a tenth
    // clear on each side — an 819px box, so 68× (816px), 104px in from the edge.
    const art = badgeCanvas(swatch(12, 12, [200, 40, 40]), {
      size: 1024,
      margin: 0.1,
    });
    expect([art.width, art.height]).toEqual([1024, 1024]);
    expect(pixel(art, 103, 512)).toEqual(BADGE_BACKDROP);
    expect(pixel(art, 104, 512)).toEqual([200, 40, 40, 255]);
    expect(pixel(art, 919, 512)).toEqual([200, 40, 40, 255]);
    expect(pixel(art, 920, 512)).toEqual(BADGE_BACKDROP);
  });

  it("never scales a badge below 1× to make it fit", () => {
    // Steam's 64px chip against the tallest badge sprite in the catalog: it
    // ships at native size, centered — squeezing it would land the art on a
    // half-pixel grid, which is the one thing pixel art may never do.
    const art = badgeCanvas(swatch(32, 48, [40, 200, 40]), { size: 64 });
    expect([art.width, art.height]).toEqual([64, 64]);
    expect(pixel(art, 16, 8)).toEqual([40, 200, 40, 255]);
    expect(pixel(art, 16, 7)).toEqual(BADGE_BACKDROP);
    expect(pixel(art, 15, 32)).toEqual(BADGE_BACKDROP);
  });

  it("leaves no transparent pixel for a portal to fill in", () => {
    const art = badgeCanvas(createSurface(8, 8), { size: 64 });
    for (let i = 3; i < art.data.length; i += 4) expect(art.data[i]).toBe(255);
  });

  it("dims the locked variant the way the shelf does", () => {
    const locked = lockedBadge(swatch(2, 2, [200, 40, 40]));
    // grayscale(1) → the sRGB luminance matrix; brightness(0.55) → a multiply.
    const luma = 0.2126 * 200 + 0.7152 * 40 + 0.0722 * 40;
    const value = Math.round(luma * 0.55);
    expect(pixel(locked, 0, 0)).toEqual([value, value, value, 255]);
    // Grey, and unmistakably darker than what it came from.
    expect(value).toBeLessThan(200);
  });

  it("dims rather than fades — a locked badge keeps its own shape", () => {
    const sprite = swatch(2, 2, [200, 40, 40]);
    sprite.data[3] = 0; // one transparent pixel: the badge's silhouette
    const locked = lockedBadge(sprite);
    expect(locked.data[3]).toBe(0);
    expect(pixel(locked, 1, 0)[3]).toBe(255);
  });
});

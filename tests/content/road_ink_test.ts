// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE ROAD, TWO PAINTERS — the county road past the hero's lot is drawn in two
// wholly different ways, and this is the seam that keeps them the same road.
//
// The DRIVE paints it as flat fills through the world projection
// (`pwa/src/game/drive-screen/render.ts`, off `ROAD_INK`). The GARAGE CUTSCENES
// lay it across the front of the lot as authored ground art
// (`content/sprites/scenes/road_lane.yaml`) — the launch, and the homecoming
// that lands on the same tarmac. A player sees both within a minute of each
// other: the hero walks into his garage off this road and is driving down it
// before the next scene is over.
//
// A SPRITE CANNOT IMPORT A CONSTANT — content is authored data, compiled by
// generators that know nothing about the app's render modules — so the tile's
// palette is hex typed by hand, and hex typed by hand drifts. This file is what
// makes that drift a red suite instead of two subtly different greys nobody
// puts side by side.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CENTRE_DASH,
  ROAD_INK,
} from "../../pwa/src/game/drive-screen/scenery.ts";

/** The authored tile, parsed for exactly the two things asserted below: what
 * colours it paints with, and the rows it paints. A hand-rolled read rather
 * than the YAML loader, because what is being checked is the FILE — a loader
 * that normalized a colour would hide the very drift this exists to catch. */
function roadTile(): { palette: Record<string, string>; grid: string[] } {
  const text = readFileSync(
    new URL("../../content/sprites/scenes/road_lane.yaml", import.meta.url),
    "utf8",
  );
  const palette: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const entry = /^ {2}(\S): "(#[0-9a-fA-F]{6})"/.exec(line);
    if (entry?.[1] && entry[2]) palette[entry[1]] = entry[2].toLowerCase();
  }
  const grid = text
    .slice(text.indexOf("grid: |") + "grid: |".length)
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  return { palette, grid };
}

describe("the cutscene road is the drive's road", () => {
  const { palette, grid } = roadTile();

  it("paints with the drive's own four inks and nothing else", () => {
    expect(new Set(Object.values(palette))).toEqual(
      new Set(Object.values(ROAD_INK).map((hex) => hex.toLowerCase())),
    );
  });

  it("lays tarmac, a rim each side, and a kerb on the near one", () => {
    const ink = (row: string) => palette[row[0] as string];
    // Read off the tile rather than restated: the FIRST and LAST rows are the
    // ones that have to be the rim and the kerb, whatever depth the lanes are
    // given between them.
    expect(ink(grid[0] as string)).toBe(ROAD_INK.edge);
    expect(ink(grid.at(-2) as string)).toBe(ROAD_INK.edge);
    expect(ink(grid.at(-1) as string)).toBe(ROAD_INK.kerb);
    expect(grid.some((row) => ink(row) === ROAD_INK.road)).toBe(true);
  });

  it("breaks its centre line on a cycle the tile's own width divides", () => {
    const width = (grid[0] as string).length;
    const paintKey = Object.entries(palette).find(
      ([, hex]) => hex === ROAD_INK.paint,
    )?.[0];
    expect(paintKey).toBeDefined();
    const marked = grid.filter((row) => row.includes(paintKey as string));
    // ONE line: a two-lane road has a centre and nothing else.
    expect(marked).toHaveLength(1);
    const line = marked[0] as string;
    // The cycle has to divide the tile, or a row of tiles comes out as a line
    // with a stutter in it every 56 px — which is the whole reason the tile
    // rounds the drive's 12-on/14-off rather than copying it.
    const runs = [...line.matchAll(new RegExp(`${paintKey}+`, "g"))];
    expect(runs.length).toBeGreaterThan(0);
    const cycle = width / runs.length;
    expect(Number.isInteger(cycle)).toBe(true);
    for (const run of runs) expect(run[0].length).toBe(CENTRE_DASH.on);
    // …and the rounding stays within a pixel of the road's own rhythm, so the
    // two really do read as the same markings.
    expect(Math.abs(cycle - (CENTRE_DASH.on + CENTRE_DASH.off))).toBeLessThan(
      3,
    );
  });
});

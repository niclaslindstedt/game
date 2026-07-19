// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PROP LINES (LevelDef.propLines): a sprite stamped every `spacing` world px
// along a from→to segment, expanded into aligned obstacles (colliding) or decor
// (flat) — the structured-placement primitive that lets a level be composed as
// rows (a conveyor run, a workstation line) instead of random scatter. Covers
// buildPropLines directly (create.ts): count, endpoints, collide vs flat.

import { describe, expect, it } from "vitest";

import type { LevelDef } from "@game/core";

import { buildPropLines } from "../../src/game/create.ts";

/** A LevelDef carrying only the propLines under test (the expander reads
 * nothing else); cast through unknown so the fixture stays minimal. */
function defWith(propLines: NonNullable<LevelDef["propLines"]>): LevelDef {
  return { propLines } as unknown as LevelDef;
}

/** A fresh monotonic id source, like create.ts hands the builders. */
function ids() {
  let n = 1;
  return () => n++;
}

describe("buildPropLines", () => {
  it("stamps a flat line into decor at each spacing step, endpoints included", () => {
    const { obstacles, decor } = buildPropLines(
      defWith([
        {
          sprite: "conveyor",
          from: { x: 100, y: 200 },
          to: { x: 100, y: 500 },
          spacing: 100,
        },
      ]),
      ids(),
    );
    expect(obstacles).toHaveLength(0);
    // 100→500 at spacing 100 → 200,300,400,500 plus the 100 start = 4 steps.
    expect(decor.map((d) => d.pos.y)).toEqual([200, 300, 400, 500]);
    // First prop sits exactly on `from`.
    expect(decor[0]!.pos).toEqual({ x: 100, y: 200 });
    expect(
      decor.every((d) => d.sprite === "conveyor" && d.kind === "conveyor"),
    ).toBe(true);
  });

  it("stamps a colliding line into box obstacles sized by half", () => {
    const takeId = ids();
    const { obstacles, decor } = buildPropLines(
      defWith([
        {
          sprite: "fuselage",
          from: { x: 0, y: 0 },
          to: { x: 300, y: 0 },
          spacing: 150,
          collide: true,
          half: { x: 10, y: 13 },
        },
      ]),
      takeId,
    );
    expect(decor).toHaveLength(0);
    expect(obstacles.map((o) => o.pos.x)).toEqual([0, 150, 300]);
    for (const o of obstacles) {
      expect(o.half).toEqual({ x: 10, y: 13 });
      expect(o.jumpable).toBe(false);
      expect(o.sprite).toBe("fuselage");
      expect(o.radius).toBeGreaterThan(0); // bounding radius derived from half
    }
    // Ids come from the shared counter — unique and monotonic.
    expect(new Set(obstacles.map((o) => o.id)).size).toBe(obstacles.length);
  });

  it("falls back to a circle radius when no half is given", () => {
    const { obstacles } = buildPropLines(
      defWith([
        {
          sprite: "fuselage",
          from: { x: 0, y: 0 },
          to: { x: 0, y: 0 },
          spacing: 16,
          collide: true,
          radius: 12,
        },
      ]),
      ids(),
    );
    // A zero-length line places exactly one prop, on `from`.
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]!.radius).toBe(12);
    expect(obstacles[0]!.half).toBeUndefined();
  });

  it("returns nothing when there are no prop lines", () => {
    const { obstacles, decor } = buildPropLines(defWith([]), ids());
    expect(obstacles).toHaveLength(0);
    expect(decor).toHaveLength(0);
  });
});

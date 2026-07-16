// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DESIGN ZONES + the systems they gate (src/game/zones.ts, create.ts, step.ts):
// safe zones (no spawns + the horde repelled out), quiet/dead zones (no ambient
// horde), the tempo curve (wave pressure over the run), special chests (a
// richer break haul), and authored merchant spawn points. Runs on the
// synthetic fixture level FIX_ZONE_LEVEL.

import { describe, expect, it } from "vitest";

import {
  anyZoneContains,
  createGame,
  dismissIntro,
  enemyDef,
  repelFromZones,
  skipCutscene,
  zoneContains,
  type GameState,
  type Zone,
} from "@game/core";
import { distance } from "@game/lib/vec.ts";

import { idle, makeEnemy, run } from "./helpers.ts";
import { FIX_ZONE_LEVEL } from "./fixtures.ts";
import "./fixtures.ts";

const SAFE = FIX_ZONE_LEVEL.safeZones![0] as Zone;
const QUIET = FIX_ZONE_LEVEL.quietZones![0] as Zone;

function zoneGame(difficulty = "medium"): GameState {
  const state = createGame(1, "test_zone_level", difficulty as never);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

const minionCount = (state: GameState) =>
  state.enemies.filter((e) => enemyDef(e.defId).role === "minion").length;

describe("zone geometry helpers", () => {
  it("tests containment for circles and rects", () => {
    const circle: Zone = {
      shape: "circle",
      pos: { x: 100, y: 100 },
      radius: 50,
    };
    expect(zoneContains(circle, { x: 120, y: 100 })).toBe(true);
    expect(zoneContains(circle, { x: 160, y: 100 })).toBe(false);
    const rect: Zone = {
      shape: "rect",
      rect: { x: 0, y: 0, width: 100, height: 100 },
    };
    expect(zoneContains(rect, { x: 50, y: 50 })).toBe(true);
    expect(zoneContains(rect, { x: 150, y: 50 })).toBe(false);
    expect(anyZoneContains([circle, rect], { x: 50, y: 50 })).toBe(true);
    expect(anyZoneContains([circle, rect], { x: 500, y: 500 })).toBe(false);
    expect(anyZoneContains(undefined, { x: 0, y: 0 })).toBe(false);
  });

  it("ejects a point out of a rect along its nearest edge", () => {
    const rect: Zone = {
      shape: "rect",
      rect: { x: 0, y: 0, width: 100, height: 100 },
    };
    const pos = { x: 90, y: 50 }; // closest to the right edge
    repelFromZones([rect], pos, 5);
    expect(pos.x).toBe(105);
    expect(zoneContains(rect, pos)).toBe(false);
  });

  it("ejects a point radially out of a circle and leaves outside points alone", () => {
    const circle: Zone = { shape: "circle", pos: { x: 0, y: 0 }, radius: 40 };
    const inside = { x: 10, y: 0 };
    repelFromZones([circle], inside, 6);
    expect(inside.x).toBeCloseTo(46, 5);
    const outside = { x: 200, y: 200 };
    repelFromZones([circle], outside, 6);
    expect(outside).toEqual({ x: 200, y: 200 });
  });
});

describe("safe & quiet zones exclude procedural spawns", () => {
  it("places no monster inside a safe or quiet zone at creation", () => {
    const state = zoneGame();
    for (const enemy of state.enemies) {
      expect(zoneContains(SAFE, enemy.pos)).toBe(false);
      expect(zoneContains(QUIET, enemy.pos)).toBe(false);
    }
  });

  it("repels the minion horde back out of a safe zone", () => {
    const state = zoneGame();
    // Drop a minion in the dead centre of the safe pocket (the spawn point).
    const intruder = makeEnemy({ pos: { x: 340, y: 1320 } });
    state.enemies.push(intruder);
    run(state, idle, 4);
    // The repel keeps the pocket clear even though the hero stands in it.
    expect(zoneContains(SAFE, intruder.pos)).toBe(false);
  });
});

describe("special chests", () => {
  it("mints a breakable chest at the authored spot", () => {
    const state = zoneGame();
    const chest = state.obstacles.find((o) => o.chest);
    expect(chest).toBeDefined();
    expect(chest!.breakable).toBe(true);
    expect(distance(chest!.pos, { x: 1550, y: 1150 })).toBeLessThan(1);
    expect(chest!.hp ?? 0).toBeGreaterThan(0);
  });
});

describe("merchant spawn points", () => {
  it("starts the trader at one of the authored spots", () => {
    const state = zoneGame();
    const spots = FIX_ZONE_LEVEL.merchantSpawns!;
    const nearest = Math.min(
      ...spots.map((p) => distance(state.merchant.pos, p)),
    );
    expect(nearest).toBeLessThan(1);
  });
});

describe("tempo curve", () => {
  it("thins the early horde when the opening tempo dips", () => {
    // Same seed, same waves — the only differences on FIX_ZONE_LEVEL are the
    // zones and a tempo curve that opens at 0.4× pressure. Peak minion pressure
    // over the opening must land below the flat reference level's.
    const peak = (levelId: string) => {
      const state = createGame(1, levelId, "medium" as never);
      skipCutscene(state);
      dismissIntro(state);
      let max = 0;
      for (let i = 0; i < 200; i++) {
        run(state, idle, 1);
        max = Math.max(max, minionCount(state));
      }
      return max;
    };
    expect(peak("test_zone_level")).toBeLessThan(peak("test_level"));
  });
});

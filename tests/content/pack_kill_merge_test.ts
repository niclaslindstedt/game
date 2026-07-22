// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Guards the engine invariant the app's merged pack-kill XP float relies on
// (GameScreen groups a step's enemyKilled events by body proximity): a bomb
// dropped on a packed horde must kill the whole knot in ONE step and leave
// those kills touching, so `clusterByTouch` fuses them into a single float.
import { describe, expect, it } from "vitest";

import { enemyDef, step } from "@game/core";
import type { GameEvent } from "@game/core";

import { clusterByTouch } from "../../pwa/src/lib/cluster.ts";
import { startGame, clearStage, makeEnemy, idle } from "../helpers.ts";

// Mirror of the app's constants (pwa/src/game/GameScreen.tsx). Kept in
// sync by hand — small, and this test is exactly what catches a drift.
const XP_MERGE_MIN_KILLS = 3;
const XP_MERGE_SLACK_PX = 16;

/** Drop `count` one-shot wisps in a tight grid around the player, then fire a
 * screen nuke and return that step's kill events. */
function nukePackedWisps(count: number, gap: number): GameEvent[] {
  const state = startGame();
  clearStage(state);
  const { x: px, y: py } = state.player.pos;
  const cols = 6;
  let id = 5000;
  for (let i = 0; i < count; i++) {
    const gx = (i % cols) - (cols - 1) / 2;
    const gy = Math.floor(i / cols) - 1;
    state.enemies.push(
      makeEnemy(
        {
          id: id++,
          pos: { x: px + gx * gap, y: py + gy * gap },
          hp: 1,
          maxHp: 1,
          speed: 0,
        },
        "wisp",
      ),
    );
  }
  state.player.heldAbilities = ["screen_nuke"];
  step(state, { ...idle, useItem: true, useItemIndex: 0 }, 16);
  return state.events;
}

function killClusterSizes(events: GameEvent[]): number[] {
  const kills = events.filter(
    (e): e is Extract<GameEvent, { type: "enemyKilled" }> =>
      e.type === "enemyKilled" && e.xp > 0,
  );
  const bodies = kills.map((e) => ({
    x: e.pos.x,
    y: e.pos.y,
    radius: enemyDef(e.defId).radius,
  }));
  return clusterByTouch(bodies, XP_MERGE_SLACK_PX)
    .map((g) => g.length)
    .sort((a, b) => b - a);
}

describe("pack-kill merge invariant", () => {
  it("kills a packed horde in one step (all enemyKilled land in one batch)", () => {
    const events = nukePackedWisps(18, 14);
    const kills = events.filter((e) => e.type === "enemyKilled");
    expect(events.some((e) => e.type === "nuke")).toBe(true);
    expect(kills.length).toBe(18);
  });

  it("fuses a packed knot into a single mergeable cluster", () => {
    const sizes = killClusterSizes(nukePackedWisps(18, 14));
    expect(sizes.length).toBe(1);
    expect(sizes[0]).toBe(18);
    expect(sizes[0]).toBeGreaterThanOrEqual(XP_MERGE_MIN_KILLS);
  });

  it("still merges a loosely packed pack (a body-width apart)", () => {
    // Wisp radius 8 → touch reach 16 + slack 16 = 32; a 28px grid keeps
    // neighbours chained, so a blast on a loose horde still fuses.
    const sizes = killClusterSizes(nukePackedWisps(12, 28));
    expect(sizes[0]).toBeGreaterThanOrEqual(XP_MERGE_MIN_KILLS);
  });

  it("does NOT merge kills scattered far apart", () => {
    // Same nuke, but the wisps sit well beyond touch range of one another.
    const sizes = killClusterSizes(nukePackedWisps(9, 120));
    expect(Math.max(...sizes)).toBeLessThan(XP_MERGE_MIN_KILLS);
  });
});

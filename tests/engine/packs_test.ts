// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PLACED PACKS (LevelDef.packs / stepPacks): fixed clusters that sleep until
// the player nears them, then boil up and give chase, and are cleared by
// wiping them out. The movement-driven counter to the survivors-style wave
// horde — a `clearAll` level built from packs can't be won from a standstill.

import { describe, expect, it } from "vitest";

import { createGame, dismissIntro, enemyDef, skipCutscene } from "@game/core";
import type { GameEvent, GameState } from "@game/core";
import { distance } from "@game/lib/vec.ts";

import { idle, run, startGame, steerTo } from "./helpers.ts";
import "./fixtures.ts";

const PACK_LEVEL = "test_pack_level";
// FIX_PACK_LEVEL anchors (fixtures.ts): a near cluster a short walk from the
// spawn (340,1320) and a far one across the map.
const NEAR = { x: 700, y: 1320 };
const FAR = { x: 2000, y: 300 };

function packGame(difficulty = "medium"): GameState {
  const state = createGame(1, PACK_LEVEL, difficulty as never);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** Walk the hero to a point and keep steering until `done`. */
function walkUntil(
  state: GameState,
  to: { x: number; y: number },
  done: (s: GameState) => boolean,
  maxSteps = 2000,
): number {
  return run(state, steerTo(to.x, to.y), maxSteps, done);
}

describe("placed packs", () => {
  it("start dormant, spawn nothing, but count toward the foe total", () => {
    const state = startGame(1, PACK_LEVEL);
    expect(state.packs).toHaveLength(2);
    expect(state.packs.every((p) => p.status === "dormant")).toBe(true);
    expect(state.packs.every((p) => p.memberIds.length === 0)).toBe(true);
    // No placed spawns and no waves on this level — the field opens empty.
    expect(state.enemies).toHaveLength(0);
    // Near pack: test_fodder ×3 (scalar, ×1 on medium). Far pack: test_minion
    // {easy:1,hard:4} → 1 on medium (nearest defined rung), test_brute ×2.
    expect(state.packs[0]!.total).toBe(3);
    expect(state.packs[1]!.total).toBe(3);
    expect(state.stats.totalEnemies).toBe(6);
  });

  it("wake when the player nears them, spawning members that give chase", () => {
    const state = startGame(1, PACK_LEVEL);
    const steps = walkUntil(
      state,
      NEAR,
      (s) => s.packs[0]!.status === "active",
    );
    expect(steps).toBeLessThan(2000);

    // The wake fires a packAwoken event with the member count (events survive
    // because `run` stops before stepping again once the condition holds).
    const awoken = state.events.find(
      (e): e is Extract<GameEvent, { type: "packAwoken" }> =>
        e.type === "packAwoken",
    );
    expect(awoken).toBeDefined();
    expect(awoken!.count).toBe(3);

    // Exactly the near pack's three members are on the board, each scattered
    // within the pack's spawn radius of its anchor.
    expect(state.enemies).toHaveLength(3);
    expect(state.packs[0]!.memberIds).toHaveLength(3);
    for (const enemy of state.enemies) {
      expect(distance(enemy.pos, NEAR)).toBeLessThanOrEqual(
        state.packs[0]!.spawnRadius + 0.001,
      );
    }
    // The far pack, across the map, is still asleep.
    expect(state.packs[1]!.status).toBe("dormant");
  });

  it("clear — and emit packCleared — once every member is dead", () => {
    const state = startGame(1, PACK_LEVEL);
    walkUntil(state, NEAR, (s) => s.packs[0]!.status === "active");

    // Simulate the whole cluster dying, then let one step resolve the clear.
    const memberIds = new Set(state.packs[0]!.memberIds);
    state.enemies = state.enemies.filter((e) => !memberIds.has(e.id));
    run(state, idle, 1);

    expect(state.packs[0]!.status).toBe("cleared");
    const cleared = state.events.find(
      (e): e is Extract<GameEvent, { type: "packCleared" }> =>
        e.type === "packCleared",
    );
    expect(cleared).toBeDefined();
    // One pack (the far one) still stands.
    expect(cleared!.remaining).toBe(1);
  });

  it("hold a clearAll objective open while any pack is unreached", () => {
    const state = startGame(1, PACK_LEVEL);
    // The board is empty, yet the level must NOT clear: the dormant packs are
    // unspawned foes. This is the whole point — you can't win standing still.
    run(state, idle, 30);
    expect(state.phase).toBe("playing");
    expect(state.victoryCountdownMs).toBeNull();
  });

  it("clear the level only once every pack is reached and wiped", () => {
    const state = startGame(1, PACK_LEVEL);

    // Wipe the near pack.
    walkUntil(state, NEAR, (s) => s.packs[0]!.status === "active");
    let ids = new Set(state.packs[0]!.memberIds);
    state.enemies = state.enemies.filter((e) => !ids.has(e.id));
    run(state, idle, 1);
    expect(state.victoryCountdownMs).toBeNull(); // far pack still owed

    // Move to the far pack (teleport past the obstacle field — this exercises
    // the objective rule, not pathfinding) and wipe it too.
    state.player.pos = { x: FAR.x - 150, y: FAR.y };
    run(state, idle, 3, (s) => s.packs[1]!.status === "active");
    expect(state.packs[1]!.status).toBe("active");
    expect(state.packs[1]!.memberIds.length).toBeGreaterThan(0);
    ids = new Set(state.packs[1]!.memberIds);
    state.enemies = state.enemies.filter((e) => !ids.has(e.id));

    // With both packs cleared and the board empty, the objective is met.
    run(state, idle, 2, (s) => s.victoryCountdownMs !== null);
    expect(state.packs.every((p) => p.status === "cleared")).toBe(true);
    expect(state.victoryCountdownMs).not.toBeNull();
  });

  it("resolve member counts per difficulty", () => {
    // medium: 3 + (1 + 2) = 6; hard: 3 + (4 + 2) = 9 (the record's `hard: 4`
    // and the ×1.1 scale on the scalar lines).
    expect(packGame("medium").stats.totalEnemies).toBe(6);
    expect(packGame("hard").stats.totalEnemies).toBe(9);
  });

  it("wake deterministically from the same seed", () => {
    const a = startGame(7, PACK_LEVEL);
    const b = startGame(7, PACK_LEVEL);
    walkUntil(a, NEAR, (s) => s.packs[0]!.status === "active");
    walkUntil(b, NEAR, (s) => s.packs[0]!.status === "active");
    const posOf = (s: GameState) =>
      s.enemies.map((e) => ({ defId: e.defId, x: e.pos.x, y: e.pos.y }));
    expect(posOf(a)).toEqual(posOf(b));
  });

  it("do not wake a member kind the enemy roster can still resolve", () => {
    // Sanity: every pack member id resolves to a real def (guards a typo'd
    // roster reference from silently spawning nothing).
    const state = startGame(1, PACK_LEVEL);
    walkUntil(state, NEAR, (s) => s.packs[0]!.status === "active");
    for (const enemy of state.enemies) {
      expect(enemyDef(enemy.defId).role).toBe("minion");
    }
  });
});

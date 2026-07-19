// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Spawn points (spawners.ts): the finite, local horde model. A point sleeps
// until the hero trips its trigger radius, then drips its mob queue out until it
// drains empty; a chained point waits for its predecessor to drain (plus a
// delay) before arming. Exercised on the synthetic `test_spawner_level` fixture.

import { describe, expect, it } from "vitest";

import { createGame, dismissIntro, SPAWNERS } from "@game/core";
import type { Difficulty, GameState } from "@game/core";
import { idle, run, startGame } from "./helpers.ts";

describe("spawn points arm, drip, and drain", () => {
  it("stays dormant until the hero is in range, then emits and drains", () => {
    const state = startGame(1, "test_spawner_level");
    expect(state.spawners).toHaveLength(2);
    // medium mobCountMult is 1, so the queues match the authored counts.
    expect(state.spawners[0]!.total).toBe(6);
    expect(state.spawners[1]!.total).toBe(4);

    // Parked far from the point — it never arms.
    state.player.pos = { x: 2000, y: 260 };
    run(state, idle, 20);
    expect(state.spawners[0]!.status).toBe("dormant");
    expect(state.enemies.some((e) => e.defId === "test_fodder")).toBe(false);

    // Walk onto the point — it arms and starts emitting its fodder.
    state.player.pos = { x: 520, y: 1320 };
    run(state, idle, 6);
    expect(state.spawners[0]!.status).not.toBe("dormant");
    expect(state.spawners[0]!.memberIds.length).toBeGreaterThan(0);

    // Let it drip the rest out — drained, queue empty, all six emitted.
    run(state, idle, 80, (s) => s.spawners[0]!.status === "drained");
    expect(state.spawners[0]!.status).toBe("drained");
    expect(state.spawners[0]!.queue).toHaveLength(0);
    expect(state.spawners[0]!.memberIds).toHaveLength(6);
    expect(state.spawners[0]!.drainedAtMs).not.toBeNull();
  });

  it("holds at the alive cap and refills a kill after the respawn delay", () => {
    const state = startGame(1, "test_spawner_level");
    const s = state.spawners[0]!;
    s.maxAlive = 3; // a small cap against the queue of 6
    // The tiny fixture base floors at SPAWNERS.respawnDelayMin (250ms).
    expect(s.respawnDelayMs).toBe(250);
    // Stand on the point (in trigger range) and let it fill.
    state.player.pos = { x: 520, y: 1320 };
    const aliveMembers = () =>
      state.enemies.filter((e) => s.memberIds.includes(e.id)).length;
    run(state, idle, 60);
    // It stops at the cap — half the queue is still owed, so it never drained.
    expect(aliveMembers()).toBe(3);
    expect(s.status).toBe("active");
    expect(s.queue.length).toBeGreaterThan(0);

    // Free a slot (as a kill would). The point does NOT refill instantly — it
    // holds for the post-kill respawn delay before summoning a replacement.
    const idx = state.enemies.findIndex((e) => s.memberIds.includes(e.id));
    state.enemies.splice(idx, 1);
    run(state, idle, 8); // ~128ms — inside the 250ms delay
    expect(aliveMembers()).toBe(2);

    // Past the delay the replacement is summoned back to the cap.
    run(state, idle, 20); // ~320ms more, comfortably past the delay
    expect(aliveMembers()).toBe(3);
  });

  it("replaces a member that drifts out of the point's zone", () => {
    const state = startGame(1, "test_spawner_level");
    const s = state.spawners[0]!;
    s.maxAlive = 2; // a small cap against the queue of 6
    state.player.pos = { x: 520, y: 1320 }; // on the point, in range
    const localMembers = () =>
      state.enemies.filter(
        (e) =>
          s.memberIds.includes(e.id) &&
          Math.hypot(e.pos.x - s.at.x, e.pos.y - s.at.y) <= s.triggerRadius,
      ).length;
    // Fill to the cap and hold.
    run(state, idle, 40);
    expect(localMembers()).toBe(2);
    const emitted = s.memberIds.length;

    // Drag one member far past the leash — it has "drifted away", the hero left
    // it behind.
    const drifter = state.enemies.find((e) => s.memberIds.includes(e.id))!;
    drifter.pos = { x: s.at.x + 5000, y: s.at.y };
    // The point sees a free slot and (past the respawn delay) summons a
    // replacement back to the cap.
    run(state, idle, 30);
    expect(localMembers()).toBe(2);
    expect(s.memberIds.length).toBeGreaterThan(emitted);
  });

  it("stops emitting while the hero is outside trigger range", () => {
    const state = startGame(1, "test_spawner_level");
    const s = state.spawners[0]!;
    // Arm it and let the first batch boil up.
    state.player.pos = { x: 520, y: 1320 };
    run(state, idle, 4, (st) => st.spawners[0]!.memberIds.length > 0);
    expect(s.status).toBe("active");
    const emitted = s.memberIds.length;
    expect(emitted).toBeGreaterThan(0);
    expect(s.queue.length).toBeGreaterThan(0);

    // Walk out of trigger range — emission pauses, the queue holds.
    state.player.pos = { x: 2000, y: 260 };
    run(state, idle, 40);
    expect(s.memberIds.length).toBe(emitted);
    expect(s.status).toBe("active");

    // Return — it drips again, no banked catch-up burst.
    state.player.pos = { x: 520, y: 1320 };
    run(state, idle, 40);
    expect(s.memberIds.length).toBeGreaterThan(emitted);
  });

  it("a chained point waits for its predecessor to drain plus the delay", () => {
    const state = startGame(1, "test_spawner_level");
    // Sit between both points so range never gates — only the chain does.
    state.player.pos = { x: 540, y: 1320 };
    run(state, idle, 60, (s) => s.spawners[0]!.status === "drained");
    expect(state.spawners[0]!.status).toBe("drained");
    // The moment s1 drains, s2 is still dormant — its 500ms delay hasn't run.
    expect(state.spawners[1]!.status).toBe("dormant");

    // Past the delay it arms and emits its minions.
    run(state, idle, 80, (s) => s.spawners[1]!.status !== "dormant");
    expect(state.spawners[1]!.status).not.toBe("dormant");
    expect(state.enemies.some((e) => e.defId === "test_minion")).toBe(true);
  });
});

describe("only the closest N points light at once (activeSpawnerCap)", () => {
  // Four independent points strung along one open row at rising distance from
  // the {340,1320} player spawn (near 100 → farthest 700). Each holds a long
  // queue behind a small alive cap, so an armed point STAYS active while the
  // hero idles — the cap and the closest-first pick are observable.
  const startCap = (difficulty: Difficulty): GameState => {
    const state = createGame(1, "test_spawner_cap_level", difficulty);
    dismissIntro(state);
    return state;
  };
  const byId = (state: GameState, id: string) =>
    state.spawners.find((s) => s.id === id)!;
  const activeCount = (state: GameState) =>
    state.spawners.filter((s) => s.status === "active").length;

  it("arms only the two CLOSEST points on easy (cap 2), rest stay dormant", () => {
    const state = startCap("easy");
    run(state, idle, 4);
    // The two nearest lit; the two farther points wait their turn.
    expect(byId(state, "near").status).toBe("active");
    expect(byId(state, "mid").status).toBe("active");
    expect(byId(state, "far").status).toBe("dormant");
    expect(byId(state, "farthest").status).toBe("dormant");
    expect(activeCount(state)).toBe(2);
  });

  it("lifts the cap up the ladder (medium 3, nightmare 5)", () => {
    const medium = startCap("medium");
    run(medium, idle, 4);
    expect(activeCount(medium)).toBe(3);
    expect(byId(medium, "farthest").status).toBe("dormant");

    // NIGHTMARE's cap (5) exceeds the four points here — so every one arms.
    const nightmare = startCap("nightmare");
    run(nightmare, idle, 4);
    expect(activeCount(nightmare)).toBe(4);
    expect(nightmare.spawners.every((s) => s.status === "active")).toBe(true);
  });

  it("is UNCAPPED on jesus — every point in range arms at once", () => {
    const state = startCap("jesus");
    run(state, idle, 4);
    expect(state.spawners.every((s) => s.status === "active")).toBe(true);
  });

  it("frees a slot for the next-closest point when an active wave drains", () => {
    const state = startCap("easy");
    run(state, idle, 4);
    expect(byId(state, "far").status).toBe("dormant");

    // The nearest wave finishes — its slot opens for the next-closest point.
    const near = byId(state, "near");
    near.status = "drained";
    near.drainedAtMs = state.stats.timeMs;
    near.queue = [];
    run(state, idle, 3);
    // `far` (next closest) arms; `farthest` still waits behind the cap.
    expect(byId(state, "far").status).toBe("active");
    expect(byId(state, "farthest").status).toBe("dormant");
    expect(activeCount(state)).toBe(2);
  });

  it("never arms a point across a wall — line of sight gates the pick too", () => {
    const state = startCap("easy");
    // Drop a tall wall on the row between the hero and every point — no sight,
    // so none arm even though two are the closest and the cap has room.
    state.obstacles = [
      {
        id: 8100,
        kind: "boulder",
        sprite: "boulder",
        pos: { x: 390, y: 1320 },
        radius: 30,
        jumpable: false,
      },
    ];
    run(state, idle, 4);
    expect(state.spawners.every((s) => s.status === "dormant")).toBe(true);

    // Clear the wall — the two closest points come into view and light.
    state.obstacles = [];
    run(state, idle, 4);
    expect(byId(state, "near").status).toBe("active");
    expect(byId(state, "mid").status).toBe("active");
    expect(activeCount(state)).toBe(2);
  });
});

describe("summoned mobs appear off-screen and run in to the approach circle", () => {
  it("summons OUTSIDE the circle, then sheds the run-in marker on crossing it", () => {
    const state = startGame(1, "test_spawner_level");
    const s = state.spawners[0]!;
    // Stand on the point so it arms and summons at once.
    state.player.pos = { x: 520, y: 1320 };
    run(state, idle, 6, (st) => st.spawners[0]!.memberIds.length > 0);
    const summoned = state.enemies.find((e) => s.memberIds.includes(e.id))!;
    expect(summoned).toBeDefined();
    // Headless (no camera) uses the fallback approach radius, and the mob is
    // placed OFF-SCREEN — beyond that circle — carrying the run-in marker.
    expect(summoned.approachRadius).toBe(SPAWNERS.approachRadiusFallback);
    const startDist = Math.hypot(
      summoned.pos.x - state.player.pos.x,
      summoned.pos.y - state.player.pos.y,
    );
    expect(startDist).toBeGreaterThan(SPAWNERS.approachRadiusFallback);

    // Hold still — a summoned mob sprints in and, on crossing the circle, drops
    // the marker and joins the fight at its own pace.
    run(state, idle, 400, (st) =>
      st.enemies.some(
        (e) => s.memberIds.includes(e.id) && e.approachRadius === undefined,
      ),
    );
    const arrived = state.enemies.find(
      (e) => s.memberIds.includes(e.id) && e.approachRadius === undefined,
    );
    expect(arrived).toBeDefined();
    const dist = Math.hypot(
      arrived!.pos.x - state.player.pos.x,
      arrived!.pos.y - state.player.pos.y,
    );
    expect(dist).toBeLessThanOrEqual(SPAWNERS.approachRadiusFallback + 1);
  });
});

describe("post-kill respawn delay scales down with difficulty, boss, and map", () => {
  const near = (state: GameState) =>
    state.spawners.find((s) => s.id === "near")!.respawnDelayMs;

  it("is shorter on harder rungs (easy → jesus)", () => {
    const delays = (
      ["easy", "medium", "hard", "nightmare", "jesus"] as const
    ).map((d) => {
      const state = createGame(1, "test_spawner_cap_level", d);
      dismissIntro(state);
      return near(state);
    });
    // Strictly decreasing down the ladder — every rung refills faster.
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeLessThan(delays[i - 1]!);
    }
  });

  it("is shorter for points nearer the level's boss", () => {
    // The four points rise in x (440 → 1040) toward the boss at {2130,260}, so
    // each is closer to it than the last — its respawn delay shrinks in step.
    const state = createGame(1, "test_spawner_cap_level", "medium");
    dismissIntro(state);
    const byX = [...state.spawners].sort((a, b) => a.at.x - b.at.x);
    for (let i = 1; i < byX.length; i++) {
      expect(byX[i]!.respawnDelayMs).toBeLessThan(byX[i - 1]!.respawnDelayMs);
    }
  });

  it("is shorter deeper into the campaign (later maps refill faster)", () => {
    // Two bossless points with the SAME base — only the campaign-progress factor
    // differs (first map vs last), so the later map's delay is strictly shorter.
    const early = createGame(1, "test_spawner_early_level", "medium");
    dismissIntro(early);
    const late = createGame(1, "test_spawner_late_level", "medium");
    dismissIntro(late);
    expect(late.spawners[0]!.respawnDelayMs).toBeLessThan(
      early.spawners[0]!.respawnDelayMs,
    );
    // The exact factors: base 1000 × medium (1.0) × no-boss (1.0) × map.
    expect(early.spawners[0]!.respawnDelayMs).toBe(1000);
    expect(late.spawners[0]!.respawnDelayMs).toBe(600);
  });
});

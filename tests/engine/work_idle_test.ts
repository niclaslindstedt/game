// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DORMANT "AT WORK" stroll (`EnemyDef.ai.idle === "work"`, config
// ENEMY_AI.work, src/game/working.ts): a dormant mob potters around its home
// — walk a short leg, stand a beat, walk again — instead of standing frozen,
// while waking (aggro + line of sight, wounds) and the woken chase stay
// exactly as before. Runs on the synthetic `test_worker` fixture.

import { describe, expect, it } from "vitest";

import { ENEMY_AI, step } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

import { distance as dist } from "@game/lib/vec.ts";

/** A worker parked `dx` east of the player, live at its def speed. */
function placeWorker(state: ReturnType<typeof startGame>, dx: number) {
  const worker = makeEnemy(
    {
      pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
      speed: 16,
      hp: 1_000_000, // survives ambient fire for the whole probe
      maxHp: 1_000_000,
    },
    "test_worker",
  );
  state.enemies.push(worker);
  return worker;
}

describe("the dormant at-work stroll", () => {
  it("potters around its post: it moves, pauses, and never leaves its patch", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    // Far outside the 300 aggro: dormant the whole probe.
    const worker = placeWorker(state, 700);
    const post = { ...worker.home };

    let maxFromHome = 0;
    let stillStreak = 0;
    let longestStill = 0;
    let prev = { ...worker.pos };
    for (let i = 0; i < 600; i++) {
      step(state, idle, DT);
      maxFromHome = Math.max(maxFromHome, dist(worker.pos, post));
      if (dist(worker.pos, prev) < 1e-9) {
        stillStreak++;
        longestStill = Math.max(longestStill, stillStreak);
      } else {
        stillStreak = 0;
      }
      prev = { ...worker.pos };
    }
    expect(worker.awake).toBeFalsy();
    // It actually walks its patch…
    expect(maxFromHome).toBeGreaterThan(8);
    // …but never wanders past a stroll leg's reach…
    expect(maxFromHome).toBeLessThanOrEqual(ENEMY_AI.work.range[1] + 1);
    // …and stands a real beat between legs ("working" at the bench).
    expect(longestStill * DT).toBeGreaterThanOrEqual(ENEMY_AI.work.idleMs[0]);
  });

  it("draws its own rng stream — the run's shared stream is untouched", () => {
    // Two identical runs, one with a dormant stroller on the field: the
    // hero-side simulation (which draws the shared stream) must be
    // byte-identical, or the stroll would desync everything staged after it.
    const a = startGame();
    clearStage(a);
    a.obstacles = [];
    const b = startGame();
    clearStage(b);
    b.obstacles = [];
    placeWorker(b, 700);
    run(a, idle, 200);
    run(b, idle, 200);
    expect(b.player.pos).toEqual(a.player.pos);
  });

  it("wakes and hunts at full pace once the player is in range and sight", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    const worker = placeWorker(state, 250); // inside the 300 aggro
    const before = dist(worker.pos, state.player.pos);

    run(state, idle, 60);
    expect(worker.awake).toBe(true);
    // A real chase, not the stroll's shuffle: closing far faster than the
    // work pace could cover in the same window.
    const closed = before - dist(worker.pos, state.player.pos);
    const strollReach = 16 * ENEMY_AI.work.speedFactor * ((60 * DT) / 1000) + 1;
    expect(closed).toBeGreaterThan(strollReach);
  });

  it("drops the chase and goes back to work when the player escapes", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    const worker = placeWorker(state, 250);
    run(state, idle, 120);
    expect(worker.awake).toBe(true);

    // Teleport out of range: the latch releases and the stroll resumes,
    // anchored to HOME — the worker drifts back to its patch.
    state.player.pos = { x: worker.pos.x + 1200, y: worker.pos.y };
    run(state, idle, 1500);
    expect(worker.awake).toBeFalsy();
    expect(dist(worker.pos, worker.home)).toBeLessThanOrEqual(
      ENEMY_AI.work.range[1] + 1,
    );
  });

  it("a mob without the idle flag still stands frozen at its post", () => {
    const state = startGame();
    clearStage(state);
    state.obstacles = [];
    const mob = makeEnemy(
      {
        pos: { x: state.player.pos.x + 1200, y: state.player.pos.y },
        speed: 26,
        hp: 1_000_000,
        maxHp: 1_000_000,
      },
      "test_stalker", // no ai.idle — the pre-stroll default
    );
    state.enemies.push(mob);
    const post = { ...mob.pos };

    run(state, idle, 100);
    expect(mob.pos).toEqual(post);
  });
});

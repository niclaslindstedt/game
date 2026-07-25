// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HELLGATES (config HELLGATES, spawners.ts + loot.ts): the rampage-only spawn
// points and the HELLBORN they let through. Four rules under test —
//   1. GATING: shut below `openStage` however close the hero stands, gated to
//      NIGHTMARE and up by the level, with the second member line gated again
//      to JESUS.
//   2. ESCALATION: every stage past the threshold widens the alive cap, thickens
//      the batch, and shortens both the interval and the post-kill refill —
//      bounded, and bounded again across all gates by `globalMaxAlive`.
//   3. ENDLESSNESS: a gate re-queues instead of draining while the meter holds,
//      and falls back to dormant (not drained) once it cools.
//   4. REWARD: a hellborn kill is exempt from the evolution tier penalty and its
//      drop rolls climb with the rampage — the farm the gates exist to be.
// Exercised on the synthetic `test_hellgate_level` fixture.

import { describe, expect, it } from "vitest";

import { createGame, dismissIntro, HELLGATES, MENACE, step } from "@game/core";
import type { GameEvent, GameState } from "@game/core";
import { createRng } from "@game/lib/rng.ts";

import { hitEnemy } from "../../src/game/loot.ts";

import { DT, idle, makeEnemy, run } from "./helpers.ts";

/** A nightmare (or JESUS) run on the hellgate fixture, hero parked on the gate
 * so range and line of sight are never the reason it does or doesn't arm. */
function hellgateRun(difficulty = "nightmare"): GameState {
  const state = createGame(7, "test_hellgate_level", difficulty);
  dismissIntro(state);
  state.player.pos = { x: 560, y: 1320 };
  return state;
}

/** Put the meter at `stage` outright — the tests are about what the gates do at
 * a rampage depth, not about earning one. The floor is raised with it so decay
 * can't quietly walk the stage back mid-run. */
function setStage(state: GameState, stage: number): void {
  state.menace = stage * MENACE.perStage;
  state.menaceFloor = state.menace;
}

const gateOf = (state: GameState) =>
  state.spawners.find((s) => s.id === "gate")!;

/** Step `steps` ticks, accumulating every event as it goes — `state.events` is
 * drained each tick, so a one-shot beat has to be caught as it passes. `each`
 * runs after every tick (the suites use it to sweep the board and re-pin the
 * meter so a long run isn't throttled by the alive cap or by decay). */
function collect(
  state: GameState,
  steps: number,
  each?: () => void,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < steps; i++) {
    step(state, idle, DT);
    events.push(...state.events);
    each?.();
  }
  return events;
}

describe("hellgates stay shut until the rampage opens them", () => {
  it("is invisible below its openStage however close the hero stands", () => {
    const state = hellgateRun();
    const gate = gateOf(state);
    expect(gate.openStage).toBe(HELLGATES.openStage);

    run(state, idle, 120);
    expect(gateOf(state).status).toBe("dormant");
    expect(state.enemies.some((e) => e.defId === "test_hellborn")).toBe(false);

    // The ordinary point beside it armed on the same approach — the gate is
    // held back by the METER, not by anything about where the hero is standing.
    expect(state.spawners.find((s) => s.id === "ordinary")!.status).not.toBe(
      "dormant",
    );
  });

  it("tears open once the meter reaches openStage, and says so", () => {
    const state = hellgateRun();
    setStage(state, HELLGATES.openStage);
    const opened = collect(state, 10, () =>
      setStage(state, HELLGATES.openStage),
    ).filter((e) => e.type === "hellgateOpened");

    expect(gateOf(state).status).toBe("active");
    expect(opened.length).toBeGreaterThan(0);
    expect(opened[0]).toMatchObject({ stage: HELLGATES.openStage });

    run(state, idle, 40);
    expect(state.enemies.some((e) => e.defId === "test_hellborn")).toBe(true);
  });

  it("does not exist at all below the level's difficulty gate", () => {
    // The fixture gate is authored `minDifficulty: nightmare`, so a medium run
    // never even builds one — the whole system is top-two-rungs content.
    const state = createGame(7, "test_hellgate_level", "medium");
    dismissIntro(state);
    expect(state.spawners.some((s) => (s.openStage ?? 0) > 0)).toBe(false);
  });

  it("fields the JESUS-only member line only on JESUS", () => {
    const nightmare = hellgateRun("nightmare");
    expect(gateOf(nightmare).refill).not.toContain("test_hellborn_worse");
    expect(gateOf(nightmare).refill).toContain("test_hellborn");

    const jesus = hellgateRun("jesus");
    expect(gateOf(jesus).refill).toContain("test_hellborn_worse");
    expect(gateOf(jesus).refill).toContain("test_hellborn");
  });
});

describe("hellgates escalate with the rampage", () => {
  it("widens the cap, thickens the batch, and tightens the cadence", () => {
    const shallow = hellgateRun();
    setStage(shallow, HELLGATES.openStage);
    run(shallow, idle, 10);
    const low = { ...gateOf(shallow) };

    const deep = hellgateRun();
    setStage(deep, HELLGATES.openStage + 40);
    run(deep, idle, 10);
    const high = gateOf(deep);

    expect(high.maxAlive).toBeGreaterThan(low.maxAlive);
    expect(high.perEmit).toBeGreaterThan(low.perEmit);
    expect(high.intervalMs).toBeLessThan(low.intervalMs);
    expect(high.respawnDelayMs).toBeLessThan(low.respawnDelayMs);
  });

  it("saturates rather than diverging at an absurd rampage", () => {
    const state = hellgateRun("jesus"); // uncapped rung — the meter has no roof
    setStage(state, 400);
    run(state, idle, 10);
    const gate = gateOf(state);
    expect(gate.maxAlive).toBeLessThanOrEqual(HELLGATES.maxAliveCap);
    expect(gate.perEmit).toBeLessThanOrEqual(HELLGATES.perEmitCap);
    expect(gate.intervalMs).toBeGreaterThanOrEqual(HELLGATES.intervalMinMs);
    expect(gate.respawnDelayMs).toBeGreaterThanOrEqual(
      HELLGATES.respawnDelayMinMs,
    );
  });

  it("holds every gate together under the global hellborn ceiling", () => {
    const state = hellgateRun("jesus");
    setStage(state, 200);
    run(state, idle, 900);
    const hellborn = state.enemies.filter(
      (e) => e.defId === "test_hellborn" || e.defId === "test_hellborn_worse",
    );
    expect(hellborn.length).toBeLessThanOrEqual(HELLGATES.globalMaxAlive);
  });
});

describe("a hellgate is never finished", () => {
  it("re-queues instead of draining while the rampage holds", () => {
    const state = hellgateRun();
    setStage(state, HELLGATES.openStage);
    // Long enough that a finite point of this size drains several times over at
    // its emission cadence. Sweeping every arrival off the board each tick keeps
    // the alive cap from throttling it, and re-pinning the stage keeps decay out.
    collect(state, 1600, () => {
      state.enemies = state.enemies.filter(
        (e) => e.defId !== "test_hellborn" && e.defId !== "test_hellborn_worse",
      );
      setStage(state, HELLGATES.openStage);
    });
    const gate = gateOf(state);
    expect(gate.status).toBe("active");
    expect(gate.queue.length).toBeGreaterThan(0);
    expect(gate.memberIds.length).toBeGreaterThan(gate.total);
  });

  it("shuts back to dormant — not drained — when the meter cools", () => {
    const state = hellgateRun();
    setStage(state, HELLGATES.openStage);
    run(state, idle, 20);
    expect(gateOf(state).status).toBe("active");

    setStage(state, 0);
    run(state, idle, 5);
    const gate = gateOf(state);
    expect(gate.status).toBe("dormant");
    expect(gate.queue.length).toBe(gate.refill!.length);

    // …and it opens again the next time the hero gets ugly.
    setStage(state, HELLGATES.openStage);
    run(state, idle, 10);
    expect(gateOf(state).status).toBe("active");
  });
});

describe("a hellborn kill is the farm a rampage buys", () => {
  /** Kill `count` mobs of `defId` at rampage `stage` and count the equipment
   * that fell. Every farm runs on the SAME seeded stream, so the comparisons
   * below isolate the one variable each names — the assertions are about how
   * the drop band MOVES, not about any single roll. */
  function farm(defId: string, stage: number, count: number): number {
    const state = hellgateRun();
    setStage(state, stage);
    state.rng = createRng(99);
    let dropped = 0;
    for (let i = 0; i < count; i++) {
      // Stamp the evolution the rampage would have baked in at spawn — the
      // whole point is that a hellborn is exempt from the penalty it carries.
      const enemy = makeEnemy(
        { pos: { x: 700, y: 1320 }, evo: stage, mlvl: 40, powerScaled: true },
        defId,
      );
      state.enemies = [enemy];
      state.items = [];
      // A clean, non-overkill killing blow: exactly the healthbar, so the
      // overkill toll never confounds the comparison.
      hitEnemy(state, enemy, enemy.hp);
      dropped += state.items.filter((it) => it.kind === "equipment").length;
    }
    return dropped;
  }

  it("pays more the deeper the rampage runs", () => {
    const shallow = farm("test_hellborn", HELLGATES.openStage, 300);
    const deep = farm("test_hellborn", HELLGATES.openStage + 20, 300);
    expect(deep).toBeGreaterThan(shallow);
  });

  it("beats the ordinary horde, which the same rampage makes POORER", () => {
    const stage = HELLGATES.openStage + 20;
    // Same kill count, same rampage, same rng sweep — the only difference is
    // which side of the evolution rule the mob sits on.
    expect(farm("test_hellborn", stage, 300)).toBeGreaterThan(
      farm("test_minion", stage, 300),
    );
  });
});

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Spawn points (spawners.ts): the finite, local horde model. A point sleeps
// until the hero trips its trigger radius, then drips its mob queue out until it
// drains empty; a chained point waits for its predecessor to drain (plus a
// delay) before arming. Exercised on the synthetic `test_spawner_level` fixture.

import { describe, expect, it } from "vitest";

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

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

  it("holds at the alive cap and drips only to replace kills", () => {
    const state = startGame(1, "test_spawner_level");
    const s = state.spawners[0]!;
    s.maxAlive = 3; // a small cap against the queue of 6
    // Stand on the point (in trigger range) and let it fill.
    state.player.pos = { x: 520, y: 1320 };
    const aliveMembers = () =>
      state.enemies.filter((e) => s.memberIds.includes(e.id)).length;
    run(state, idle, 60);
    // It stops at the cap — half the queue is still owed, so it never drained.
    expect(aliveMembers()).toBe(3);
    expect(s.status).toBe("active");
    expect(s.queue.length).toBeGreaterThan(0);

    // Free a slot (as a kill would) — the point drips a replacement back to cap.
    const idx = state.enemies.findIndex((e) => s.memberIds.includes(e.id));
    state.enemies.splice(idx, 1);
    run(state, idle, 20);
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

    // Drag one member far past the point's trigger zone — it has "drifted away".
    const drifter = state.enemies.find((e) => s.memberIds.includes(e.id))!;
    drifter.pos = { x: s.at.x + 5000, y: s.at.y };
    // The point sees a free LOCAL slot and drips a replacement back to the cap.
    run(state, idle, 20);
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

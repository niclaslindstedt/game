// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PATROL ROUTES (`SpawnSpec.patrol` → `Enemy.patrol`, `stepPatrol` in
// working.ts) and ALARM LINKS (`SpawnSpec.alarms` → `raiseAlarm` in
// spawners.ts): a pinned mob WALKS its authored beat while dormant, WoW-style,
// and a linked sentry that WAKES activates its spawn point from anywhere —
// which pours reinforcements at the hero for `SPAWNERS.alarmWindowMs`, then
// falls back asleep if he never showed up. Runs on the `test_alarm_level`
// fixture: open floor, one patrolling `test_worker` sentry near the spawn
// wired to a point far outside its own trigger circle.

import { describe, expect, it } from "vitest";

import { SPAWNERS, step } from "@game/core";
import type { Enemy, GameState } from "@game/core";
import { DT, idle, run, startGame } from "./helpers.ts";

/** The pinned sentry (the only patroller on the fixture level). */
function sentry(state: GameState): Enemy {
  const found = state.enemies.find((e) => e.patrol !== undefined);
  expect(found).toBeDefined();
  return found!;
}

const farPoint = (state: GameState) =>
  state.spawners.find((s) => s.id === "far")!;

describe("patrol routes", () => {
  it("walks its beat while dormant: along the route, never waking", () => {
    const state = startGame(42, "test_alarm_level");
    const walker = sentry(state);
    const startY = walker.pos.y;

    run(state, idle, 600);
    expect(walker.awake).toBeFalsy();
    // Outbound down the authored x=700 line: real ground covered, no drift.
    expect(walker.pos.y).toBeGreaterThan(startY + 30);
    expect(Math.abs(walker.pos.x - 700)).toBeLessThan(8);
  });

  it("turns around at the route's end (ping-pong)", () => {
    const state = startGame(42, "test_alarm_level");
    const walker = sentry(state);
    // Park it a hair short of the far waypoint (700, 1500).
    walker.pos = { x: 700, y: 1498 };

    run(state, idle, 50);
    expect(walker.patrolDir).toBe(-1);
    const turned = walker.pos.y;
    run(state, idle, 200);
    expect(walker.pos.y).toBeLessThan(turned); // walking back up the beat
  });
});

describe("alarm links", () => {
  /** Walk the hero up to the sentry so it wakes this tick. */
  function trip(state: GameState): void {
    const walker = sentry(state);
    state.player.pos = { x: walker.pos.x, y: walker.pos.y - 150 };
    // The probe watches spawner behavior, not survival: the answering squad
    // will chew on the idle hero for the whole window.
    state.player.maxHp = 100_000;
    state.player.hp = 100_000;
    step(state, idle, DT);
    expect(walker.awake).toBe(true);
  }

  it("a waking sentry activates its far-off point and books the event", () => {
    const state = startGame(42, "test_alarm_level");
    expect(farPoint(state).status).toBe("dormant");

    trip(state);
    // The point sits ~1300 px away — far outside its 300 trigger — yet the
    // alarm arms it on the spot, with the window open and the beat booked.
    const point = farPoint(state);
    expect(point.status).toBe("active");
    expect(point.alarmedUntilMs).not.toBeNull();
    expect(state.events.some((e) => e.type === "spawnerAlarmed")).toBe(true);
    // One-shot: the link is spent.
    expect(sentry(state).alarms).toBeUndefined();
  });

  it("pours an answering squad at the hero while the window rings", () => {
    const state = startGame(42, "test_alarm_level");
    trip(state);
    const before = state.enemies.length;

    run(state, idle, 60); // ~1s of the window
    const summoned = state.enemies.filter((e) =>
      farPoint(state).memberIds.includes(e.id),
    );
    expect(state.enemies.length).toBeGreaterThan(before);
    // Summon-in semantics: the squad arrives off-screen and RUNS IN (it was
    // stamped an approach circle), up to the point's alive cap.
    expect(summoned.length).toBeGreaterThan(0);
    expect(summoned.length).toBeLessThanOrEqual(6);
  });

  it("falls back asleep when the window lapses and the hero never came", () => {
    const state = startGame(42, "test_alarm_level");
    trip(state);
    expect(farPoint(state).status).toBe("active");

    // Idle out the whole window (hero still ~1300 px from the point).
    run(state, idle, Math.ceil(SPAWNERS.alarmWindowMs / DT) + 10);
    const point = farPoint(state);
    expect(point.status).toBe("dormant");
    expect(point.alarmedUntilMs).toBeNull();
    // The un-poured remainder is still owed — the bay was not emptied by the
    // alarm, only its answering squad.
    expect(point.queue.length).toBeGreaterThan(0);
  });
});

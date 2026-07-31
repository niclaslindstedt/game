// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOCKED DOORS — a chain of solid `door_locked` circles that stands until the
// hero carries the story item whose `unlocks` names it through, then vanishes
// and books a `doorOpened`.
//
// It runs against a FIXTURE level (`test_door_level`), and that is deliberate:
// the shipped campaign carves its geometry per run (see `game/mapgen/`) and a
// carve emits no doors, so a suite written against a shipped map would be a
// suite testing nothing. The engine rule is real and this is what holds it.

import { describe, expect, it } from "vitest";

import { enemyDef, step } from "@game/core";

import { DT, idle, startGame, stopWaves } from "./helpers.ts";

/** A quiet run on the door fixture: no waves, nothing on the field but the
 * parked boss, so the doors are the only thing that can move. */
function doorRun() {
  const state = startGame(42, "test_door_level");
  stopWaves(state);
  state.enemies = state.enemies.filter(
    (e) => enemyDef(e.defId).role === "boss",
  );
  return state;
}

describe("locked doors", () => {
  it("stays shut without the key, opens for its key, and only its own", () => {
    const state = doorRun();
    const door = state.doors.find((d) => d.id === "test_door")!;
    const vault = state.doors.find((d) => d.id === "test_vault")!;

    // Stand at the door empty-handed: nothing moves.
    state.players[0].pos = { x: door.center.x, y: door.center.y + 34 };
    step(state, idle, DT);
    expect(door.open).toBe(false);

    // Bring the key: the chain vanishes and the event fires.
    state.storyItems.push("test_key");
    step(state, idle, DT);
    expect(door.open).toBe(true);
    expect(state.obstacles.some((o) => door.obstacleIds.includes(o.id))).toBe(
      false,
    );
    expect(state.events).toContainEqual({
      type: "doorOpened",
      pos: { ...door.center },
    });

    // The other door doesn't care about this key.
    state.players[0].pos = { x: vault.center.x, y: vault.center.y - 34 };
    step(state, idle, DT);
    expect(vault.open).toBe(false);
    expect(
      state.obstacles.filter((o) => o.kind === "door_locked").length,
    ).toBeGreaterThan(0);

    // …and it opens for its OWN key.
    state.storyItems.push("test_key_2");
    step(state, idle, DT);
    expect(vault.open).toBe(true);
  });

  it("builds every door as a solid, unjumpable chain", () => {
    const state = doorRun();
    expect(state.doors).toHaveLength(2);
    for (const door of state.doors) {
      const chain = state.obstacles.filter((o) =>
        door.obstacleIds.includes(o.id),
      );
      expect(chain.length).toBeGreaterThan(0);
      for (const link of chain) {
        expect(link.kind).toBe("door_locked");
        expect(link.jumpable).toBe(false);
      }
    }
  });
});

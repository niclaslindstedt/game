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
    expect(state.doors).toHaveLength(3);
    for (const door of state.doors) {
      const chain = state.obstacles.filter((o) =>
        door.obstacleIds.includes(o.id),
      );
      expect(chain.length).toBeGreaterThan(0);
      for (const link of chain) {
        expect(link.jumpable).toBe(false);
      }
    }
  });
});

// AN INTERIOR DOOR is the one a building is made of: no key, no roll-up, and it
// opens for whoever walks up to it — which has to include the staff, or a floor
// cut into rooms is a floor with the night shift shut in the rooms.
describe("interior doors", () => {
  const officeDoor = (state: ReturnType<typeof doorRun>) =>
    state.doors.find((d) => d.id === "test_office_door")!;

  it("opens for a hero with no key at all, and leaves its leaves standing", () => {
    const state = doorRun();
    const door = officeDoor(state);
    const leaves = () =>
      state.decor.filter((d) => d.sprite === "test_office_door_open");
    expect(leaves()).toHaveLength(0);

    state.players[0].pos = { x: door.center.x, y: door.center.y + 30 };
    step(state, idle, DT);
    expect(door.open).toBe(true);
    // The plain slide, NOT the garage's roll-up: `approach` says who opens it,
    // `rollUp` says how, and only the second picks that animation and sound.
    expect(state.events).toContainEqual({
      type: "doorOpened",
      pos: { ...door.center },
    });
    expect(state.events.some((e) => e.type === "garageDoorOpened")).toBe(false);
    // The leaves are drawn where the chain's two ends stood, and they are
    // SCENERY — a door you cannot walk through is not open.
    expect(leaves()).toHaveLength(2);
    expect(state.obstacles.some((o) => door.obstacleIds.includes(o.id))).toBe(
      false,
    );
  });

  it("opens for the staff, who have badges", () => {
    const state = doorRun();
    const door = officeDoor(state);
    state.players[0].pos = { x: 200, y: 200 };
    const minion = state.enemies[0];
    expect(minion).toBeDefined();
    minion!.pos = { x: door.center.x, y: door.center.y - 24 };
    step(state, idle, DT);
    expect(door.open).toBe(true);
  });
});

// A KEYED door answers to the CARD, and the card is on a body — so the mob
// carrying it walks through its own door, and the mob that is not does not.
// Deriving the pass from what the mob drops rather than from a list of its own
// is what keeps those two facts from drifting apart.
describe("a keyed door and the mob carrying its card", () => {
  it("opens for the carrier, and stays shut for everybody else", () => {
    const state = doorRun();
    const door = state.doors.find((d) => d.id === "test_door")!;
    state.players[0].pos = { x: 200, y: 200 };

    // An ordinary minion has no card: it can stand in the doorway all night.
    const minion = state.enemies[0]!;
    minion.pos = { x: door.center.x, y: door.center.y - 20 };
    step(state, idle, DT);
    expect(door.open).toBe(false);

    // The fixture elite carries `test_key`, whose `unlocks` names this door.
    minion.defId = "test_spareable";
    step(state, idle, DT);
    expect(door.open).toBe(true);
  });
});

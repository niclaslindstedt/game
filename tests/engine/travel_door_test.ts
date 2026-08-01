// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A STANDING DOOR WITH NOWHERE TO GO SAYS SO. The hub's travel doors are the
// level select (`LevelDef.travelDoors`), and until one of a door's roads opens
// there is nothing for a picker to pick: the garage's rocket is one part short
// of flying, and listing THE MOON and MARS greyed out would name two chapters
// to answer a question the hero can answer himself. `unready:` is that answer,
// and `tapTravelDoor` is the engine's half of it — the line, plus the reach
// test that keeps a session client from putting a scene on the whole party's
// screen from across the map. WHICH roads are open is campaign progress on the
// CHARACTER and stays the app's (see GameScreen); the shipped garage's own
// wiring is tests/content/garage_test.ts.

import { afterEach, describe, expect, it } from "vitest";

import {
  advanceDialogue,
  applyRunCommand,
  CAP_THOUGHT_IDS,
  MERCHANT,
  registerDefs,
  THOUGHT_DEFS,
  type GameState,
} from "@game/core";

import { FIX_HUB_LEVEL, installFixtures } from "./fixtures.ts";
import { startGame } from "./helpers.ts";

const LINE = ["STILL ONE PART SHORT."];

/** The synthetic twin of the garage's rocket: a hub door whose roads are all
 * still shut, carrying the line the hero says when he tries it anyway. */
const DOOR_ID = "test_hub_door";

function installUnreadyDoor(): void {
  registerDefs({
    thoughts: {
      test_door_unready: {
        id: "test_door_unready",
        speaker: "ME",
        portrait: "player",
        pages: [LINE],
      },
    },
    capThoughts: [],
    levels: {
      ...{ test_hub_level: FIX_HUB_LEVEL },
      test_unready_hub: {
        ...FIX_HUB_LEVEL,
        id: "test_unready_hub",
        travelDoors: (FIX_HUB_LEVEL.travelDoors ?? []).map((door) =>
          door.id === DOOR_ID
            ? { ...door, unready: "test_door_unready" }
            : door,
        ),
      },
    },
  });
}

/** Tap the open scene closed, page by page (a helper rather than an inline
 * loop so the caller's `state.dialogue` narrowing survives). */
function tapThrough(state: GameState): void {
  while (state.dialogue) advanceDialogue(state);
}

/** Stand the hero on the door's own landmark, where the app's tap test says a
 * door may be reached at all. */
function standAtDoor(state: GameState): void {
  const mark = state.landmarks.find((l) => l.kind === DOOR_ID)!;
  state.players[0].pos = { ...mark.pos };
}

describe("tapping a travel door with no open road", () => {
  afterEach(() => {
    registerDefs({ thoughts: THOUGHT_DEFS, capThoughts: CAP_THOUGHT_IDS });
    installFixtures(true);
  });

  it("plays the door's own line instead of a picker", () => {
    installUnreadyDoor();
    const state = startGame(42, "test_unready_hub");
    standAtDoor(state);

    expect(applyRunCommand(state, "tapTravelDoor", [DOOR_ID])).toBe(true);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "test_door_unready",
    });
  });

  it("replays — it answers a tap, so it never banks to thoughtsSeen", () => {
    installUnreadyDoor();
    const state = startGame(42, "test_unready_hub");
    standAtDoor(state);

    applyRunCommand(state, "tapTravelDoor", [DOOR_ID]);
    expect(state.thoughtsSeen).not.toContain("test_door_unready");
    // Tap it closed and try the ship again: the same answer, every time.
    tapThrough(state);
    expect(state.phase).toBe("playing");
    expect(applyRunCommand(state, "tapTravelDoor", [DOOR_ID])).toBe(true);
    expect(state.dialogue?.source).toMatchObject({
      defId: "test_door_unready",
    });
  });

  it("refuses a hero who is not at the door", () => {
    installUnreadyDoor();
    const state = startGame(42, "test_unready_hub");
    const mark = state.landmarks.find((l) => l.kind === DOOR_ID)!;
    state.players[0].pos = {
      x: mark.pos.x + MERCHANT.tradeRadius * 3,
      y: mark.pos.y,
    };

    expect(applyRunCommand(state, "tapTravelDoor", [DOOR_ID])).toBe(false);
    expect(state.phase).toBe("playing");
    expect(state.dialogue).toBeNull();
  });

  it("says nothing for a door with no line, and nothing for a door that isn't there", () => {
    installUnreadyDoor();
    const state = startGame(42, "test_unready_hub");
    standAtDoor(state);

    // `car` is a real door on this level and carries no `unready` — the picker
    // (or, for the car, the ignition) is still the whole answer.
    expect(applyRunCommand(state, "tapTravelDoor", ["car"])).toBe(false);
    expect(applyRunCommand(state, "tapTravelDoor", ["no_such_door"])).toBe(
      false,
    );
    expect(state.dialogue).toBeNull();
  });
});

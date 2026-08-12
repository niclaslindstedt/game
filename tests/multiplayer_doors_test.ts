// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO THE MULTIPLAYER DOORS OPEN FOR — the three rows on the MULTIPLAYER
// screen (pwa/src/game/title-screen/menus-net.ts), and the one hero they are
// all shut to.
//
// A hero a bot has flown (`Character.autopiloted`) may never enter a session.
// Losing that is SILENT in the running game: the rows keep working and a
// bot-levelled hero simply walks into somebody's co-op game, which is exactly
// the thing the mark exists to stop.
//
// Two things are pinned, and the second is the one a future edit is likely to
// undo. ALL THREE doors shut, not the two obvious ones — JOIN BY ADDRESS is a
// door like any other and is the easiest to forget, because it is the one with
// no browser row in front of it. And the rows are LOCKED RATHER THAN ABSENT: a
// player whose MULTIPLAYER screen went blank would file a bug, where a locked
// row with the reason on it sends them to make another hero, which is the
// actual answer.

import { describe, expect, it } from "vitest";

import type { Character } from "../pwa/src/game/characters.ts";
import type {
  MenuContext,
  MenuEntry,
} from "../pwa/src/game/title-screen/menu-model.ts";
import { buildMultiplayerMenu } from "../pwa/src/game/title-screen/menus-net.ts";

function hero(over: Partial<Character> = {}): Character {
  return {
    id: "a",
    name: "NIC",
    hardcore: false,
    createdAt: 0,
    dead: false,
    loadout: null,
    clears: [],
    beaten: [],
    storySeen: [],
    merchantsMet: [],
    ...over,
  };
}

/** A MenuContext with just the fields this screen reads — the rest belongs to
 * other screens and is cast away rather than faked. */
function ctxFor(character: Character | null) {
  return {
    character,
    setScreen: () => {},
    setCursor: () => {},
  } as unknown as MenuContext;
}

/** The three doors, by aria — the BACK row is not one. */
const DOORS = [
  "multiplayer-host-game",
  "multiplayer-join-game",
  "multiplayer-join-address",
];

const doorRows = (rows: MenuEntry[]) =>
  DOORS.map((aria) => rows.find((row) => row.aria === aria));

describe("the multiplayer doors", () => {
  it("opens all three for an ordinary hero", () => {
    const rows = buildMultiplayerMenu(ctxFor(hero()));
    for (const row of doorRows(rows)) {
      expect(row, "every door is still on the screen").toBeDefined();
      expect(row?.locked).toBeFalsy();
    }
  });

  it("opens them with no hero picked yet — the roster is one press away", () => {
    // HOST GAME deliberately works with no hero: it arms the session and sends
    // the player to the roster, and the arm survives the detour.
    const rows = buildMultiplayerMenu(ctxFor(null));
    for (const row of doorRows(rows)) expect(row?.locked).toBeFalsy();
  });

  it("shuts ALL THREE for a hero a bot has flown", () => {
    const rows = buildMultiplayerMenu(ctxFor(hero({ autopiloted: true })));
    for (const row of doorRows(rows)) {
      expect(row?.locked, `${row?.aria} must be locked`).toBe(true);
    }
  });

  it("leaves the locked rows on screen, saying why and what to do", () => {
    const rows = buildMultiplayerMenu(ctxFor(hero({ autopiloted: true })));
    expect(rows.map((row) => row.aria)).toEqual([...DOORS, "multiplayer-back"]);
    for (const row of doorRows(rows)) {
      // The reason names the way out (another hero), not only the refusal —
      // and it is drawn in the menu font, which has no lowercase glyphs.
      expect(row?.blurb).toMatch(/ANOTHER/);
      expect(row?.blurb).toBe(row?.blurb?.toUpperCase());
    }
  });

  it("still lets a barred hero back out of the screen", () => {
    // The BACK row is not a door and must never be caught by the lock — a
    // screen with no way off it is a soft lock on a gamepad.
    const rows = buildMultiplayerMenu(ctxFor(hero({ autopiloted: true })));
    const back = rows.find((row) => row.aria === "multiplayer-back");
    expect(back?.locked).toBeFalsy();
  });
});

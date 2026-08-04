// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ONE-TIME MOVE of the user-data directory.
//
// Everything a player owns is in that folder — the roster in `localStorage`,
// their settings, the mods they dropped in — so the rules for moving it are
// worth pinning exactly. The decision is a pure function precisely so it can be
// tested without an Electron runtime.

import { describe, expect, it } from "vitest";

import {
  APP_DIR_NAME,
  LEGACY_DIR_NAMES,
  planUserDataMove,
} from "../src/user-data";

const APPDATA = "/home/player/.config";
const at = (name: string) => `${APPDATA}/${name}`;
/** `exists` for exactly this set of directories. */
const only =
  (...dirs: string[]) =>
  (dir: string) =>
    dirs.includes(dir);

describe("planning the move", () => {
  it("moves an install that still carries the npm package's name", () => {
    expect(planUserDataMove(APPDATA, only(at("adas-trail-desktop")))).toEqual({
      from: at("adas-trail-desktop"),
      to: at(APP_DIR_NAME),
    });
  });

  it("moves a macOS install named after the bundle", () => {
    expect(planUserDataMove(APPDATA, only(at("Adas Trail")))).toEqual({
      from: at("Adas Trail"),
      to: at(APP_DIR_NAME),
    });
  });

  it("does nothing for a fresh install", () => {
    expect(planUserDataMove(APPDATA, only())).toBeNull();
  });

  it("does nothing once the move has already happened", () => {
    expect(planUserDataMove(APPDATA, only(at(APP_DIR_NAME)))).toBeNull();
  });

  it("never overwrites data that is already in the new folder", () => {
    // Both present: the new one wins and the old is left where it is. Merging
    // two rosters, or clobbering one with the other, is exactly the wrong
    // thing to guess at — and the old folder can still be recovered by hand.
    const both = only(at(APP_DIR_NAME), at("adas-trail-desktop"));
    expect(planUserDataMove(APPDATA, both)).toBeNull();
  });

  it("prefers the first legacy name when an install somehow has two", () => {
    const both = only(at("adas-trail-desktop"), at("Adas Trail"));
    expect(planUserDataMove(APPDATA, both)?.from).toBe(at(LEGACY_DIR_NAMES[0]));
  });

  it("is named after the executable, with no punctuation to quote", () => {
    // The folder, the binary and the docs all say the same word — and an
    // apostrophe can never reach a path through it.
    expect(APP_DIR_NAME).toBe("adastrail");
    expect(APP_DIR_NAME).toMatch(/^[a-z0-9]+$/);
  });
});

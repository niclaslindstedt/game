// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The remembered window geometry — specifically, that it treats its own file as
// UNTRUSTED. The file sits in the user's app directory, survives updates, and
// is trivially hand-editable, so every field is re-validated on the way in and
// a rect that would open the game where nobody can see it is discarded.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STATE,
  loadWindowState,
  MIN_HEIGHT,
  MIN_WIDTH,
  saveWindowState,
  type DisplayArea,
} from "../src/window-state";

/** A single 1920×1080 monitor at the origin. The module takes displays as an
 * argument precisely so this is a literal rather than a mocked Electron. */
const ONE_MONITOR: DisplayArea[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gis-winstate-"));
});

function write(state: unknown): void {
  writeFileSync(join(dir, "window-state.json"), JSON.stringify(state), "utf8");
}

describe("loadWindowState", () => {
  it("returns the default when nothing has been saved", () => {
    expect(loadWindowState(dir, ONE_MONITOR)).toEqual(DEFAULT_STATE);
  });

  it("round-trips what saveWindowState wrote", () => {
    const state = {
      x: 100,
      y: 120,
      width: 1600,
      height: 900,
      maximized: false,
      fullscreen: true,
    };
    saveWindowState(dir, state);
    expect(loadWindowState(dir, ONE_MONITOR)).toEqual(state);
  });

  it("falls back to the default on an unparseable file", () => {
    writeFileSync(join(dir, "window-state.json"), "{not json", "utf8");
    expect(loadWindowState(dir, ONE_MONITOR)).toEqual(DEFAULT_STATE);
  });

  it("clamps a size below the game's small-screen floor", () => {
    // Below this the HUD starts colliding, so a hand-edited 1×1 must not be
    // honoured — the player would get a window they cannot play in.
    write({ width: 1, height: 1, maximized: false, fullscreen: false });
    const state = loadWindowState(dir, ONE_MONITOR);
    expect(state.width).toBe(MIN_WIDTH);
    expect(state.height).toBe(MIN_HEIGHT);
  });

  it("ignores a nonsense size rather than propagating NaN", () => {
    write({ width: "wide", height: null, maximized: 0, fullscreen: "yes" });
    const state = loadWindowState(dir, ONE_MONITOR);
    expect(state.width).toBe(DEFAULT_STATE.width);
    expect(state.height).toBe(DEFAULT_STATE.height);
    // Only a real `true` counts — a truthy string is not a saved preference.
    expect(state.maximized).toBe(false);
    expect(state.fullscreen).toBe(false);
  });

  it("keeps a position that still lands on a display", () => {
    write({
      x: 200,
      y: 150,
      width: 1280,
      height: 720,
      maximized: false,
      fullscreen: false,
    });
    const state = loadWindowState(dir, ONE_MONITOR);
    expect(state.x).toBe(200);
    expect(state.y).toBe(150);
  });

  it("keeps a position hanging off the edge of a display", () => {
    // Deliberate placement — the window overlaps, so give it back as saved.
    write({
      x: -200,
      y: 900,
      width: 1280,
      height: 720,
      maximized: false,
      fullscreen: false,
    });
    const state = loadWindowState(dir, ONE_MONITOR);
    expect(state.x).toBe(-200);
    expect(state.y).toBe(900);
  });

  it("drops a position that lands on no display at all", () => {
    // The unplugged-second-monitor case: restoring this faithfully opens the
    // game somewhere the player cannot reach it.
    write({
      x: 3000,
      y: 1400,
      width: 1280,
      height: 720,
      maximized: false,
      fullscreen: false,
    });
    const state = loadWindowState(dir, ONE_MONITOR);
    expect(state.x).toBeUndefined();
    expect(state.y).toBeUndefined();
    // …but the SIZE they chose is still theirs.
    expect(state.width).toBe(1280);
    expect(state.height).toBe(720);
  });

  it("drops a position when there are no displays to vouch for it", () => {
    write({
      x: 10,
      y: 10,
      width: 1280,
      height: 720,
      maximized: false,
      fullscreen: false,
    });
    expect(loadWindowState(dir, []).x).toBeUndefined();
  });
});

describe("saveWindowState", () => {
  it("does not throw when the directory cannot be written", () => {
    // Closing the game must never fail because a convenience file did.
    //
    // The unwritable path is a directory path UNDER A REGULAR FILE, which is
    // ENOTDIR on every OS including Windows — rather than something like
    // /proc/…, which is unportable and, in at least one container, makes a
    // recursive mkdir hang instead of fail.
    const file = join(dir, "i-am-a-file");
    writeFileSync(file, "not a directory", "utf8");
    expect(() =>
      saveWindowState(join(file, "nested"), { ...DEFAULT_STATE }),
    ).not.toThrow();
  });
});

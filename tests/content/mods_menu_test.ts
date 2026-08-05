// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODS SCREEN'S FOLDER ROWS — the path it prints, and when the row is
// there at all.
//
// The path is the interesting half: it is drawn in the pixel font, which is
// uppercase-only and falls back to `?` for any glyph it has no cell for. A
// Windows path is mostly separators and a user name, so an unsanitized one
// renders as a row of question marks — which is exactly the kind of thing that
// looks fine in a unit-free review and ships broken.

import { describe, expect, it } from "vitest";

import { GLYPHS } from "../../scripts/asset-tools/font.mjs";
import { displayPath } from "../../pwa/src/game/title-screen/menus-mods.ts";

/** Every character the path formatter can emit must have a cell in the font,
 * or it draws as `?`. This is the assertion the whole helper exists for. */
const drawable = (text: string): string[] =>
  [...text].filter((char) => !(char.toUpperCase() in GLYPHS));

describe("the folder path a row shows", () => {
  it("draws every character it emits — no `?` fallbacks", () => {
    for (const path of [
      "C:\\Users\\Jo_Blogs\\AppData\\Roaming\\adastrail\\mods",
      "/home/niclas/.config/adastrail/mods",
      "/Users/Ada/Library/Application Support/adastrail/mods",
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Adas Trail\\mods",
      "/hem/förnamn/adastrail/mods",
    ]) {
      expect(drawable(displayPath(path))).toEqual([]);
    }
  });

  it("normalises Windows separators rather than dropping them", () => {
    expect(displayPath("C:\\Games\\adastrail\\mods")).toBe(
      ".../GAMES/ADASTRAIL/MODS",
    );
  });

  it("shows the tail, which is the part that identifies the folder", () => {
    expect(displayPath("/home/player/.config/adastrail/mods")).toBe(
      ".../.CONFIG/ADASTRAIL/MODS",
    );
  });

  it("does not mark a short path as shortened", () => {
    expect(displayPath("/opt/mods")).toBe("/OPT/MODS");
  });

  it("replaces what the font lacks with a dash, never a question mark", () => {
    // An underscore and a tilde have no cell; a `?` would read as the game not
    // knowing where its own folder is.
    expect(displayPath("/home/jo_blogs/mods")).toBe("/HOME/JO-BLOGS/MODS");
    expect(displayPath("~/mods")).toBe("-/MODS");
  });
});

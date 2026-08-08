// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AN EMPTY ROSTER SHOWS ITSELF OUT. LOAD GAME is a list of heroes and a BACK
// row; minting a hero lives on the title menu's NEW GAME, not here. So deleting
// the last hero leaves a screen with nothing to pick and no way to make
// anything to pick — the player's only move is the BACK row they were given no
// reason to look for. Delete the last one and the screen takes them back to the
// title itself.
//
// The other half is what makes that landing consistent: the title menu DROPS
// its LOAD GAME row the moment the roster is empty (menus-main.ts), so the
// player is returned to a menu that no longer offers the screen they just
// emptied — never bounced back into it.
//
// Both are pinned from SOURCE rather than by driving the component: the suite
// runs in a plain Node environment with no DOM and no renderer (see
// vitest.config.ts), and these two lines are exactly the kind that a tidy-up
// removes without noticing what they were for.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** A source file with its comments stripped, so prose can never satisfy a
 * match — only code can. */
const code = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

const LOAD_GAME = code("pwa/src/game/LoadGame.tsx");
const MENUS_MAIN = code("pwa/src/game/title-screen/menus-main.ts");

/** The body of LoadGame's delete handler — the `remove` callback, up to the end
 * of its `useCallback(…)` call. */
const removeHandler = (): string => {
  const match = /const remove = useCallback\(([\s\S]*?)\n {2}\);/.exec(
    LOAD_GAME,
  );
  expect(match, "LoadGame no longer has a `remove` useCallback").not.toBeNull();
  return match?.[1] ?? "";
};

describe("deleting the last hero leaves the roster screen", () => {
  it("the delete handler re-reads the roster and exits when nothing remains", () => {
    const body = removeHandler();
    expect(body).toMatch(/deleteCharacter\(/);
    expect(body).toMatch(/loadCharacters\(\)/);
    // The exit is conditional on the roster being EMPTY — deleting one of
    // several heroes must leave the player on the screen.
    expect(body).toMatch(/\.length === 0\)?\s*(\{\s*)?onBack\(\)/);
  });

  it("the handler takes onBack as a dependency", () => {
    // A stale `onBack` captured by an empty dep list exits to whatever the
    // screen was mounted with, which is how this quietly stops working.
    expect(removeHandler()).toMatch(/\[onBack\]/);
  });
});

describe("the title menu it returns to", () => {
  it("drops LOAD GAME while the roster is empty", () => {
    expect(MENUS_MAIN).toMatch(/"load-game":\s*\n?\s*ctx\.roster\.length > 0/);
  });
});

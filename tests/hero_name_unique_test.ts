// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NO TWO HEROES BY ONE NAME (pwa/src/game/characters.ts, pwa/src/game/NewGame.tsx).
//
// Nothing in the save format needs them unique — a hero is its `id` everywhere
// that matters — so the collision is invisible to the code and lands entirely
// on the human: LOAD GAME shows two identical rows, the score board shows two
// identical entries, and RETIRE asks you to confirm the deletion of a name that
// names both. NEW GAME is the one door that mints a hero, so it is the one place
// the refusal costs anything to write.
//
// TWO HALVES, and only the first is testable by calling something: the
// predicate's folding (case, edge whitespace, a hero's own name), and the FORM
// actually consulting it. The second is pinned from SOURCE, the way
// `roster_empty_exit_test.ts` pins its pair — the suite runs in a plain Node
// environment with no DOM and no renderer, and a guard nothing checks is a guard
// the next tidy-up deletes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  characterNameTaken,
  createCharacter,
  loadCharacters,
  type Character,
} from "../pwa/src/game/characters.ts";
import { DEFAULT_HERO_NAME } from "../pwa/src/game/hero-name.ts";

/** A hero with nothing on them but the name the roster shows. */
const hero = (name: string, id = name): Character => ({
  id,
  name,
  hardcore: false,
  createdAt: 0,
  dead: false,
  loadout: null,
  clears: [],
  beaten: [],
  storySeen: [],
  merchantsMet: [],
});

/** One device's `localStorage`, for the half of this that goes through storage. */
function asDevice(): Map<string, string> {
  const stored = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  });
  return stored;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("characterNameTaken", () => {
  const roster = [hero("MARIS"), hero("THE FOUNDER")];

  it("catches the name exactly as it stands", () => {
    expect(characterNameTaken("MARIS", undefined, roster)).toBe(true);
    expect(characterNameTaken("THE FOUNDER", undefined, roster)).toBe(true);
  });

  it("catches it whatever case it arrives in", () => {
    // The field holds what the platform typed and the mint uppercases it, but
    // an imported hero or a DEVELOPER seed may carry any casing at all.
    expect(characterNameTaken("maris", undefined, roster)).toBe(true);
    expect(characterNameTaken("Maris", undefined, roster)).toBe(true);
    expect(characterNameTaken("maris", undefined, [hero("Maris")])).toBe(true);
  });

  it("catches it through the whitespace an autocomplete tap leaves", () => {
    expect(characterNameTaken("  MARIS ", undefined, roster)).toBe(true);
    expect(characterNameTaken("MARIS", undefined, [hero(" MARIS ")])).toBe(
      true,
    );
  });

  it("lets a different name through", () => {
    expect(characterNameTaken("MARI", undefined, roster)).toBe(false);
    expect(characterNameTaken("MARISS", undefined, roster)).toBe(false);
    expect(characterNameTaken("THE  FOUNDER", undefined, roster)).toBe(false);
  });

  it("is silent on an empty name", () => {
    // Empty is refused by the form for its own reason (there is no hero to
    // mint); calling it TAKEN would put the wrong message under the field.
    expect(characterNameTaken("", undefined, roster)).toBe(false);
    expect(characterNameTaken("   ", undefined, roster)).toBe(false);
  });

  it("does not count a hero's own name against them", () => {
    expect(characterNameTaken("MARIS", "MARIS", roster)).toBe(false);
    expect(characterNameTaken("MARIS", "THE FOUNDER", roster)).toBe(true);
  });

  it("reads the stored roster when it is given none", () => {
    asDevice();
    expect(characterNameTaken("MARIS")).toBe(false);
    createCharacter("MARIS", false);
    expect(characterNameTaken("MARIS")).toBe(true);
    expect(characterNameTaken("maris")).toBe(true);
    expect(characterNameTaken("BOLT")).toBe(false);
  });

  it("catches the hero an unnamed field mints", () => {
    // The empty form mints the placeholder — so pressing it twice is a
    // collision like any other, and the second press has to be refused.
    asDevice();
    expect(characterNameTaken(DEFAULT_HERO_NAME)).toBe(false);
    createCharacter("", false);
    expect(loadCharacters()[0]?.name).toBe(DEFAULT_HERO_NAME);
    expect(characterNameTaken(DEFAULT_HERO_NAME)).toBe(true);
  });
});

/** A source file with its comments stripped, so prose can never satisfy a
 * match — only code can. */
const code = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

const NEW_GAME = code("pwa/src/game/NewGame.tsx");

describe("the NEW GAME form", () => {
  it("asks the roster before it will mint anybody", () => {
    // Measured against the name that would actually be MINTED, not the raw
    // field — `heroName` for the casing and the trim, and the DEFAULT for a
    // field left blank, or the empty form could be pressed twice and put two
    // heroes called HERO on the roster.
    expect(NEW_GAME).toMatch(
      /const minted = heroName\(name\) \|\| DEFAULT_HERO_NAME;/,
    );
    expect(NEW_GAME).toMatch(/characterNameTaken\(minted,/);
    // …and the same name is the one handed up to be minted.
    expect(NEW_GAME).toMatch(/onCreate\(minted, hardcore\)/);
  });

  it("mints the placeholder the empty field promises", () => {
    // Three literals said HERO — the drawn placeholder, the real input's own,
    // and `createCharacter`'s fallback — and a rename that moved two of the
    // three would show one name and save another.
    expect(NEW_GAME).not.toMatch(/"HERO"/);
    expect(code("pwa/src/game/characters.ts")).toMatch(
      /name\.trim\(\) \|\| DEFAULT_HERO_NAME/,
    );
  });

  it("reads the roster once rather than per keystroke", () => {
    expect(NEW_GAME).toMatch(/useMemo\(\(\) => loadCharacters\(\), \[\]\)/);
  });

  it("refuses the create instead of minting a second one", () => {
    // The guard is the FIRST thing `create` does — anything before it is
    // something a refused press would still have done.
    expect(NEW_GAME).toMatch(/const create = \(\) => \{\s*if \(!canCreate\)/);
  });

  it("gates ENTER on the same answer as the button", () => {
    // A field whose Enter key had its own idea of "good enough" is exactly how
    // the button's guard gets walked around.
    expect(NEW_GAME).toMatch(/canSubmit=\{canCreate\}/);
    expect(NEW_GAME).toMatch(/e\.key === "Enter" && canSubmit/);
  });
});

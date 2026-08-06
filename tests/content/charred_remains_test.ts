// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BURNED BODY LEAVES — that every kind of body has its own answer, that
// the answer is a piece of art that actually shipped, and that a nuked screenful
// does not all leave the same mark.
//
// This is a CONTENT suite rather than an engine one because it reads the
// committed sprite atlas: the failure it exists to catch is a remain named in
// `gore.ts` that nobody drew (or that a rename left behind), which the renderer
// answers by drawing NOTHING — a body that burns up and leaves bare ground,
// with every other check green.
//
// The rule about the FALLBACK — that mature content off falls back to the
// ordinary punt-and-topple rather than to a vanished body — belongs to the nuke
// suite next door (`tests/nuke_incineration_test.ts`) and is not restated here.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  charredRemains,
  GORE_FAMILIES,
  type GoreFamilyId,
} from "../../pwa/src/game/game-screen/gore.ts";

/** The committed sprite-atlas manifest — the shipping sprite inventory. */
const sprites = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(
        new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
        "utf8",
      ),
    ),
  ),
);

describe("what a burned body leaves", () => {
  for (const family of GORE_FAMILIES) {
    it(`${family.id} burns down to art that shipped`, () => {
      const pool = [
        ...family.remains.humanoid,
        ...(family.remains.beast ?? []),
      ];
      expect(pool.length).toBeGreaterThan(0);
      for (const name of pool) {
        expect(
          sprites.has(name),
          `${name} missing from the atlas — run \`make assets\``,
        ).toBe(true);
      }
    });
  }

  it("gives every kind of body its OWN remains", () => {
    // The whole point of the catalog: a nuked rover must not leave the human
    // skeleton it used to. No sprite may appear under two families.
    const seen = new Map<string, GoreFamilyId>();
    for (const family of GORE_FAMILIES) {
      for (const name of [
        ...family.remains.humanoid,
        ...(family.remains.beast ?? []),
      ]) {
        expect(
          seen.get(name),
          `${name} is ${seen.get(name)}'s remains as well as ${family.id}'s`,
        ).toBeUndefined();
        seen.set(name, family.id);
      }
    }
  });

  it("burns a screenful down to more than one mark", () => {
    // A nuke kills a whole horde at once. If the pick did not move with the
    // kill's seed, forty bodies would leave forty copies of one decal.
    const marks = new Set(
      Array.from({ length: 40 }, (_, seed) =>
        charredRemains("blood", "humanoid", seed),
      ),
    );
    expect(marks.size).toBeGreaterThan(1);
  });

  it("is stable for one kill, so the frame does not flicker", () => {
    // Read once per draw, and a burning body is drawn for ~1600ms of them.
    expect(charredRemains("sparks", "humanoid", 17)).toBe(
      charredRemains("sparks", "humanoid", 17),
    );
  });

  it("leaves a beast its own carcass, and only where a family says so", () => {
    const beastPool = new Set(
      Array.from({ length: 40 }, (_, seed) =>
        charredRemains("blood", "beast", seed),
      ),
    );
    for (const mark of beastPool) {
      expect(GORE_FAMILIES[0]!.remains.beast).toContain(mark);
    }
    // A machine is a machine whichever way it walked: a family that draws no
    // anatomy distinction answers the same either way.
    for (const seed of [0, 1, 2, 3, 4]) {
      expect(charredRemains("sparks", "beast", seed)).toBe(
        charredRemains("sparks", "humanoid", seed),
      );
    }
  });

  it("burns a mob whose family nobody declared like a person", () => {
    // The same failure `goreFamily` takes, and for the same reason: an
    // undeclared mob already bled, so it already burned to bone.
    expect(charredRemains(undefined, "humanoid", 0)).toBe(
      charredRemains("blood", "humanoid", 0),
    );
  });
});

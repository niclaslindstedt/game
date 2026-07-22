// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOADING a hero resumes their campaign with no difficulty picker (pwa
// `resumeTargetFor`): it points at the campaign still IN PROGRESS — the furthest
// difficulty begun but not yet beaten — at the beginning of its first uncleared
// level. It returns null when nothing is under way (a fresh hero, or one who has
// beaten their difficulty), the signal for the caller to open the ladder
// instead so the hero picks a starting lane or steps up a rung.

import { DIFFICULTY_ORDER, LEVEL_ORDER, type Difficulty } from "@game/core";
import { describe, expect, it } from "vitest";

import type { Character } from "../pwa/src/game/characters.ts";
import { resumeTargetFor } from "../pwa/src/game/characters.ts";

const clearKey = (difficulty: Difficulty, levelId: string): string =>
  `${difficulty}:${levelId}`;

// resumeTargetFor reads only `clears` and `beaten`; a partial stand-in keeps the
// test free of the full loadout/roster scaffolding (mirrors difficulty-unlock).
function withProgress(clears: string[], beaten: Difficulty[] = []): Character {
  return { clears, beaten } as unknown as Character;
}

describe("resumeTargetFor — LOAD drops into the campaign in progress", () => {
  const firstLevel = LEVEL_ORDER[0] as string;
  const secondLevel = LEVEL_ORDER[1] as string;

  it("a fresh hero with no clears has nothing to resume (opens the ladder)", () => {
    expect(resumeTargetFor(withProgress([]))).toBeNull();
  });

  it("a hero mid-campaign resumes their difficulty at the first uncleared level", () => {
    const hero = withProgress([clearKey("medium", firstLevel)]);
    expect(resumeTargetFor(hero)).toEqual({
      difficulty: "medium",
      levelId: secondLevel,
    });
  });

  it("resumes the FURTHEST difficulty begun, not an easier one also dipped into", () => {
    const hero = withProgress([
      clearKey("medium", firstLevel),
      clearKey("hard", firstLevel),
    ]);
    // hard sits above medium in DIFFICULTY_ORDER, so it wins the walk-down.
    expect(resumeTargetFor(hero)).toEqual({
      difficulty: "hard",
      levelId: secondLevel,
    });
  });

  it("skips a BEATEN difficulty and resumes a harder one still in progress", () => {
    const hero = withProgress(
      [clearKey("easy", firstLevel), clearKey("nightmare", firstLevel)],
      ["easy"],
    );
    expect(resumeTargetFor(hero)).toEqual({
      difficulty: "nightmare",
      levelId: secondLevel,
    });
  });

  it("a hero who has only beaten their difficulty has nothing to resume", () => {
    // Every level of easy cleared and easy marked beaten: no campaign under way,
    // so LOAD falls back to the ladder (to replay or step up).
    const hero = withProgress(
      LEVEL_ORDER.map((id) => clearKey("easy", id)),
      ["easy"],
    );
    expect(resumeTargetFor(hero)).toBeNull();
  });

  it("orders its walk by DIFFICULTY_ORDER (hardest rung first)", () => {
    // Guard the assumption the FURTHEST test leans on.
    expect(DIFFICULTY_ORDER.indexOf("hard")).toBeGreaterThan(
      DIFFICULTY_ORDER.indexOf("medium"),
    );
    expect(DIFFICULTY_ORDER.indexOf("nightmare")).toBeGreaterThan(
      DIFFICULTY_ORDER.indexOf("easy"),
    );
  });
});

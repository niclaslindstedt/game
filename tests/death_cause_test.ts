// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO KILLED HIM — the attribution behind the softcore YOU DIED modal's "SLAIN
// BY …" line. What is pinned here is the promise it makes: the killer is read
// out of the ONE tick the hero fell on (so the answer is the fatal blow, never
// a bite from earlier in the run), a death the engine can't attribute prints
// NOTHING rather than a guess, and every cause the engine actually bills — a
// mob, each hazard, a devouring well, a boss's burning floor — resolves to
// something a player would recognise.

import { describe, expect, it } from "vitest";

import { ENEMY_DEFS, type GameEvent } from "@game/core";

import {
  fatalBlow,
  killerLabel,
} from "../pwa/src/game/game-screen/death-cause.ts";

const hurt = (cause?: string): GameEvent => ({
  type: "playerHurt",
  crit: false,
  ...(cause === undefined ? {} : { cause }),
});
const death: GameEvent = { type: "playerDeath", pos: { x: 0, y: 0 } };

/** A real mob id + name from the shipped catalog, so the test can't pass by
 * agreeing with a made-up def. */
const [MOB_ID, MOB] = Object.entries(ENEMY_DEFS)[0]!;

describe("fatalBlow", () => {
  it("reports nothing on a tick with no death", () => {
    expect(
      fatalBlow([hurt(MOB_ID), { type: "playerDodge", pos: { x: 0, y: 0 } }]),
    ).toBeNull();
  });

  it("credits the last attributed blow before the death", () => {
    // The blow that lands the kill is pushed by the same step as the death, so
    // the LAST cause ahead of `playerDeath` is the fatal one.
    expect(fatalBlow([hurt("far_away"), hurt(MOB_ID), death])).toEqual({
      cause: MOB_ID,
    });
  });

  it("ignores hits pushed after the death", () => {
    // Everything past `playerDeath` belongs to the death scene, not to the
    // blow that opened it.
    expect(fatalBlow([hurt(MOB_ID), death, hurt("late_arrival")])).toEqual({
      cause: MOB_ID,
    });
  });

  it("reports an unattributed death rather than the wrong killer", () => {
    // A hay bale bills damage with no `playerHurt` at all; a causeless hit
    // must not inherit the blame either.
    expect(fatalBlow([hurt(), death])).toEqual({ cause: null });
    expect(fatalBlow([death])).toEqual({ cause: null });
  });

  it("lets a devouring well outrank the bite before it", () => {
    // The well is instant death and bills no damage, so the swallow — not the
    // scratch the hero took on the way in — is what ended the run.
    const events: GameEvent[] = [
      hurt(MOB_ID),
      { type: "wellDeath", pos: { x: 1, y: 2 } },
      death,
    ];
    expect(killerLabel(fatalBlow(events)?.cause ?? null)).toBe(
      "A GRAVITY WELL",
    );
  });
});

describe("killerLabel", () => {
  it("names a mob from the catalog", () => {
    expect(killerLabel(MOB_ID)).toBe(MOB.name);
  });

  it("names every hazard the engine bills", () => {
    expect(killerLabel("hazard:asteroid")).toBe("AN ASTEROID STRIKE");
    expect(killerLabel("hazard:sandstorm")).toBe("THE SANDSTORM");
    expect(killerLabel("hazard:stampede")).toBe("THE STAMPEDE");
  });

  it("credits burning floor to whoever laid it down", () => {
    expect(killerLabel(`hazard:scorch:${MOB_ID}`)).toBe(`${MOB.name}'S FIRE`);
    // …and stays printable when the layer's id is gone from the catalog.
    expect(killerLabel("hazard:scorch:retired_boss")).toBe("BURNING GROUND");
  });

  it("prints nothing it can't stand behind", () => {
    expect(killerLabel(null)).toBeNull();
    expect(killerLabel("")).toBeNull();
    expect(killerLabel("no_such_mob")).toBeNull();
  });
});

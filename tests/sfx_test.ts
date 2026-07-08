// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SFX dispatcher (website/src/game/sfx). Everything in one step()'s
// event batch is simultaneous, so events that map to the same sound must
// play it once — an AoE blow reporting five kills would otherwise start five
// sample-aligned copies of one waveform: not "five kills", just one kill
// sound at 5× amplitude, clipping the mix. Events that pick different
// sounds (crit vs plain, magic vs ranged) must all still play.

import { describe, expect, it } from "vitest";

import type { GameEvent } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

import { playEventSounds } from "../website/src/game/sfx/index.ts";

/** A synth that only counts how many voices were started. */
function countingSynth(): { synth: Synth; calls: () => number } {
  let count = 0;
  return {
    synth: {
      unlock() {},
      now: () => null,
      tone() {
        count++;
      },
      noise() {
        count++;
      },
    },
    calls: () => count,
  };
}

const kill = (x: number): GameEvent => ({
  type: "enemyKilled",
  pos: { x, y: 0 },
  defId: "test_minion",
  damage: 10,
  crit: false,
});

describe("playEventSounds per-step dedupe", () => {
  it("plays identical sounds once per step, however many events report them", () => {
    const one = countingSynth();
    playEventSounds(one.synth, [kill(0)]);

    const five = countingSynth();
    playEventSounds(five.synth, [kill(0), kill(1), kill(2), kill(3), kill(4)]);

    expect(one.calls()).toBeGreaterThan(0);
    expect(five.calls()).toBe(one.calls());
  });

  it("still plays events that pick different sounds", () => {
    const { synth, calls } = countingSynth();
    playEventSounds(synth, [
      {
        type: "enemyHit",
        pos: { x: 0, y: 0 },
        crit: false,
        damage: 3,
        defId: "test_minion",
      },
      {
        type: "enemyHit",
        pos: { x: 1, y: 0 },
        crit: true,
        damage: 9,
        defId: "test_minion",
      },
    ]);
    const both = calls();

    const { synth: critOnly, calls: critCalls } = countingSynth();
    playEventSounds(critOnly, [
      {
        type: "enemyHit",
        pos: { x: 1, y: 0 },
        crit: true,
        damage: 9,
        defId: "test_minion",
      },
    ]);

    // The crit and the plain hit are distinct sounds — both must sound.
    expect(both).toBeGreaterThan(critCalls());
  });

  it("keys shots on their weapon class", () => {
    const { synth, calls } = countingSynth();
    const dir = { x: 1, y: 0 };
    playEventSounds(synth, [
      { type: "shot", weaponClass: "ranged", pos: { x: 0, y: 0 }, dir },
      { type: "shot", weaponClass: "magic", pos: { x: 0, y: 0 }, dir },
      { type: "shot", weaponClass: "ranged", pos: { x: 2, y: 0 }, dir },
    ]);
    const mixed = calls();

    const { synth: single, calls: singleCalls } = countingSynth();
    playEventSounds(single, [
      { type: "shot", weaponClass: "ranged", pos: { x: 0, y: 0 }, dir },
    ]);

    // magic zap + ranged pew both play; the duplicate ranged shot does not.
    expect(mixed).toBeGreaterThan(singleCalls());
  });
});

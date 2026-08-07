// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CUES — the sounds the engine does not know it is making.
//
// A cue is raised from per-frame render code rather than from `state.events`,
// which is what makes its two guard rails load-bearing rather than tidy: the
// rate limit (a party of four walking is eight boots a second before any mob is
// counted) and the fallback to a generic (a biome nobody authored a step for
// must still be audible). Both are asserted here because neither is visible in
// a screenshot and neither fails loudly — they fail as mud, or as silence.

import { beforeEach, describe, expect, it } from "vitest";

import { GENERATED_CUE_KEYS, GENERATED_SOUNDS } from "../pwa/src/generated/sounds.ts";
import { playCue, resetCues, setCueCatalog } from "../pwa/src/game/sfx/cues.ts";
import { clearListener } from "../pwa/src/game/sfx/listener.ts";
import type { SoundCatalog } from "../pwa/src/game/sfx/types.ts";
import type { Synth } from "../pwa/src/lib/synth.ts";

function recorder() {
  const tones: number[] = [];
  const synth = {
    tone: (o: { from: number }) => tones.push(o.from),
    noise: () => {},
  } as unknown as Synth;
  return { synth, tones };
}

/** A bank with one distinguishable sound per surface. */
const BANK: SoundCatalog = {
  step_any: { id: "step_any", voices: [{ call: "tone", from: 100, durationMs: 5 }] },
  step_metal: {
    id: "step_metal",
    voices: [{ call: "tone", from: 200, durationMs: 5 }],
  },
};
const KEYS = { "footstep|": "step_any", "footstep|metal": "step_metal" };

beforeEach(() => {
  clearListener();
  setCueCatalog(BANK, KEYS);
  resetCues();
});

describe("a cue picks its sound by surface", () => {
  it("takes the exact surface when one is authored", () => {
    const { synth, tones } = recorder();
    expect(playCue(synth, "footstep", "metal", undefined, 0)).toBe(true);
    expect(tones).toEqual([200]);
  });

  it("falls back to the generic for a surface nobody wrote", () => {
    // The line that lets a MOD lay down new ground without the game going
    // quiet on it, and lets the shipped set stop at six materials.
    const { synth, tones } = recorder();
    expect(playCue(synth, "footstep", "lava", undefined, 0)).toBe(true);
    expect(tones).toEqual([100]);
  });

  it("takes the generic when there is no surface at all", () => {
    const { synth, tones } = recorder();
    playCue(synth, "footstep", undefined, undefined, 0);
    expect(tones).toEqual([100]);
  });

  it("stays silent when the bank answers neither", () => {
    setCueCatalog(BANK, {});
    const { synth, tones } = recorder();
    expect(playCue(synth, "footstep", "metal", undefined, 0)).toBe(false);
    expect(tones).toEqual([]);
  });
});

describe("a cue is rate-limited in the funnel", () => {
  it("drops the ones that arrive too close together", () => {
    // 12 a second is the cap, so ~83 ms apart. Four bodies each asking on the
    // same frame is one footstep, not four.
    const { synth, tones } = recorder();
    for (let i = 0; i < 4; i += 1) playCue(synth, "footstep", "metal", undefined, 0);
    expect(tones).toHaveLength(1);
  });

  it("lets them through once enough time has passed", () => {
    const { synth, tones } = recorder();
    playCue(synth, "footstep", "metal", undefined, 0);
    playCue(synth, "footstep", "metal", undefined, 40);
    playCue(synth, "footstep", "metal", undefined, 200);
    playCue(synth, "footstep", "metal", undefined, 400);
    expect(tones).toEqual([200, 200, 200]);
  });

  it("counts the CUE, not the surface", () => {
    // A hero crossing a seam between two grounds must not get double the
    // footsteps for it — what the ear objects to is the total.
    const { synth, tones } = recorder();
    playCue(synth, "footstep", "metal", undefined, 0);
    playCue(synth, "footstep", "lava", undefined, 10);
    expect(tones).toHaveLength(1);
  });

  it("charges a cue whose sound is missing, so a dead bank is not a lookup a frame", () => {
    setCueCatalog(BANK, {});
    const { synth } = recorder();
    expect(playCue(synth, "footstep", "metal", undefined, 0)).toBe(false);
    expect(playCue(synth, "footstep", "metal", undefined, 10)).toBe(false);
    // The second was refused by the LIMITER, not by the lookup — which is what
    // keeps an unanswered cue from costing a map probe on every single frame.
    setCueCatalog(BANK, KEYS);
    // (setCueCatalog resets the limiter, so this is a fresh window.)
    const after = recorder();
    expect(playCue(after.synth, "footstep", "metal", undefined, 10)).toBe(true);
  });
});

describe("the shipped cue table", () => {
  it("routes every cue-triggered sound to a sound that exists", () => {
    for (const [key, id] of Object.entries(GENERATED_CUE_KEYS)) {
      expect(GENERATED_SOUNDS[id], `${key} → ${id}`).toBeDefined();
    }
  });

  it("ships a generic footstep, so no ground is silent", () => {
    // The fallback rung. Without it, a mod's new ground family — or a shipped
    // one somebody adds and forgets to author for — plays nothing at all.
    expect(GENERATED_CUE_KEYS["footstep|"]).toBeDefined();
  });

  it("keeps every footstep quiet enough to hear twice a second", () => {
    // The mixing rule that matters most for a repeating sound: the bank lives
    // at 0.01–0.09 and a footstep is at the very bottom of it. A loud one is
    // not a bug you see, it is a run you turn the sound off for.
    for (const [key, id] of Object.entries(GENERATED_CUE_KEYS)) {
      if (!key.startsWith("footstep")) continue;
      for (const voice of GENERATED_SOUNDS[id]!.voices) {
        expect(
          (voice as { volume?: number }).volume ?? 0,
          `${id} voice volume`,
        ).toBeLessThanOrEqual(0.02);
      }
    }
  });
});

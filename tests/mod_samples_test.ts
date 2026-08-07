// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MOD'S RECORDED SOUNDS, at the point they are actually heard.
//
// The compiler's half is `tests/content/mod_build_test.ts`; this is the page's:
// that a recording plays for every sound the game makes rather than only for a
// run's events, that a file the browser refuses puts the SHIPPED sound back
// instead of leaving a hole in the mix, that decoding is asked for once no
// matter how fast the sound repeats, and that the three things a recording can
// now do that a swapped-in file could not — vary, layer, and sustain — do them.
//
// The fail-open cases are the ones most worth a test. A decoder failure on a
// stranger's file is not hypothetical — a corrupt download, a container the
// shell's build of Chromium was compiled without, an .mp3 that is really an
// .m4a — and the difference between "that sound is the shipped one again" and
// "that sound is gone for the rest of the run" is the whole reason it fails
// open.

import { beforeEach, describe, expect, it } from "vitest";

import type { SampleOptions, Synth } from "../pwa/src/lib/synth.ts";

import { setListener, clearListener } from "../pwa/src/game/sfx/listener.ts";
import { playSound, stopSound } from "../pwa/src/game/sfx/play.ts";
import {
  clearSamples,
  loopRunning,
  sampleIds,
  setSamples,
  takeCount,
  warmSamples,
} from "../pwa/src/game/sfx/samples.ts";
import type { SoundCatalog } from "../pwa/src/game/sfx/types.ts";

/** A stand-in for a decoded recording — nothing here reads it. */
const BUFFER = { duration: 0.1 } as unknown as AudioBuffer;

/**
 * A synth that records what it was told to play, and answers `decode` however
 * the test needs it to.
 *
 * @param decode what the browser's decoder does with these bytes: a buffer, or
 *   null for the file it refuses.
 */
function stub(decode: AudioBuffer | null = BUFFER) {
  const tones: number[] = [];
  const samples: SampleOptions[] = [];
  const stops: number[] = [];
  let decodes = 0;
  const synth: Synth = {
    unlock() {},
    autostart() {},
    resume() {},
    now: () => 0, // audio is live, so a null decode means "refused"
    tone: (o) => tones.push(o.from),
    noise() {},
    sample: (o) => {
      samples.push(o);
      return { stop: (fadeMs = 0) => stops.push(fadeMs) };
    },
    decode: () => {
      decodes += 1;
      return Promise.resolve(decode);
    },
  };
  return { synth, tones, samples, stops, decodes: () => decodes };
}

/** The SHIPPED bank — what a failed recording falls back to. */
const SHIPPED: SoundCatalog = {
  enemy_killed: {
    id: "enemy_killed",
    voices: [{ call: "tone", from: 420, durationMs: 200 }],
  },
};

/** …and the bank with a mod merged onto it: the compiler turned the mod's
 * `enemy_killed.wav` into an ordinary def with one `call: sample` voice, which
 * is exactly what `soundDefs` in mod/tools/build.mjs emits. */
function modded(voice: Record<string, unknown> = {}): SoundCatalog {
  return {
    ...SHIPPED,
    enemy_killed: {
      id: "enemy_killed",
      voices: [{ call: "sample", clip: "enemy_killed", ...voice } as never],
    },
  };
}

const bytes = (n = 8) => new Uint8Array(n).fill(1);
const clip = (id: string, takes = 1) => ({
  id,
  takes: Array.from({ length: takes }, () => bytes()),
});

beforeEach(() => {
  clearSamples();
  clearListener();
});

describe("a mod's recorded sounds", () => {
  it("plays in place of the sound it replaced", async () => {
    const { synth, tones, samples } = stub();
    setSamples([clip("enemy_killed")]);
    warmSamples(synth);
    await Promise.resolve();

    expect(playSound(synth, modded(), "enemy_killed", undefined, SHIPPED)).toBe(
      true,
    );
    expect(samples).toHaveLength(1);
    expect(samples[0]?.buffer).toBe(BUFFER);
    // The shipped voices never fired — a mod that recorded this sound hearing
    // both would be its work playing under ours.
    expect(tones).toEqual([]);
  });

  it("carries the mixing its sample: block asked for", async () => {
    const { synth, samples } = stub();
    setSamples([clip("enemy_killed")]);
    warmSamples(synth);
    await Promise.resolve();

    playSound(
      synth,
      modded({ volume: 0.6, pan: -0.3, echo: 0.2 }),
      "enemy_killed",
      undefined,
      SHIPPED,
    );
    expect(samples[0]).toMatchObject({ volume: 0.6, pan: -0.3, echo: 0.2 });
  });

  it("plays a recording as mastered when no block tuned it", async () => {
    const { synth, samples } = stub();
    setSamples([clip("enemy_killed")]);
    warmSamples(synth);
    await Promise.resolve();

    playSound(synth, modded(), "enemy_killed", undefined, SHIPPED);
    // 1, and NOT a number this codebase invented: the SFX slider is applied by
    // the synth view above this one, so "as mastered" is full scale here.
    expect(samples[0]?.volume).toBe(1);
  });

  it("answers for a sound the shipped catalog does not hold at all", async () => {
    // The interface's bank, the road's sounds and a weapon's own `sfx:` all
    // reach `playSound` with their own catalog. One check covers every one.
    const { synth, samples } = stub();
    setSamples([clip("ui_confirm")]);
    warmSamples(synth);
    await Promise.resolve();

    const bank: SoundCatalog = {
      ui_confirm: {
        id: "ui_confirm",
        voices: [{ call: "sample", clip: "ui_confirm" }],
      },
    };
    expect(playSound(synth, bank, "ui_confirm")).toBe(true);
    expect(samples).toHaveLength(1);
  });

  it("claims the sound while its decode is still in flight", () => {
    // Silent for that one hit, on purpose: playing the shipped effect and then
    // swapping mid-fight reads as a glitch, not as a mod loading.
    const { synth, tones, samples } = stub();
    setSamples([clip("enemy_killed")]);

    expect(playSound(synth, modded(), "enemy_killed", undefined, SHIPPED)).toBe(
      true,
    );
    expect(samples).toEqual([]);
    expect(tones).toEqual([]);
  });

  it("decodes each recording once however fast the sound repeats", async () => {
    const { synth, decodes } = stub();
    setSamples([clip("enemy_killed")]);
    const bank = modded();
    for (let i = 0; i < 20; i += 1) {
      playSound(synth, bank, "enemy_killed", undefined, SHIPPED);
    }
    await Promise.resolve();
    playSound(synth, bank, "enemy_killed", undefined, SHIPPED);

    expect(decodes()).toBe(1);
  });

  it("puts the shipped sound back when the browser refuses the file", async () => {
    const { synth, tones } = stub(null);
    setSamples([clip("enemy_killed")]);
    warmSamples(synth);
    await Promise.resolve();

    // Dropped from the bank rather than left claiming a clip it cannot play —
    // a corrupt download must not silence a sound for the rest of the run.
    expect(sampleIds()).toEqual([]);
    expect(playSound(synth, modded(), "enemy_killed", undefined, SHIPPED)).toBe(
      true,
    );
    expect(tones).toEqual([420]);
  });

  it("keeps a recording it could not decode YET, while audio is locked", async () => {
    // The same null, and the opposite conclusion: before the player has
    // touched anything there is no AudioContext to decode with, and dropping
    // the bank there would mean a mod's sounds never load at all.
    const { synth, decodes } = stub(null);
    const locked: Synth = { ...synth, now: () => null };
    setSamples([clip("enemy_killed")]);
    warmSamples(locked);
    await Promise.resolve();

    expect(sampleIds()).toEqual(["enemy_killed"]);
    warmSamples(locked);
    await Promise.resolve();
    expect(decodes()).toBe(2); // asked again, rather than given up on
  });

  it("is gone the moment the modded run ends", () => {
    const { synth, tones } = stub();
    setSamples([clip("enemy_killed")]);
    clearSamples();

    expect(sampleIds()).toEqual([]);
    // The catalog is the shipped one again too, so this is the ordinary path.
    playSound(synth, SHIPPED, "enemy_killed");
    expect(tones).toEqual([420]);
  });
});

describe("variants — the machine-gun cure", () => {
  it("cycles takes so a repeat never lands back-to-back", async () => {
    const { synth, samples } = stub();
    setSamples([clip("enemy_killed", 3)]);
    warmSamples(synth);
    await Promise.resolve();

    expect(takeCount("enemy_killed")).toBe(3);
    const bank = modded();
    for (let i = 0; i < 6; i += 1) {
      playSound(synth, bank, "enemy_killed", undefined, SHIPPED);
    }
    // Every take is the same stub buffer, so what is asserted is the CURSOR:
    // six plays over three takes, never twice running on one.
    expect(samples).toHaveLength(6);
  });

  it("falls back to the takes that survived a refused one", async () => {
    // One bad file in a variant set must cost that take, not the clip.
    let call = 0;
    const { synth, samples } = stub();
    const patchy: Synth = {
      ...synth,
      decode: () => Promise.resolve(call++ === 1 ? null : BUFFER),
    };
    setSamples([clip("enemy_killed", 3)]);
    warmSamples(patchy);
    await Promise.resolve();
    await Promise.resolve();

    expect(sampleIds()).toEqual(["enemy_killed"]);
    playSound(patchy, modded(), "enemy_killed", undefined, SHIPPED);
    expect(samples).toHaveLength(1);
  });
});

describe("jitter — what stops a recording being byte-identical", () => {
  it("moves the rate within the band it was given", async () => {
    const { synth, samples } = stub();
    setSamples([clip("enemy_killed")]);
    warmSamples(synth);
    await Promise.resolve();

    const bank = modded({ pitchJitter: 0.1 });
    for (let i = 0; i < 40; i += 1) {
      playSound(synth, bank, "enemy_killed", undefined, SHIPPED);
    }
    const rates = samples.map((s) => s.rate ?? 1);
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.1);
    // …and it actually MOVED. A jitter that quietly did nothing would pass
    // every bound check above and fix nothing at all.
    expect(new Set(rates).size).toBeGreaterThan(1);
  });

  it("leaves an untuned recording at exactly its own pitch", async () => {
    const { synth, samples } = stub();
    setSamples([clip("enemy_killed")]);
    warmSamples(synth);
    await Promise.resolve();

    playSound(synth, modded(), "enemy_killed", undefined, SHIPPED);
    expect(samples[0]?.rate).toBe(1);
  });
});

describe("layering — a recording as one voice among several", () => {
  it("plays a clip, a delayed clip and a synthesized tail as one sound", async () => {
    const { synth, tones, samples } = stub();
    setSamples([clip("impact"), clip("debris")]);
    warmSamples(synth);
    await Promise.resolve();

    const bank: SoundCatalog = {
      big_hit: {
        id: "big_hit",
        voices: [
          { call: "sample", clip: "impact" },
          { call: "sample", clip: "debris", delayMs: 120 },
          { call: "tone", type: "sine", from: 60, durationMs: 400 },
        ],
      },
    };
    expect(playSound(synth, bank, "big_hit")).toBe(true);
    expect(samples).toHaveLength(2);
    expect(samples[1]?.delayMs).toBe(120);
    expect(tones).toEqual([60]);
  });
});

describe("loops — a sustained source", () => {
  const AMBIENCE: SoundCatalog = {
    storm: {
      id: "storm",
      voices: [{ call: "sample", clip: "storm" }],
      loop: true,
      stopOn: "sandstormEnded",
      fadeMs: 250,
    },
  };

  it("starts once however often its event repeats", async () => {
    const { synth, samples } = stub();
    setSamples([clip("storm")]);
    warmSamples(synth);
    await Promise.resolve();

    for (let i = 0; i < 5; i += 1) playSound(synth, AMBIENCE, "storm");
    expect(samples).toHaveLength(1);
    expect(samples[0]?.loop).toBe(true);
    expect(samples[0]?.fadeInMs).toBe(250);
    expect(loopRunning("storm")).toBe(true);
  });

  it("stops with the fade it was authored with", async () => {
    const { synth, stops } = stub();
    setSamples([clip("storm")]);
    warmSamples(synth);
    await Promise.resolve();

    playSound(synth, AMBIENCE, "storm");
    stopSound(AMBIENCE, "storm");
    expect(stops).toEqual([250]);
    expect(loopRunning("storm")).toBe(false);
  });

  it("is torn down when the bank is replaced", async () => {
    const { synth, stops } = stub();
    setSamples([clip("storm")]);
    warmSamples(synth);
    await Promise.resolve();

    playSound(synth, AMBIENCE, "storm");
    // A conversion's weather must not outlive the conversion.
    clearSamples();
    expect(stops).toEqual([0]);
    expect(loopRunning("storm")).toBe(false);
  });

  it("stopping one nobody started is not an error", () => {
    expect(() => stopSound(AMBIENCE, "storm")).not.toThrow();
  });
});

describe("spatial — where the sound is on the stage", () => {
  const SPATIAL: SoundCatalog = {
    boom: {
      id: "boom",
      voices: [{ call: "tone", from: 100, durationMs: 50, volume: 0.05 }],
      spatial: true,
    },
  };

  it("pans toward the side of the camera it happened on", () => {
    const { synth, samples } = stub();
    // A 400×200 camera whose centre is (200, 100).
    setListener({ x: 0, y: 0, width: 400, height: 200 });
    const seen: number[] = [];
    const spy: Synth = { ...synth, tone: (o) => seen.push(o.pan ?? 0) };

    playSound(spy, SPATIAL, "boom", { pos: { x: 400, y: 100 } });
    playSound(spy, SPATIAL, "boom", { pos: { x: 0, y: 100 } });
    playSound(spy, SPATIAL, "boom", { pos: { x: 200, y: 100 } });
    expect(seen[0]).toBeGreaterThan(0); // right edge
    expect(seen[1]).toBeLessThan(0); // left edge
    expect(seen[2]).toBe(0); // dead centre
    expect(samples).toEqual([]);
  });

  it("trims with distance from the middle of the picture", () => {
    const { synth } = stub();
    setListener({ x: 0, y: 0, width: 400, height: 200 });
    const seen: number[] = [];
    const spy: Synth = { ...synth, tone: (o) => seen.push(o.volume ?? 0) };

    playSound(spy, SPATIAL, "boom", { pos: { x: 200, y: 100 } });
    playSound(spy, SPATIAL, "boom", { pos: { x: 400, y: 100 } });
    playSound(spy, SPATIAL, "boom", { pos: { x: 2000, y: 100 } });
    expect(seen[0]).toBeCloseTo(0.05); // centred: untrimmed
    expect(seen[1]).toBeLessThan(seen[0]!); // at the edge: quieter
    expect(seen[2]).toBeLessThan(seen[1]!); // well off-screen: quieter still
    // …but never silent. The horde you have not turned to face is exactly what
    // audio is for.
    expect(seen[2]).toBeGreaterThan(0);
  });

  it("plays a spatial sound centred when there is no camera", () => {
    // The menus, a test, the tick before the first view is stamped. Marking a
    // sound spatial must never be a way to make it inaudible.
    const { synth } = stub();
    clearListener();
    const seen: SampleOptions[] = [];
    const spy: Synth = {
      ...synth,
      tone: (o) => seen.push(o as unknown as SampleOptions),
    };

    playSound(spy, SPATIAL, "boom", { pos: { x: 9999, y: 9999 } });
    expect(seen[0]?.pan ?? 0).toBe(0);
    expect(seen[0]?.volume).toBe(0.05);
  });

  it("leaves a sound that is not spatial exactly where it was authored", () => {
    const { synth } = stub();
    setListener({ x: 0, y: 0, width: 400, height: 200 });
    const seen: number[] = [];
    const spy: Synth = { ...synth, tone: (o) => seen.push(o.pan ?? 0) };
    const flat: SoundCatalog = {
      boom: {
        id: "boom",
        voices: [{ call: "tone", from: 100, durationMs: 50 }],
      },
    };

    playSound(spy, flat, "boom", { pos: { x: 400, y: 100 } });
    expect(seen).toEqual([0]);
  });
});

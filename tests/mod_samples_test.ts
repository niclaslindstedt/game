// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MOD'S RECORDED SOUNDS, at the point they are actually heard.
//
// The compiler's half is `tests/content/mod_build_test.ts`; this is the page's:
// that a recording answers BEFORE the synthesized bank, that it answers for
// every sound the game plays rather than only for a run's events, that a file
// the browser refuses puts the shipped sound back instead of leaving a hole in
// the mix, and that decoding is asked for once no matter how fast the sound
// repeats.
//
// The last two are the ones worth a test. A decoder failure on a stranger's
// file is not hypothetical — it is a corrupt download, a container the shell's
// build of Chromium was compiled without, an .mp3 that is really an .m4a — and
// the difference between "that sound is the shipped one again" and "that sound
// is gone for the rest of the run" is the whole reason the bank fails open.

import { beforeEach, describe, expect, it } from "vitest";

import type { SampleOptions, Synth } from "../pwa/src/lib/synth.ts";

import { playSound } from "../pwa/src/game/sfx/play.ts";
import {
  clearSamples,
  playSample,
  sampleIds,
  setSamples,
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
  let decodes = 0;
  const synth: Synth = {
    unlock() {},
    autostart() {},
    resume() {},
    now: () => 0, // audio is live, so a null decode means "refused"
    tone: (o) => tones.push(o.from),
    noise() {},
    sample: (o) => samples.push(o),
    decode: () => {
      decodes += 1;
      return Promise.resolve(decode);
    },
  };
  return { synth, tones, samples, decodes: () => decodes };
}

/** A one-voice synthesized bank, to be shadowed. */
const CATALOG: SoundCatalog = {
  enemy_killed: {
    id: "enemy_killed",
    voices: [{ call: "tone", from: 420, durationMs: 200 }],
  },
};

const bytes = (n = 8) => new Uint8Array(n).fill(1);

beforeEach(() => clearSamples());

describe("a mod's recorded sounds", () => {
  it("answers before the synthesized bank", async () => {
    const { synth, tones, samples } = stub();
    setSamples([{ id: "enemy_killed", bytes: bytes() }]);
    warmSamples(synth);
    await Promise.resolve();

    expect(playSound(synth, CATALOG, "enemy_killed")).toBe(true);
    expect(samples).toHaveLength(1);
    expect(samples[0]?.buffer).toBe(BUFFER);
    // The synthesized voices never fired — a mod that recorded this sound
    // hearing both would be its work playing under ours.
    expect(tones).toEqual([]);
  });

  it("carries the mixing its sample: block asked for", async () => {
    const { synth, samples } = stub();
    setSamples([
      { id: "enemy_killed", bytes: bytes(), volume: 0.6, pan: -0.3, echo: 0.2 },
    ]);
    warmSamples(synth);
    await Promise.resolve();

    playSound(synth, CATALOG, "enemy_killed");
    expect(samples[0]).toMatchObject({ volume: 0.6, pan: -0.3, echo: 0.2 });
  });

  it("plays a recording as mastered when no block tuned it", async () => {
    const { synth, samples } = stub();
    setSamples([{ id: "enemy_killed", bytes: bytes() }]);
    warmSamples(synth);
    await Promise.resolve();

    playSound(synth, CATALOG, "enemy_killed");
    // Undefined, not 1: the default belongs to the synth view that applies the
    // SFX slider, and a number written in here would be a second opinion.
    expect(samples[0]?.volume).toBeUndefined();
  });

  it("answers for a sound the shipped catalog does not hold at all", async () => {
    // The interface's bank, the road's sounds and a weapon's own `sfx:` all
    // reach `playSound` with their own catalog. One check covers every one.
    const { synth, samples } = stub();
    setSamples([{ id: "ui_confirm", bytes: bytes() }]);
    warmSamples(synth);
    await Promise.resolve();

    expect(playSound(synth, CATALOG, "ui_confirm")).toBe(true);
    expect(samples).toHaveLength(1);
  });

  it("claims the sound while its decode is still in flight", () => {
    // Silent for that one hit, on purpose: playing the shipped effect and then
    // swapping mid-fight reads as a glitch, not as a mod loading.
    const { synth, tones, samples } = stub();
    setSamples([{ id: "enemy_killed", bytes: bytes() }]);

    expect(playSound(synth, CATALOG, "enemy_killed")).toBe(true);
    expect(samples).toEqual([]);
    expect(tones).toEqual([]);
  });

  it("decodes each recording once however fast the sound repeats", async () => {
    const { synth, decodes } = stub();
    setSamples([{ id: "enemy_killed", bytes: bytes() }]);
    for (let i = 0; i < 20; i += 1) playSound(synth, CATALOG, "enemy_killed");
    await Promise.resolve();
    playSound(synth, CATALOG, "enemy_killed");

    expect(decodes()).toBe(1);
  });

  it("puts the shipped sound back when the browser refuses the file", async () => {
    const { synth, tones } = stub(null);
    setSamples([{ id: "enemy_killed", bytes: bytes() }]);
    warmSamples(synth);
    await Promise.resolve();

    // Dropped from the bank rather than left claiming an id it cannot play —
    // a corrupt download must not silence a sound for the rest of the run.
    expect(sampleIds()).toEqual([]);
    expect(playSound(synth, CATALOG, "enemy_killed")).toBe(true);
    expect(tones).toEqual([420]);
  });

  it("keeps a recording it could not decode YET, while audio is locked", async () => {
    // The same null, and the opposite conclusion: before the player has
    // touched anything there is no AudioContext to decode with, and dropping
    // the bank there would mean a mod's sounds never load at all.
    const { synth, decodes } = stub(null);
    const locked: Synth = { ...synth, now: () => null };
    setSamples([{ id: "enemy_killed", bytes: bytes() }]);
    warmSamples(locked);
    await Promise.resolve();

    expect(sampleIds()).toEqual(["enemy_killed"]);
    warmSamples(locked);
    await Promise.resolve();
    expect(decodes()).toBe(2); // asked again, rather than given up on
  });

  it("is gone the moment the modded run ends", () => {
    const { synth, tones } = stub();
    setSamples([{ id: "enemy_killed", bytes: bytes() }]);
    clearSamples();

    expect(playSample(synth, "enemy_killed")).toBe(false);
    playSound(synth, CATALOG, "enemy_killed");
    expect(tones).toEqual([420]);
  });
});

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COMPILED SOUND CATALOG AGAINST THE BANK IT CAME FROM.
//
// `content/sounds/` was derived from the old imperative sound bank by recording
// it (see scripts/sound-data/record.mjs) rather than by anyone retyping 274
// hand-tuned numbers. This is the other half of that: it replays the old bank
// AND the compiled catalog through the same recording synth and asserts the
// call sequences are identical.
//
// That is what makes the lift provable rather than hopeful. An audio regression
// is invisible to every other test in this repo — a volume typed as 0.35
// instead of 0.035 builds, typechecks, ships, and is discovered by a player
// wondering why the menu screams. Here it is a diff.
//
// The old bank stays in the tree for exactly as long as this test does; when it
// is deleted, this becomes a snapshot of the catalog against itself and should
// be deleted with it.

import { describe, expect, it } from "vitest";

import {
  GENERATED_SOUNDS,
  GENERATED_SOUND_KEYS,
} from "../pwa/src/generated/sounds.ts";
import { GENERATED_UI_SOUNDS } from "../pwa/src/generated/sounds-ui.ts";
import { playDef } from "../pwa/src/game/sfx/play.ts";
import type { Synth } from "../pwa/src/lib/synth.ts";

import {
  PARAMETERIZED,
  VARIANTS,
  soundId,
} from "../scripts/sound-data/record.mjs";
import {
  captureAchievementJingle,
  captureEventSounds,
  captureUiSounds,
} from "../scripts/sound-data/capture.mjs";

/** The same stub the capture uses, in the shape the player expects. */
function recorder() {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    synth: {
      tone: (o: Record<string, unknown>) => calls.push({ call: "tone", ...o }),
      noise: (o: Record<string, unknown>) =>
        calls.push({ call: "noise", ...o }),
    } as unknown as Synth,
  };
}

/** Replay one catalog entry and return the calls it makes. The bank is split
 * in two (the run's and the interface's — see the generator), so both are
 * consulted; which half an id lives in is the generator's business, not this
 * test's. */
function fromCatalog(id: string) {
  const def = GENERATED_SOUNDS[id] ?? GENERATED_UI_SOUNDS[id];
  if (!def) return null;
  const { calls, synth } = recorder();
  playDef(synth, def);
  return calls;
}

describe("every shipped sound survived the lift to content", () => {
  it("event sounds play byte-identically", async () => {
    const captured = await captureEventSounds();
    expect(captured.length).toBeGreaterThan(50);
    for (const sound of captured) {
      expect(fromCatalog(sound.id), `${sound.id} is missing`).not.toBeNull();
      expect(fromCatalog(sound.id), sound.id).toEqual(sound.calls);
    }
  });

  it("ui sounds play byte-identically", async () => {
    const captured = await captureUiSounds();
    expect(captured).toHaveLength(8);
    for (const sound of captured) {
      expect(fromCatalog(sound.id), sound.id).toEqual(sound.calls);
    }
  });

  it("the achievement fanfare plays byte-identically", async () => {
    const jingle = await captureAchievementJingle();
    expect(fromCatalog(jingle.id)).toEqual(jingle.calls);
  });
});

describe("the catalog's event routing", () => {
  it("keys every event-triggered sound the way soundKey does", async () => {
    // The generator builds `type|weaponClass|crit|kind|tier`; the runtime looks
    // up by the same string. A mismatch here is a sound that exists and never
    // plays, which nothing else would notice.
    for (const sound of await captureEventSounds()) {
      const key = [
        sound.type,
        sound.variant.weaponClass ?? "",
        sound.variant.crit ?? "",
        sound.variant.kind ?? "",
        sound.variant.tier ?? "",
      ].join("|");
      expect(GENERATED_SOUND_KEYS[key], `${sound.id} → ${key}`).toBe(sound.id);
    }
  });

  it("routes no key to a sound that does not exist", () => {
    for (const [key, id] of Object.entries(GENERATED_SOUND_KEYS)) {
      expect(GENERATED_SOUNDS[id], `${key} → ${id}`).toBeDefined();
    }
  });
});

describe("what deliberately did not move", () => {
  it("leaves the intensity-driven sounds out of the catalog", () => {
    // These scale with a continuous parameter, so they cannot be a static
    // entry. If one appears here, somebody has either made it static (fine —
    // remove it from PARAMETERIZED) or frozen it at one intensity (not fine).
    for (const type of PARAMETERIZED as Set<string>) {
      const id = soundId(type) as string;
      expect(
        GENERATED_SOUNDS[id],
        `${id} should still be code`,
      ).toBeUndefined();
    }
  });

  it("declares a variant matrix that matches the catalog", () => {
    // A discriminated event whose variants nobody listed would have been
    // captured once, collapsing several sounds into one.
    for (const [type, variants] of Object.entries(
      VARIANTS as Record<string, Record<string, unknown>[]>,
    )) {
      for (const variant of variants) {
        const id = soundId(type, variant) as string;
        expect(
          GENERATED_SOUNDS[id],
          `${id} (a declared variant)`,
        ).toBeDefined();
      }
    }
  });
});

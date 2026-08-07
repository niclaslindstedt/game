// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EVENT → SOUND ROUTING, ASSERTED THROUGH THE RUNTIME RATHER THAN RESTATED.
//
// `sound_catalog_test.ts` already checks that every compiled sound plays the
// voices it was authored with. It cannot check that the sound is REACHED: it
// builds the lookup key with its own copy of the generator's formula and
// compares that against the generator's own output, so a runtime that keys
// differently agrees with nobody and is caught by no one.
//
// That is not hypothetical. The runtime's key carried a sixth field (the
// event's `sfx`) that no `on:` block may match on and no generator emits, so
// EVERY event-driven lookup missed. Nothing in the shipped game noticed,
// because the imperative fallbacks in combat/world/pickups/powerups/jingles
// were what the catalog had been recorded FROM — they kept playing the
// byte-identical sound. The only casualty was the one thing no shipped code
// path exercises: a MOD's `on:`-routed sound, recorded or synthesized, which
// never played at all.
//
// So this suite routes through `playEventSounds` and proves the CATALOG
// answered, by making the catalog say something the fallback never would.

import { describe, expect, it } from "vitest";

import { GENERATED_SOUND_KEYS } from "../pwa/src/generated/sounds.ts";
import {
  playEventSounds,
  setSoundCatalog,
  SHIPPED_SOUNDS,
  SHIPPED_SOUND_KEYS,
} from "../pwa/src/game/sfx/index.ts";
import type { SoundDef } from "../pwa/src/game/sfx/types.ts";
import type { Synth } from "../pwa/src/lib/synth.ts";

/** A voice no shipped sound and no fallback could possibly play. */
const SENTINEL: SoundDef["voices"] = [
  { call: "tone", type: "sine", from: 7777, durationMs: 3, volume: 0.01 },
];

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

/**
 * Rebuild the event a routing key stands for. The key is
 * `type|weaponClass|crit|kind|tier` and an empty field means the sound did not
 * discriminate on it — so it is left OFF the event rather than set to "", or
 * `"crit" in event` would answer yes for a sound that never asked.
 */
function eventFor(key: string): Record<string, unknown> {
  const [type, weaponClass, crit, kind, tier] = key.split("|");
  return {
    type,
    // Every sound-bearing event carries a position or is positionless; neither
    // reaches the synth, and one is supplied so the shape is a plausible event.
    pos: { x: 0, y: 0 },
    ...(weaponClass ? { weaponClass } : {}),
    ...(crit ? { crit: crit === "true" } : {}),
    ...(kind ? { kind } : {}),
    ...(tier ? { tier } : {}),
  };
}

/** Play one event against a catalog where `id` says the sentinel. */
function routed(key: string, id: string): Record<string, unknown>[] {
  setSoundCatalog(
    { ...SHIPPED_SOUNDS, [id]: { id, voices: SENTINEL } },
    { ...SHIPPED_SOUND_KEYS },
  );
  try {
    const { calls, synth } = recorder();
    playEventSounds(synth, [eventFor(key) as never]);
    return calls;
  } finally {
    setSoundCatalog(SHIPPED_SOUNDS, SHIPPED_SOUND_KEYS);
  }
}

describe("every routed sound is actually reached", () => {
  it("has something to route", () => {
    expect(Object.keys(GENERATED_SOUND_KEYS).length).toBeGreaterThan(50);
  });

  for (const [key, id] of Object.entries(GENERATED_SOUND_KEYS)) {
    it(`${key} → ${id}`, () => {
      // Only the sentinel: a catalog hit returns before any fallback runs, so
      // extra calls would mean the event reached the imperative bank instead.
      expect(routed(key, id)).toEqual(SENTINEL);
    });
  }
});

describe("what the routing key is made of", () => {
  it("ignores an event's own sfx when choosing by event shape", () => {
    // `sfx` is a DISTINGUISHING field (two powers in one step are two sounds)
    // but not a ROUTING one — no `on:` block may match on it. An event whose
    // `sfx` names nothing must still find its event-shape sound rather than
    // falling through to the fallback bank.
    const [key, id] = Object.entries(GENERATED_SOUND_KEYS)[0]!;
    setSoundCatalog(
      { ...SHIPPED_SOUNDS, [id]: { id, voices: SENTINEL } },
      { ...SHIPPED_SOUND_KEYS },
    );
    try {
      const { calls, synth } = recorder();
      playEventSounds(synth, [
        { ...eventFor(key), sfx: "a_sound_no_mod_shipped" } as never,
      ]);
      expect(calls).toEqual(SENTINEL);
    } finally {
      setSoundCatalog(SHIPPED_SOUNDS, SHIPPED_SOUND_KEYS);
    }
  });

  it("lets a sound that names only a type answer every variant of it", () => {
    // The specificity ladder. Without it an `on:` naming only a type builds
    // `enemyTelegraph||||` while the event builds `enemyTelegraph|||charge|`,
    // and the sound never plays — with no error, because both halves are
    // individually right. Authors reach for the general case first.
    setSoundCatalog(
      { ...SHIPPED_SOUNDS, any_tell: { id: "any_tell", voices: SENTINEL } },
      { ...SHIPPED_SOUND_KEYS, "enemyTelegraph||||": "any_tell" },
    );
    try {
      const { calls, synth } = recorder();
      playEventSounds(synth, [
        { type: "enemyTelegraph", kind: "charge", pos: { x: 0, y: 0 } } as never,
      ]);
      expect(calls).toEqual(SENTINEL);
    } finally {
      setSoundCatalog(SHIPPED_SOUNDS, SHIPPED_SOUND_KEYS);
    }
  });

  it("prefers the exact shape over the general one", () => {
    const EXACT: typeof SENTINEL = [
      { call: "tone", type: "square", from: 111, durationMs: 3 },
    ];
    setSoundCatalog(
      {
        ...SHIPPED_SOUNDS,
        any_tell: { id: "any_tell", voices: SENTINEL },
        charge_tell: { id: "charge_tell", voices: EXACT },
      },
      {
        ...SHIPPED_SOUND_KEYS,
        "enemyTelegraph||||": "any_tell",
        "enemyTelegraph|||charge|": "charge_tell",
      },
    );
    try {
      const { calls, synth } = recorder();
      playEventSounds(synth, [
        { type: "enemyTelegraph", kind: "charge", pos: { x: 0, y: 0 } } as never,
      ]);
      expect(calls).toEqual(EXACT);
      const other = recorder();
      playEventSounds(other.synth, [
        { type: "enemyTelegraph", kind: "slam", pos: { x: 0, y: 0 } } as never,
      ]);
      expect(other.calls).toEqual(SENTINEL);
    } finally {
      setSoundCatalog(SHIPPED_SOUNDS, SHIPPED_SOUND_KEYS);
    }
  });

  it("still plays two sounds when one step throws two different sfx", () => {
    // The dedupe is per (route + sfx), so a step in which two powers each
    // throw `abilityStarted` with their own sound is two sounds, not one.
    setSoundCatalog(
      {
        ...SHIPPED_SOUNDS,
        mod_power_a: { id: "mod_power_a", voices: SENTINEL },
        mod_power_b: { id: "mod_power_b", voices: SENTINEL },
      },
      { ...SHIPPED_SOUND_KEYS },
    );
    try {
      const { calls, synth } = recorder();
      playEventSounds(synth, [
        { type: "abilityStarted", defId: "a", sfx: "mod_power_a" } as never,
        { type: "abilityStarted", defId: "b", sfx: "mod_power_b" } as never,
      ]);
      expect(calls).toEqual([...SENTINEL, ...SENTINEL]);
    } finally {
      setSoundCatalog(SHIPPED_SOUNDS, SHIPPED_SOUND_KEYS);
    }
  });
});

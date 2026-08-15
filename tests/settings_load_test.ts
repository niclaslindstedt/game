// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT `load()` MAKES OF A SAVED SETTINGS BLOB — the one code path every
// player's every preference goes through, and the one nothing could test until
// this file existed.
//
// TWO PROMISES ARE PINNED HERE. The first is that a stored value SURVIVES, which
// sounds too obvious to test and was not true: `visualsFrom` was handed the
// whole defaults object as its `base`, cloned it, and was spread LAST into
// `load()`'s literal — so every setting read above it was quietly re-stamped
// with its shipped default and nothing a player changed came back after a
// reload. The declared return type said four keys where the runtime object
// carried sixty, which is exactly the shape of bug a type checker cannot see and
// a round-trip test catches in one line.
//
// The second is the migration out of `extraGore` — the only part of the GORE
// page a player can never re-do by hand.
//
// A save from before the page existed carries one switch over the lot. `off`
// there is a player who has already said they want no gore, and the failure
// mode of getting it wrong is silent and nasty: they open the game after an
// update and are shown everything they turned off years ago. So the whole page
// arrives off, and an `on` (or a save predating the row entirely) takes the
// shipped defaults, which is what it always meant.
//
// It needs its own file because the loader runs ONCE, at module import: the
// store has to be seeded before `settings.ts` is first pulled in, and every
// other suite that touches settings has already imported it.

import { afterEach, describe, expect, it, vi } from "vitest";

import { GORE_SWITCHES } from "../pwa/src/game/settings.ts";

/** A fresh copy of the settings module, loaded over a store holding `stored`. */
async function settingsFrom(stored: Record<string, unknown>) {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    // The defaults probe the pointer type; a settings load must not depend on
    // which answer it gets, so this suite pins the desktop one.
    matchMedia: () => ({ matches: false }),
    // Enough of a Location for the engine's own output module, which decides
    // its verbosity off `?debug` the moment it is imported.
    location: { search: "" },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.resetModules();
  // The key the app itself uses, built the way the app builds it.
  const { storageKey } = await import("../pwa/src/identity.ts");
  store.set(storageKey("settings"), JSON.stringify(stored));
  const { getSettings } = await import("../pwa/src/game/settings.ts");
  return getSettings();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("a saved settings blob", () => {
  it("comes back as it was stored, every value of it", async () => {
    // One of each SHAPE the loader validates — a union, a switch, a plain
    // number, an fx knob — because the bug this pins clobbered them all at once
    // and any single one of them would have caught it.
    const settings = await settingsFrom({
      steering: "aim",
      healthBars: "off",
      sfwMode: "on",
      musicVolume: 0.12,
      autoEquip: "on",
      swipeBars: "on",
      minimapMode: "follow",
      vignette: 0.4,
    });
    expect(settings.steering).toBe("aim");
    expect(settings.healthBars).toBe("off");
    expect(settings.sfwMode).toBe("on");
    expect(settings.musicVolume).toBeCloseTo(0.12, 5);
    expect(settings.autoEquip).toBe("on");
    expect(settings.swipeBars).toBe("on");
    expect(settings.minimapMode).toBe("follow");
    expect(settings.vignette).toBeCloseTo(0.4, 5);
  });

  it("takes the shipped default for anything it does not carry", async () => {
    const settings = await settingsFrom({ steering: "aim" });
    expect(settings.healthBars).toBe("on");
    expect(settings.musicVolume).toBeGreaterThan(0);
    expect(settings.sfwMode).toBe("off");
  });
});

describe("a fresh install", () => {
  // THE SHIPPED PRESENTATION IS THE WHOLE GAME, and every one of these rows is
  // a thing a player would have to go looking for a switch to lose. They are
  // pinned together rather than one at a time because the failure is always the
  // same shape: somebody adds a row, defaults it `off` while testing it, and
  // ships a game whose first-run experience is missing a feature nobody
  // remembers is optional.
  it("plays every optional beat", async () => {
    const settings = await settingsFrom({});
    expect(settings.minigames).toBe("on");
    expect(settings.cutscenes).toBe("on");
    expect(settings.dialogue).toBe("on");
    expect(settings.deathScenes).toBe("on");
  });

  it("shows the gore as it is authored", async () => {
    const settings = await settingsFrom({});
    expect(settings.sfwMode).toBe("off");
    for (const key of GORE_SWITCHES) {
      expect(settings[key], `${key} ships off`).toBe("on");
    }
  });

  // The engine holds its own copies of four of these (`engine/game/flags.ts`),
  // applied at startup from the settings above — so a flag that defaulted the
  // other way would leave a run muted until the settings screen was opened.
  it("hands the engine the same answers", async () => {
    await settingsFrom({});
    const flags = await import("../engine/game/flags.ts");
    expect(flags.areMinigamesEnabled()).toBe(true);
    expect(flags.areCutscenesEnabled()).toBe(true);
    expect(flags.isDialogueEnabled()).toBe(true);
    expect(flags.areDeathScenesEnabled()).toBe(true);
  });
});

describe("a save from before the GORE page", () => {
  it("arrives with every kind of gore off when EXTRA GORE was off", async () => {
    const settings = await settingsFrom({ extraGore: "off" });
    for (const key of GORE_SWITCHES) {
      expect(settings[key], `${key} came back on`).toBe("off");
    }
  });

  it("takes the shipped defaults when EXTRA GORE was on", async () => {
    const settings = await settingsFrom({ extraGore: "on" });
    for (const key of GORE_SWITCHES) {
      expect(settings[key], `${key} came back off`).toBe("on");
    }
  });

  it("lets an explicit switch outrank the legacy key", async () => {
    // The one save that can carry both: a player who restores an old backup and
    // then changes a row.
    const settings = await settingsFrom({
      extraGore: "off",
      goreSparks: "on",
    });
    expect(settings.goreSparks).toBe("on");
    expect(settings.goreBlood).toBe("off");
  });
});

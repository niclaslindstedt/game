// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOD INFO SCREEN — the page a tapped mod opens, and the two jobs it has
// that the list cannot do: say what the mod puts in the game, in its author's
// own words, and carry the switch that decides whether it does.
//
// The failure worth guarding here is a silent one. The screen is Steam-only
// (`modsBridgeAvailable`), so nobody runs into it while working on the app, and
// a builder that stopped emitting the inventory — or a bundle field renamed out
// from under it — would leave a page that still renders, still switches the mod
// on, and simply no longer tells anybody what they installed.

import { describe, expect, it } from "vitest";

import type { InstalledMod } from "../../pwa/src/app/mods-bridge.ts";
import type { ModBundle } from "../../pwa/src/game/mod-state.ts";
import type {
  MenuContext,
  MenuEntry,
  ModsMenuState,
} from "../../pwa/src/game/title-screen/menu-model.ts";
import { buildModInfoMenu } from "../../pwa/src/game/title-screen/menus-mods.ts";
import { headingFor } from "../../pwa/src/game/title-screen/menus.ts";

function bundle(over: Partial<ModBundle> = {}): ModBundle {
  return {
    formatVersion: 1,
    id: "greenhouse",
    name: "THE GREENHOUSE",
    version: "1.0.0",
    author: "ADA",
    description: "A sixth venue, still running on a timer nobody reset.",
    kind: "addon",
    brand: null,
    campaign: null,
    levels: [],
    blueprints: {},
    enemies: {},
    weapons: {},
    gear: {},
    uniques: {},
    sounds: {},
    powerups: {},
    talents: {},
    companions: {},
    sets: {},
    difficulties: {},
    soundKeys: {},
    music: {},
    cutscenes: {},
    thoughts: {},
    capRotation: [],
    storyItems: {},
    quests: {},
    questGivers: {},
    sprites: [],
    contents: [
      {
        path: "enemies/greenhouse/greenhouse_creeper.yaml",
        summary: "THE CREEPER - a vine that walks.",
        change: "adds",
      },
      {
        path: "sounds/shotgun.yaml",
        summary: "A wetter bark for the shotgun.",
        change: "replaces",
      },
    ],
    ...over,
  };
}

function installed(over: Partial<InstalledMod> = {}): InstalledMod {
  return {
    key: "greenhouse",
    folder: "/mods/greenhouse",
    source: "workshop",
    bundle: bundle(),
    errors: [],
    needsUpdate: false,
    ...over,
  };
}

/** The screen, built for one mod. `on` is what the load order says. */
function page(
  mod: InstalledMod,
  on = false,
): { rows: MenuEntry[]; flipped: [string, boolean][] } {
  const flipped: [string, boolean][] = [];
  const state: ModsMenuState = {
    rows: [{ id: mod.bundle?.id ?? mod.key, mod, on }],
    isOn: () => on,
    setEnabled: (id, next) => flipped.push([id, next]),
    selected: mod,
    select: () => {},
    move: () => {},
    overriddenIds: () => 0,
    folders: { local: "/mods", portable: null },
    reveal: () => {},
    onPlay: () => {},
    onPublish: () => {},
  };
  const ctx = {
    setScreen: () => {},
    setCursor: () => {},
    rowIndexIn: () => 0,
    setNotice: () => {},
    mods: state,
  } as unknown as MenuContext;
  return { rows: buildModInfoMenu(ctx, state), flipped };
}

const labels = (rows: MenuEntry[]) => rows.map((row) => row.label);

describe("the MOD INFO screen", () => {
  it("leads with the switch, and flipping it enables the mod", () => {
    const { rows, flipped } = page(installed());
    expect(rows[0]!.label).toBe("ENABLED");
    expect(rows[0]!.toggle?.on).toBe(false);
    rows[0]!.toggle?.set(true);
    expect(flipped).toEqual([["greenhouse", true]]);
  });

  it("says what the mod itself says about what it is", () => {
    const { rows } = page(installed());
    expect(rows[0]!.blurb).toContain("STILL RUNNING ON A TIMER");
  });

  it("lists every file the mod ships, and whether it adds or replaces", () => {
    const { rows } = page(installed());
    expect(labels(rows)).toContain("GREENHOUSE CREEPER");
    const creeper = rows.find((row) => row.label === "GREENHOUSE CREEPER");
    expect(creeper?.subtitle).toBe("ADDS A MONSTER");
    expect(creeper?.blurb).toContain("A VINE THAT WALKS");
    const shotgun = rows.find((row) => row.label === "SHOTGUN");
    expect(shotgun?.subtitle).toBe("REPLACES A SOUND");
  });

  it("offers PUBLISH for the mod the player is writing, and nobody else's", () => {
    expect(labels(page(installed({ source: "local" })).rows)).toContain(
      "PUBLISH TO WORKSHOP",
    );
    for (const source of ["workshop", "portable"] as const) {
      expect(labels(page(installed({ source })).rows)).not.toContain(
        "PUBLISH TO WORKSHOP",
      );
    }
  });

  it("says so when a mod's author left no inventory", () => {
    const { rows } = page(installed({ bundle: bundle({ contents: [] }) }));
    expect(labels(rows)).toContain("IT LISTS NO CONTENTS");
  });

  it("gives a broken mod its whole list of problems, and no switch to flip", () => {
    const broken = installed({
      bundle: null,
      errors: [
        'levels/x.yaml: enemy "ghoul" is not an id the game has',
        "and another",
      ],
    });
    const { rows, flipped } = page(broken);
    expect(rows[0]!.label).toBe("ENABLED");
    expect(rows[0]!.locked).toBe(true);
    expect(rows[0]!.toggle).toBeUndefined();
    rows[0]!.action();
    expect(flipped).toEqual([]);
    expect(labels(rows)).toContain("PROBLEM 1");
    expect(labels(rows)).toContain("PROBLEM 2");
    // The compiler quotes ids, and the pixel font has no double quote — a row
    // of question marks is not an error message.
    expect(rows.find((row) => row.label === "PROBLEM 1")?.blurb).not.toContain(
      '"',
    );
  });

  it("is titled by the mod it is showing", () => {
    const state = { selected: installed() } as unknown as ModsMenuState;
    expect(headingFor("modinfo", false, state)).toEqual({
      title: "THE GREENHOUSE",
      trail: "MODS",
      tone: "player",
    });
  });
});

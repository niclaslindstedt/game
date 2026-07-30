// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOD SEAM FOR THE REPO'S OWN TOOLS (scripts/mod-support.mjs) — that
// `--mod <dir>` actually puts a mod's content where every analyzer, renderer
// and simulator in `scripts/` looks for it.
//
// The failure this guards against is silent in the worst way: a tool that
// loads a mod and then reports on the SHIPPED game reads exactly like a tool
// that worked. A mod author would tune their venue against numbers that were
// never theirs. So the assertions below are not about the compile (that is
// mod_build_test.ts) but about REACHABILITY — the mod's level in the catalog
// the run resolves through, its monster where a con circle reads it, its
// relic in the id list the authoring audits walk, and its venue in the order
// `--all` sweeps.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ENEMY_DEFS,
  LEVELS,
  LEVEL_ORDER,
  MAP_BLUEPRINTS,
  UNIQUE_DEFS,
  WEAPON_DEFS,
  createGame,
  levelDef,
} from "@game/core";
import { UNIQUE_IDS } from "../../src/game/defs/uniques.ts";

import { applyMods, takeModFlags } from "../../scripts/mod-support.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const EXAMPLE = path.join(repoRoot, "mod", "examples", "greenhouse");

describe("takeModFlags", () => {
  it("pulls every --mod out and leaves the rest untouched", () => {
    const { mods, rest } = takeModFlags([
      "moon",
      "--mod",
      "a-mod",
      "--difficulty",
      "hard",
      "--mod=b-mod",
      "--dormant",
    ]);
    expect(mods.map((m: string) => path.basename(m))).toEqual([
      "a-mod",
      "b-mod",
    ]);
    // Stripping is the point: the scripts hand what is left to their own
    // parsers, several of which take the first non-flag argument as the level
    // id — and would happily take a mod folder for one.
    expect(rest).toEqual(["moon", "--difficulty", "hard", "--dormant"]);
  });

  it("refuses a --mod with nothing after it", () => {
    expect(() => takeModFlags(["--mod"])).toThrow(/needs a mod folder/);
    expect(() => takeModFlags(["--mod", "--all"])).toThrow(/needs a mod folder/);
  });

  it("is a no-op without the flag, so a tool can pass it through blindly", () => {
    expect(takeModFlags(["moon", "--all"])).toEqual({
      mods: [],
      rest: ["moon", "--all"],
    });
  });
});

describe("applyMods", () => {
  it("answers null when there is no mod, without touching the game", async () => {
    expect(await applyMods([])).toBeNull();
    expect(LEVEL_ORDER).not.toContain("greenhouse");
  });

  it("puts the worked example everywhere a tool reads the game", async () => {
    const loaded = await applyMods([EXAMPLE], { quiet: true });
    expect(loaded?.levelIds).toEqual(["greenhouse"]);

    // 1. The catalogs the tools read directly (a con circle's `ENEMY_DEFS`
    //    lookup, the arsenal sheet's `WEAPON_DEFS` walk).
    expect(LEVELS.greenhouse).toBeDefined();
    expect(ENEMY_DEFS.greenhouse_creeper).toBeDefined();
    expect(WEAPON_DEFS.greenhouse_pruning_saw).toBeDefined();
    expect(UNIQUE_DEFS.greenhouse_first_cutting).toBeDefined();
    expect(MAP_BLUEPRINTS.greenhouse).toBeDefined();

    // 2. The ACTIVE registry the engine itself resolves through — a different
    //    thing from the record above, and the one a run asks.
    expect(levelDef("greenhouse").name).toBe("THE GREENHOUSE");

    // 3. The snapshot id list the relic audits walk, taken at module load and
    //    therefore the easiest of the three to leave behind.
    expect(UNIQUE_IDS).toContain("greenhouse_first_cutting");

    // 4. The play order `--all` / `--level all` sweeps. An addon's venue joins
    //    the shipped campaign at its own authored index.
    expect(LEVEL_ORDER).toContain("greenhouse");
    expect(LEVEL_ORDER.indexOf("greenhouse")).toBe(LEVEL_ORDER.length - 1);
  });

  it("builds a run on the mod's own venue", async () => {
    await applyMods([EXAMPLE], { quiet: true });
    const state = createGame(1, "greenhouse", "medium");
    expect(state.level.id).toBe("greenhouse");
    // The horde is the mod's own, standing on a map the mod authored.
    expect(state.enemies.length).toBeGreaterThan(0);
    expect(state.obstacles.length).toBeGreaterThan(0);
  });

  it("refuses a folder that is not a mod", async () => {
    await expect(applyMods([repoRoot])).rejects.toThrow(/no mod\.yaml/);
  });
});

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MOD COMPILER — that it accepts the worked example, and that every check
// it makes actually bites.
//
// The negative cases are the point. A compiler that accepts everything is
// worse than none at all here: a mod is content a stranger subscribed to, and
// the alternatives to failing at COMPILE time are all silent — a monster drawn
// as nothing, a level that names an enemy the game has never heard of, an
// addon that quietly shadows one of the shipped venues. Each test below is one
// of those failures, caught while there is still a filename to blame.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildMod } from "../../mod/tools/build.mjs";
import { readCatalog } from "../../mod/tools/catalog-read.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const catalog = readCatalog(path.join(repoRoot, "mod", "catalog.json"));
const EXAMPLE = path.join(repoRoot, "mod", "examples", "greenhouse");

/** A throwaway mod folder. Each test writes only the files it cares about, so
 * a failure names one missing or malformed thing rather than a whole tree. */
const temps: string[] = [];
function scratchMod(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "gis-mod-"));
  temps.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const MANIFEST = [
  "id: scratch-mod",
  "name: SCRATCH",
  "version: 1.0.0",
  "author: test",
].join("\n");

/** A minimal valid enemy, parameterized on the two things tests break. */
const enemyYaml = (id: string, sprite: string) =>
  [
    `id: ${id}`,
    "name: SCRATCH MOB",
    "role: minion",
    `sprite: ${sprite}`,
    "hp: 10",
    "speed: 12",
    "radius: 8",
    "contactDamage: 5",
    "critChance: 0.1",
    "contactCooldownMs: 700",
  ].join("\n");

describe("the worked example", () => {
  it("compiles, because a broken example teaches a broken format", () => {
    const { bundle, errors } = buildMod(EXAMPLE, catalog);
    expect(errors).toEqual([]);
    expect(bundle).not.toBeNull();
    expect(bundle!.id).toBe("greenhouse");
    expect(bundle!.levels).toHaveLength(1);
    expect(Object.keys(bundle!.enemies)).toEqual(["greenhouse_creeper"]);
  });

  it("rasterizes its sprites to RGBA the page can blit without a decoder", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    const frame = bundle!.sprites.find(
      (s) => s.name === "greenhouse_creeper_0",
    );
    expect(frame).toBeDefined();
    expect(frame!.width).toBe(16);
    expect(frame!.height).toBe(16);
    // 16 × 16 × RGBA, and not a byte more — the page allocates against these
    // numbers, so a mismatch here is a corrupt ImageBitmap at load. Decoded
    // the way the PAGE decodes it (atob, not Buffer), so the test exercises
    // the same round trip the game does.
    expect(atob(frame!.rgba)).toHaveLength(16 * 16 * 4);
  });

  it("compiles its items into the three catalogs the engine reads", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    expect(Object.keys(bundle!.weapons)).toEqual(["greenhouse_pruning_saw"]);
    expect(bundle!.gear).toEqual({});
    expect(Object.keys(bundle!.uniques)).toEqual(["greenhouse_first_cutting"]);
    // The tree bookkeeping is shed on the way through, exactly as the shipped
    // pipeline sheds it — a def that still carried `kind`/`rarity` would be a
    // mod item shaped differently from every other item in the game.
    const saw = bundle!.weapons.greenhouse_pruning_saw as Record<
      string,
      unknown
    >;
    expect(saw.kind).toBeUndefined();
    expect(saw.rarity).toBeUndefined();
    expect(saw.damage).toBe(17);
    // A unique's DIRECTORY rarity becomes its minted tier.
    const relic = bundle!.uniques.greenhouse_first_cutting as Record<
      string,
      unknown
    >;
    expect(relic.tier).toBe("unique");
  });

  it("lets a mod's unique sit on a base the same mod ships", () => {
    // The cross-ref that only works because refs are BASE ∪ MOD.
    const { errors } = buildMod(EXAMPLE, catalog);
    expect(errors).toEqual([]);
  });

  it("carries the ladder rows its level is priced with", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    const level = bundle!.levels[0] as { mobLevels: number[] };
    // Four rungs, easy → nightmare; JESUS stays player-relative.
    expect(level.mobLevels).toHaveLength(4);
  });
});

describe("what the compiler refuses", () => {
  it("a mod with no manifest", () => {
    const { bundle, errors } = buildMod(scratchMod({}), catalog);
    expect(bundle).toBeNull();
    expect(errors.join()).toMatch(/no mod\.yaml/);
  });

  it("a manifest id that could not be a folder name", () => {
    const dir = scratchMod({
      "mod.yaml": "id: Scratch Mod!\nname: X\nversion: 1\nauthor: t",
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/id "Scratch Mod!"/);
  });

  it("an enemy whose sprite has no frames — the silent one", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "no_such_sprite"),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(bundle).toBeNull();
    expect(errors.join()).toMatch(/sprite "no_such_sprite" has no frames/);
  });

  it("an addon that shadows a shipped id", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      // `wisp` is one of the game's own monsters.
      "enemies/x/wisp.yaml": enemyYaml("wisp", "wisp"),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(bundle).toBeNull();
    expect(errors.join()).toMatch(/already exist in the base game/);
    // The message has to say how to fix it, not just what is wrong.
    expect(errors.join()).toMatch(/kind: conversion/);
  });

  it("…but a CONVERSION may shadow one, because that is what it is for", () => {
    const dir = scratchMod({
      "mod.yaml": `${MANIFEST}\nkind: conversion\ncampaign: []`,
      "enemies/x/wisp.yaml": enemyYaml("wisp", "wisp"),
    });
    const errors = buildMod(dir, catalog).errors.join();
    expect(errors).not.toMatch(/already exist in the base game/);
  });

  it("a conversion that does not say what its campaign is", () => {
    const dir = scratchMod({
      "mod.yaml": `${MANIFEST}\nkind: conversion`,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(bundle).toBeNull();
    expect(errors.join()).toMatch(/must list its campaign/);
  });

  it("a conversion whose campaign names a level it does not ship", () => {
    const dir = scratchMod({
      "mod.yaml": `${MANIFEST}\nkind: conversion\ncampaign: [ghost-level]`,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /campaign names "ghost-level"/,
    );
  });

  it("a mod that adds nothing at all", () => {
    const dir = scratchMod({ "mod.yaml": MANIFEST });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /at least one level, enemy or item/,
    );
  });

  it("an item that names a base neither the mod nor the game has", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/unique/scratch_relic.yaml": [
        "id: scratch_relic",
        "kind: unique",
        "rarity: unique",
        "name: SCRATCH RELIC",
        "base: no_such_weapon",
        "slot: weapon",
        "ilvl: 10",
        "bonuses: [{ kind: damagePct, value: 0.2 }]",
        "lore: NOTHING.",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/no_such_weapon/);
  });

  it("an item whose icon sprite exists nowhere", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/regular/scratch_blade.yaml": [
        "id: scratch_blade",
        "kind: weapon",
        "rarity: regular",
        "name: SCRATCH BLADE",
        "description: a test blade",
        "class: melee",
        "levelReq: 1",
        "damage: 10",
        "cooldownMs: 300",
        "range: 30",
        "durability: 100",
        "icon: no_such_icon",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/no_such_icon/);
  });

  it("a mod item that authors a grades: ladder it cannot have", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/regular/scratch_blade.yaml": [
        "id: scratch_blade",
        "kind: weapon",
        "rarity: regular",
        "name: SCRATCH BLADE",
        "description: a test blade",
        "class: melee",
        "levelReq: 1",
        "damage: 10",
        "cooldownMs: 300",
        "range: 30",
        "durability: 100",
        "icon: icon_box_cutter",
        "grades:",
        "  exceptional: { id: scratch_blade_ex, name: EX }",
      ].join("\n"),
    });
    const errors = buildMod(dir, catalog).errors.join();
    expect(errors).toMatch(/grades:.* is not available to mods/);
    // It has to say what to do instead, or the author is just stuck.
    expect(errors).toMatch(/their own items/);
  });

  it("an addon that shadows one of the game's own weapons", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/regular/box_cutter.yaml": [
        "id: box_cutter",
        "kind: weapon",
        "rarity: regular",
        "name: NOT THE BOX CUTTER",
        "description: a test blade",
        "class: melee",
        "levelReq: 1",
        "damage: 10",
        "cooldownMs: 300",
        "range: 30",
        "durability: 100",
        "icon: icon_box_cutter",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /already exist in the base game/,
    );
  });

  it("a sprite whose grid does not match its own size", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "scratch_mob"),
      "sprites/x/scratch_mob_0.yaml": [
        "name: scratch_mob_0",
        "size: [4, 2]",
        "description: a test sprite",
        'palette: { a: "#ffffff" }',
        "grid: |",
        "  aaaa",
        "  aa", // one row short of 4 wide
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /width 2, size says 4/,
    );
  });

  it("a level naming an enemy that exists nowhere", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "ladder.yaml":
        "easy:\n  scratch_level: { hero: 5, mob: [1, 5] }\n" +
        "medium:\n  scratch_level: { hero: 5, mob: [1, 5] }\n" +
        "hard:\n  scratch_level: { hero: 5, mob: [1, 5] }\n" +
        "nightmare:\n  scratch_level: { hero: 5, mob: [1, 5] }\n",
      "levels/scratch_level.yaml": [
        "campaign: true",
        "id: scratch_level",
        "index: 90",
        "name: SCRATCH",
        "foes: NOTHING",
        "width: 800",
        "height: 600",
        "gravity: 340",
        "biome: moon",
        "tiles: { ground: { common: moon_0 } }",
        "intro: [[A LINE]]",
        "playerSpawn: { x: 100, y: 100 }",
        "objective: { type: clearAll }",
        "obstacles: []",
        "decor: []",
        "decorClearance: 60",
        "spawns: []",
        "spawners:",
        "  - id: only",
        "    at: { x: 400, y: 300 }",
        "    maxAlive: 6",
        "    ramp: meek",
        "    members:",
        "      - enemy: not_a_real_monster",
        "        count: 5",
        "loot: { weaponPool: [lunar_wrench], gearPool: [bag], abilityPool: [fire_orbs] }",
      ].join("\n"),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(bundle).toBeNull();
    expect(errors.join()).toMatch(/not_a_real_monster/);
  });

  it("a level with no ladder rows to price it", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "levels/scratch_level.yaml": [
        "campaign: true",
        "id: scratch_level",
        "index: 90",
        "name: SCRATCH",
        "foes: NOTHING",
        "width: 800",
        "height: 600",
        "gravity: 340",
        "biome: moon",
        "tiles: { ground: { common: moon_0 } }",
        "intro: [[A LINE]]",
        "playerSpawn: { x: 100, y: 100 }",
        "objective: { type: clearAll }",
        "obstacles: []",
        "decor: []",
        "decorClearance: 60",
        "spawns: []",
        "loot: { weaponPool: [lunar_wrench], gearPool: [bag], abilityPool: [fire_orbs] }",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /missing entry for level "scratch_level"/,
    );
  });
});

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

import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/**
 * A throwaway copy of the worked example with its BLUEPRINT rewritten.
 *
 * A blueprint is the one part of the format that cannot be tested from a
 * three-line scratch file: it needs a level to inherit from, a ladder row to
 * price that level, and a roster to populate the carve. Starting from something
 * that compiles and breaking exactly one line is what makes each failure below
 * name one thing.
 */
function exampleWithMap(
  mutate: (yaml: string) => string,
  { as = "greenhouse" }: { as?: string } = {},
): string {
  const dir = mkdtempSync(path.join(tmpdir(), "gis-mod-"));
  temps.push(dir);
  cpSync(EXAMPLE, dir, { recursive: true });
  const file = path.join(dir, "maps", `${as}.yaml`);
  if (as !== "greenhouse") {
    renameSync(path.join(dir, "maps", "greenhouse.yaml"), file);
  }
  writeFileSync(file, mutate(readFileSync(file, "utf8")));
  return dir;
}

/** A throwaway copy of the worked example with its MANIFEST rewritten — for the
 * checks that need a mod which otherwise compiles clean. */
function exampleWithManifest(mutate: (yaml: string) => string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "gis-mod-"));
  temps.push(dir);
  cpSync(EXAMPLE, dir, { recursive: true });
  const file = path.join(dir, "mod.yaml");
  writeFileSync(file, mutate(readFileSync(file, "utf8")));
  return dir;
}

const MANIFEST = [
  "id: scratch-mod",
  "name: SCRATCH",
  "version: 1.0.0",
  "author: test",
].join("\n");

/** One armor piece of a mod's own SET, parameterized on what tests break. */
const setPieceYaml = (
  id: string,
  slot: string,
  setId: string,
  rarity = "set",
) =>
  [
    `id: ${id}`,
    "kind: unique",
    `rarity: ${rarity}`,
    `name: ${id.toUpperCase()}`,
    "base: mission_cap",
    `slot: ${slot}`,
    "ilvl: 18",
    `setId: ${setId}`,
    "bonuses:",
    "  - kind: maxHp",
    "    value: 20",
    "lore: A TEST PIECE.",
  ].join("\n");

/** A mod's own kit: two pieces, one threshold. */
const setsYaml = (id: string, members: string[], pieces = 2) =>
  [
    "sets:",
    `  ${id}:`,
    `    name: THE ${id.toUpperCase()}`,
    "    weaponClass: melee",
    "    members:",
    ...members.map((m) => `      - ${m}`),
    "    bonuses:",
    `      - pieces: ${pieces}`,
    "        bonuses:",
    "          - { kind: stat, stat: strength, value: 4 }",
  ].join("\n");

/** A mod's own kit, as a whole folder — pieces plus the sets.yaml that owns
 * them, which is the only combination that compiles. */
const setMod = (
  files: Record<string, string> = {},
  members = ["scratch_hood", "scratch_boots"],
) => ({
  "mod.yaml": MANIFEST,
  [`items/set/${members[0]}.yaml`]: setPieceYaml(
    members[0]!,
    "head",
    "scratch_kit",
  ),
  [`items/set/${members[1]}.yaml`]: setPieceYaml(
    members[1]!,
    "feet",
    "scratch_kit",
  ),
  "sets.yaml": setsYaml("scratch_kit", members),
  ...files,
});

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
    expect(Object.keys(bundle!.enemies).sort()).toEqual([
      "greenhouse_creeper",
      "greenhouse_gardener",
    ]);
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
    expect(saw.damage).toBe(26);
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

  it("carries its own sound, and the weapon that names it", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    expect(Object.keys(bundle!.sounds)).toEqual(["greenhouse_saw_swing"]);
    const saw = bundle!.weapons.greenhouse_pruning_saw as { sfx?: string };
    expect(saw.sfx).toBe("greenhouse_saw_swing");
    // Two voices, and they arrive as the synth's own option shapes rather than
    // as anything the page has to interpret.
    const sound = bundle!.sounds.greenhouse_saw_swing as {
      voices: { call: string }[];
    };
    expect(sound.voices.map((v) => v.call)).toEqual(["tone", "noise"]);
  });

  it("carries its own score, and the level that names it", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    expect(Object.keys(bundle!.music)).toEqual(["greenhouse_hymn"]);
    // The level's `music` resolves against BASE ∪ MOD, so a mod may score its
    // own venue without the game having heard of the track.
    const level = bundle!.levels[0] as { music?: string };
    expect(level.music).toBe("greenhouse_hymn");
    // Authored one bar per line, cooked to the flat token stream the
    // sequencer reads — the job `bars()` did when scores were TypeScript.
    const track = bundle!.music.greenhouse_hymn as {
      patterns: Record<string, Record<string, string[]>>;
    };
    expect(track.patterns.green?.pad).toHaveLength(64);
  });

  it("carries its story — the scene, the monologue and the find", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    expect(Object.keys(bundle!.cutscenes)).toEqual(["greenhouse_arrival"]);
    expect(Object.keys(bundle!.thoughts)).toEqual(["greenhouse_creeper_sight"]);
    expect(Object.keys(bundle!.storyItems)).toEqual(["greenhouse_seed_log"]);
    // The level's `prelude` resolves against BASE ∪ MOD, so a mod may open its
    // own venue on its own scene.
    const level = bundle!.levels[0] as {
      prelude?: string;
      firstSightThoughts?: { thought: string }[];
    };
    expect(level.prelude).toBe("greenhouse_arrival");
    expect(level.firstSightThoughts?.[0]?.thought).toBe(
      "greenhouse_creeper_sight",
    );
    // An addon has no business replacing the cap-farm rotation, and the example
    // does not — leaving the shipped mutter alone.
    expect(bundle!.capRotation).toEqual([]);
    // A prop's authored `sprite:` becomes the player's `kind`, and `at` becomes
    // `pos` — the one shape change the loader makes, done here rather than in
    // the page.
    const scene = bundle!.cutscenes.greenhouse_arrival as {
      stage: { props: { kind: string; pos: { x: number; y: number } }[] };
    };
    expect(scene.stage.props.at(-1)).toEqual({
      kind: "ship",
      pos: { x: 196, y: 100 },
    });
  });

  it("carries its own companion, and the elite that recruits her", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    expect(Object.keys(bundle!.companions)).toEqual(["greenhouse_gardener"]);
    // The catalog KEY is the id, stamped in by the loader — the same rule the
    // powers and the thoughts follow, so the YAML never repeats itself.
    const gardener = bundle!.companions.greenhouse_gardener as {
      id: string;
      weapon: string;
      killQuotes: string[];
    };
    expect(gardener.id).toBe("greenhouse_gardener");
    // Her signature weapon is one this MOD ships — the cross-ref that only
    // works because the refs are BASE ∪ MOD.
    expect(gardener.weapon).toBe("greenhouse_pruning_saw");
    expect(gardener.killQuotes.length).toBeGreaterThan(0);
    // And the elite's `spareable` resolves to her, which is the whole beat: a
    // mod's monster, spared, becomes a mod's ally. Before companions were
    // loadable it could only ever have named one of the shipped four.
    const elite = bundle!.enemies.greenhouse_gardener as {
      spareable?: { companion: string };
    };
    expect(elite.spareable?.companion).toBe("greenhouse_gardener");
  });

  it("carries a blueprint, so its venue is carved rather than hand-drawn", () => {
    const { bundle } = buildMod(EXAMPLE, catalog);
    // Keyed by the level it carves — exactly the shape `registerDefs` takes.
    expect(Object.keys(bundle!.blueprints)).toEqual(["greenhouse"]);
    const bp = bundle!.blueprints.greenhouse as {
      level: string;
      horde: { ramps: number[][][] };
      boss: { level: number[]; hp: number[]; regions: string[] };
    };
    expect(bp.level).toBe("greenhouse");
    // The authoring-only `ramp` names are gone, expanded against the SHIPPED
    // ladder into the four [easy, medium, hard, nightmare] tuples the engine
    // reads — against the band the mod's own ladder.yaml prices its venue at.
    expect(bp.horde.ramps).toHaveLength(4);
    expect(bp.boss.level).toHaveLength(4);
    expect(bp.boss.hp).toHaveLength(4);
    expect(bp.boss.regions).toContain("northeast");
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

  it("a mod's own KIT, and the green pieces that belong to it", () => {
    const { bundle, errors } = buildMod(scratchMod(setMod()), catalog);
    expect(errors).toEqual([]);
    expect(Object.keys(bundle!.sets)).toEqual(["scratch_kit"]);
    const kit = bundle!.sets.scratch_kit as {
      id: string;
      members: string[];
      bonuses: { pieces: number }[];
    };
    // The catalog KEY is the id, stamped in by the loader — the rule every
    // single-file catalog here follows.
    expect(kit.id).toBe("scratch_kit");
    expect(kit.members).toEqual(["scratch_hood", "scratch_boots"]);
    expect(kit.bonuses[0]?.pieces).toBe(2);
    // The pieces themselves compile as uniques at the `set` tier, which is what
    // colours them green and what the set block on the card reads.
    const hood = bundle!.uniques.scratch_hood as {
      tier: string;
      setId: string;
    };
    expect(hood.tier).toBe("set");
    expect(hood.setId).toBe("scratch_kit");
  });

  it("a mod's own weapon, flaring its own element", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/unique/scratch_blade.yaml": [
        "id: scratch_blade",
        "kind: unique",
        "rarity: unique",
        "name: SCRATCH BLADE",
        "base: medieval_sword",
        "slot: weapon",
        "ilvl: 18",
        "bonuses: []",
        "lore: A TEST BLADE.",
        "fx:",
        "  element: void",
        "  weight: 1.2",
      ].join("\n"),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(errors).toEqual([]);
    // It travels on the def, so the renderer resolves it exactly as it does a
    // shipped weapon's — this is the whole feature.
    expect(
      (bundle!.uniques.scratch_blade as { fx?: Record<string, unknown> }).fx,
    ).toEqual({ element: "void", weight: 1.2 });
  });

  it("a mod's own name for the difficulty ladder's rungs", () => {
    const dir = scratchMod(
      setMod({
        "difficulties.yaml": [
          "difficulties:",
          "  jesus:",
          "    name: THE LONG NIGHT",
          "    tagline: NOTHING SURVIVES IT",
          "  easy:",
          "    tagline: A QUIET SHIFT",
        ].join("\n"),
      }),
    );
    const { bundle, errors } = buildMod(dir, catalog);
    expect(errors).toEqual([]);
    expect(bundle!.difficulties).toEqual({
      jesus: { name: "THE LONG NIGHT", tagline: "NOTHING SURVIVES IT" },
      // A rung may be given a new blurb and keep its name — the page folds
      // each field on separately rather than replacing the rung.
      easy: { tagline: "A QUIET SHIFT" },
    });
  });

  it("…and a CONVERSION may bring its own name for the game", () => {
    const dir = exampleWithManifest((yaml) =>
      yaml.replace(
        "kind: addon",
        [
          "kind: conversion",
          "campaign: [greenhouse]",
          "brand:",
          "  title: HOLLOW STATION",
          "  tagline: NOBODY ANSWERS",
        ].join("\n"),
      ),
    );
    const { bundle, errors } = buildMod(dir, catalog);
    expect(errors).toEqual([]);
    expect(bundle!.brand).toEqual({
      title: "HOLLOW STATION",
      tagline: "NOBODY ANSWERS",
    });
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

  it("a blueprint whose boss hides in a direction nobody can parse", () => {
    // The desktop app has no engine to parse a region with, so the compiler
    // checks against the names the engine's OWN parser accepts, snapshotted
    // into the catalog. Without it a typo relocates the boss silently.
    const dir = exampleWithMap((yaml) =>
      yaml.replace("- northeast", "- northeastward"),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /unknown compass region "northeastward"/,
    );
  });

  it("a blueprint whose horde names a monster nobody ships", () => {
    const dir = exampleWithMap((yaml) =>
      yaml.replace("enemy: greenhouse_creeper", "enemy: no_such_mob"),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /unknown enemy "no_such_mob"/,
    );
  });

  it("an ADDON whose blueprint would re-carve a shipped venue", () => {
    // A blueprint carves the level it is NAMED AFTER, so `maps/moon.yaml` in an
    // addon is not a new map — it is somebody else's map, re-cut.
    const dir = exampleWithMap(
      (yaml) =>
        yaml.replace(
          "id: greenhouse\nlevel: greenhouse",
          "id: moon\nlevel: moon",
        ),
      { as: "moon" },
    );
    const errors = buildMod(dir, catalog).errors.join();
    expect(errors).toMatch(/is not a level this mod ships/);
    // Again: the message says how to do the thing they were trying to do.
    expect(errors).toMatch(/kind: conversion/);
  });

  it("…but a CONVERSION may re-carve one, because that is what it is for", () => {
    const dir = exampleWithMap(
      (yaml) =>
        yaml.replace(
          "id: greenhouse\nlevel: greenhouse",
          "id: moon\nlevel: moon",
        ),
      { as: "moon" },
    );
    const manifest = path.join(dir, "mod.yaml");
    writeFileSync(
      manifest,
      `${readFileSync(manifest, "utf8")}\ncampaign: [greenhouse]\n`.replace(
        "kind: addon",
        "kind: conversion",
      ),
    );
    const { bundle, errors } = buildMod(dir, catalog);
    expect(errors).toEqual([]);
    expect(Object.keys(bundle!.blueprints)).toEqual(["moon"]);
  });

  it("a blueprint whose file name and id disagree", () => {
    const dir = exampleWithMap((yaml) =>
      yaml.replace("id: greenhouse", "id: nursery"),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /id is "nursery", expected "greenhouse"/,
    );
  });

  it("an ADDON that tries to rename the whole game", () => {
    const dir = scratchMod({
      "mod.yaml": `${MANIFEST}\nbrand:\n  title: NOT THIS GAME`,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /only a conversion may set `brand:`/,
    );
  });

  it("a brand written in letters the pixel font cannot draw", () => {
    // The silent one, and the worst place for it: `PixelText` falls back to
    // "?" for a glyph the atlas has no cell for, so this renders as
    // "H?LLSTR?M" at 3× size across the top of the author's own front page.
    const dir = scratchMod({
      "mod.yaml": `${MANIFEST}\nkind: conversion\ncampaign: []\nbrand:\n  title: HÄLLSTRÖM`,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
    });
    const errors = buildMod(dir, catalog).errors.join();
    expect(errors).toMatch(/pixel font cannot draw/);
    // It names the character, because "some character is wrong" in a string
    // the author can see nothing wrong with is not an actionable error.
    expect(errors).toMatch(/"Ä"/);
    // Ö IS in the font (the game ships a Swedish glyph), so it must not be
    // reported — a check that over-reports is one authors learn to ignore.
    expect(errors).not.toMatch(/"Ö"/);
  });

  it("a mod that ships its own title menu", () => {
    // The one refusal here that is about SECURITY rather than correctness. The
    // menu tree decides which screens exist at all, so a mod allowed to replace
    // it could give itself the hidden DEVELOPER tree — the level warp, the
    // balance multipliers, the coin grant — on a shipped store build. A
    // conversion may rename the game on the title screen; neither kind may
    // rebuild the menu under it.
    for (const kind of ["", "\nkind: conversion\ncampaign: []"]) {
      const dir = scratchMod({
        "mod.yaml": `${MANIFEST}${kind}`,
        "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
        "mainmenu.yaml": "screens:\n  main:\n    rows: []\n",
      });
      expect(buildMod(dir, catalog).errors.join()).toMatch(
        /the title menu is the game's own chrome/,
      );
    }
  });

  it("a brand too long to stay readable on a phone", () => {
    const dir = scratchMod({
      "mod.yaml": `${MANIFEST}\nkind: conversion\ncampaign: []\nbrand:\n  title: ${"A".repeat(40)}`,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/keep it to 28/);
  });

  it("a weapon whose signature names an element nothing draws", () => {
    // The elements are the game's palette — a kit is pixels this app draws — so
    // an unknown name is a legendary that silently swings the plain look.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/unique/scratch_blade.yaml": [
        "id: scratch_blade",
        "kind: unique",
        "rarity: unique",
        "name: SCRATCH BLADE",
        "base: medieval_sword",
        "slot: weapon",
        "ilvl: 18",
        "bonuses: []",
        "lore: A TEST BLADE.",
        "fx:",
        "  element: banana",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /fx.element "banana" is not one of the game's elements/,
    );
  });

  it("a signature on a piece of armor, which draws nowhere", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/unique/scratch_hat.yaml": [
        "id: scratch_hat",
        "kind: unique",
        "rarity: unique",
        "name: SCRATCH HAT",
        "base: mission_cap",
        "slot: head",
        "ilvl: 18",
        "bonuses: []",
        "lore: A TEST HAT.",
        "fx:",
        "  element: fire",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /fx is a WEAPON's signature look/,
    );
  });

  it("a set piece with no kit to belong to", () => {
    // A mod could already ship `rarity: set` items; before sets were authorable
    // the pieces belonged to nothing and quietly granted nothing.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/set/scratch_hood.yaml": setPieceYaml(
        "scratch_hood",
        "head",
        "scratch_kit",
      ),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/belongs to no set/);
  });

  it("a kit claiming a piece that is not green", () => {
    // The piece is a plain UNIQUE (its directory says so, and the item loader
    // holds the two to each other). Claimed by a kit it would be minted and
    // coloured as a unique while quietly paying set bonuses nothing on its
    // card explains.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "items/set/scratch_hood.yaml": setPieceYaml(
        "scratch_hood",
        "head",
        "scratch_kit",
      ),
      "items/unique/scratch_boots.yaml": setPieceYaml(
        "scratch_boots",
        "feet",
        "scratch_kit",
        "unique",
      ),
      "sets.yaml": setsYaml("scratch_kit", ["scratch_hood", "scratch_boots"]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /is rarity unique, not set/,
    );
  });

  it("a kit with two pieces for the same slot", () => {
    // Only one of them can ever be worn, so the full-set bonus is unreachable.
    const dir = scratchMod(
      setMod({
        "items/set/scratch_boots.yaml": setPieceYaml(
          "scratch_boots",
          "head",
          "scratch_kit",
        ),
      }),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(/two "head" pieces/);
  });

  it("a kit and a piece that disagree about which set it is in", () => {
    const dir = scratchMod(
      setMod({
        "items/set/scratch_boots.yaml": setPieceYaml(
          "scratch_boots",
          "feet",
          "some_other_kit",
        ),
      }),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /points at set "some_other_kit"/,
    );
  });

  it("a bonus threshold the kit can never reach", () => {
    const dir = scratchMod(
      setMod({
        "sets.yaml": setsYaml(
          "scratch_kit",
          ["scratch_hood", "scratch_boots"],
          4,
        ),
      }),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(/can never be earned/);
  });

  it("a kit claiming one of the GAME's own pieces", () => {
    // A shipped piece carries a shipped `setId` a mod cannot edit, so this
    // would compile into exactly the mismatch the schema exists to catch.
    const dir = scratchMod(
      setMod({
        "sets.yaml": setsYaml("scratch_kit", [
          "scratch_hood",
          "whiskerweave_hood",
        ]),
      }),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /unknown member "whiskerweave_hood"/,
    );
  });

  it("an addon that shadows one of the game's own kits", () => {
    const dir = scratchMod(
      setMod({
        "sets.yaml": setsYaml("scavengers_hide", [
          "scratch_hood",
          "scratch_boots",
        ]),
        "items/set/scratch_hood.yaml": setPieceYaml(
          "scratch_hood",
          "head",
          "scavengers_hide",
        ),
        "items/set/scratch_boots.yaml": setPieceYaml(
          "scratch_boots",
          "feet",
          "scavengers_hide",
        ),
      }),
    );
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /already exist in the base game/,
    );
  });

  it("a difficulty rung the game does not have", () => {
    // A mod renames the ladder's rungs; it cannot add one. The length of the
    // ladder is baked into the unlock chain, the per-map ladder cells and the
    // four-tuple every level compiles its ramps into, so an unknown key here
    // would silently do nothing at all.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
      "difficulties.yaml": "difficulties:\n  impossible:\n    name: NO",
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /is not one of the game's rungs/,
    );
  });

  it("a difficulty tuned rather than renamed", () => {
    // The rung's NUMBERS are one economy with content/ladder.yaml, which prices
    // every venue — the shipped ones included — against them.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
      "difficulties.yaml": [
        "difficulties:",
        "  easy:",
        "    name: A QUIET SHIFT",
        "    enemyHpMult: 0.1",
      ].join("\n"),
    });
    const errors = buildMod(dir, catalog).errors.join();
    expect(errors).toMatch(/unknown field "enemyHpMult"/);
    expect(errors).toMatch(/the numbers are the game's economy/);
  });

  it("a rung renamed in letters the pixel font cannot draw", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "enemies/x/scratch_mob.yaml": enemyYaml("scratch_mob", "wisp"),
      "difficulties.yaml": "difficulties:\n  hard:\n    name: BRÜTAL",
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /pixel font cannot draw/,
    );
  });

  it("a weapon naming a sound that exists nowhere", () => {
    // The silent one: an unresolvable `sfx` falls back to the class sound at
    // play time, so without this check a modder's sound simply never plays and
    // nothing anywhere says why.
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
        "sfx: no_such_sound",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /sfx "no_such_sound" is not a sound/,
    );
  });

  it("a sound with no voices", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "sounds/scratch_noise.yaml": [
        "id: scratch_noise",
        "description: nothing at all",
        "voices: []",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/at least one voice/);
  });

  it("a sound answering an event the game never emits", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "sounds/scratch_noise.yaml": [
        "id: scratch_noise",
        "description: a test sound",
        "on:",
        "  type: theHeroSneezed",
        "voices:",
        "  - call: tone",
        "    from: 440",
        "    durationMs: 50",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /not an event the game emits/,
    );
  });

  it("an addon that shadows one of the game's own sounds", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "sounds/ui_confirm.yaml": [
        "id: ui_confirm",
        "description: a louder confirm",
        "voices:",
        "  - call: tone",
        "    from: 440",
        "    durationMs: 50",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /already exist in the base game/,
    );
  });

  it("a track whose pitched voice is given a drum hit", () => {
    // "x" under a lead reaches `noteFrequency`, which throws — mid-run, on
    // the player's machine, in whichever bar it is in. It is the exact class
    // of failure lifting the scores to content was for.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "music/scratch_song.yaml": [
        "id: scratch_song",
        "name: SCRATCH SONG",
        "description: a test score",
        "bpm: 100",
        "stepsPerBeat: 4",
        "instruments:",
        "  lead: { wave: sine, volume: 0.03 }",
        "patterns:",
        "  a:",
        "    lead: |",
        "      C4 .  .  .  x  .  .  .  .  .  .  .  .  .  .  .",
        "order: [a]",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/"x" is not a note/);
  });

  it("a track whose order names a pattern nobody wrote", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "music/scratch_song.yaml": [
        "id: scratch_song",
        "name: SCRATCH SONG",
        "description: a test score",
        "bpm: 100",
        "stepsPerBeat: 4",
        "instruments:",
        "  lead: { wave: sine, volume: 0.03 }",
        "patterns:",
        "  a:",
        "    lead: |",
        "      C4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "order: [a, chorus]",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /order names unknown pattern "chorus"/,
    );
  });

  it("an addon that shadows one of the game's own tracks", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "music/title.yaml": [
        "id: title",
        "name: MY TITLE THEME",
        "description: a test score",
        "bpm: 100",
        "stepsPerBeat: 4",
        "instruments:",
        "  lead: { wave: sine, volume: 0.03 }",
        "patterns:",
        "  a:",
        "    lead: |",
        "      C4 .  .  .  .  .  .  .  .  .  .  .  .  .  .  .",
        "order: [a]",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /already exist in the base game/,
    );
  });

  it("two of a mod's own sounds answering one event shape", () => {
    // Both are valid on their own; which one plays would come down to
    // readdir order. The shipped pipeline refuses this, so the mod compiler
    // has to as well — same schema, same rules, same answer.
    const voice = [
      "voices:",
      "  - call: tone",
      "    from: 440",
      "    durationMs: 50",
    ];
    const sound = (id: string) =>
      [
        `id: ${id}`,
        "description: a test sound",
        "on:",
        "  type: enemyKilled",
        "  crit: true",
        ...voice,
      ].join("\n");
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "sounds/scratch_boom.yaml": sound("scratch_boom"),
      "sounds/scratch_crack.yaml": sound("scratch_crack"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /both answer enemyKilled\|\|true\|\| — one event shape, one sound/,
    );
  });

  it("a mod that adds nothing at all", () => {
    const dir = scratchMod({ "mod.yaml": MANIFEST });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /at least one level, map blueprint, enemy, item, sound, track, powerup, talent, companion/,
    );
  });

  it("a scene whose prop names a sprite nothing answers to", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "cutscenes/scratch_scene.yaml": [
        "id: scratch_scene",
        "stage:",
        "  width: 224",
        "  height: 126",
        "  backdrop: space",
        "  props:",
        "    - { sprite: no_such_thing, at: { x: 10, y: 10 } }",
        "beats:",
        "  - { kind: wait, ms: 100 }",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /no_such_thing" is not a sprite/,
    );
  });

  it("a beat that talks to somebody who is not in the cast", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "cutscenes/scratch_scene.yaml": [
        "id: scratch_scene",
        "stage: { width: 224, height: 126, backdrop: space, props: [] }",
        "actors:",
        "  - { id: hero, sprite: hero_suit, at: { x: 40, y: 100 } }",
        "beats:",
        "  - { kind: say, actor: ada, text: [HELLO?] }",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /"ada" is not in the cast/,
    );
  });

  it("a variant keyed on something that is not a difficulty", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "cutscenes/scratch_scene.yaml": [
        "id: scratch_scene",
        "stage: { width: 224, height: 126, backdrop: space, props: [] }",
        "beats:",
        "  - { label: opener, kind: caption, text: [A BEGINNING.] }",
        "variants:",
        "  ultra:",
        "    opener: { text: [A HARDER BEGINNING.] }",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /"ultra" is not a difficulty/,
    );
  });

  it("a variant patching a label the scene does not carry", () => {
    // The LOADER resolves labels (expanding them is its job), so this one is
    // reported as a tree error rather than a schema one — and it still names the
    // file, the variant and the labels that do exist.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "cutscenes/scratch_scene.yaml": [
        "id: scratch_scene",
        "stage: { width: 224, height: 126, backdrop: space, props: [] }",
        "beats:",
        "  - { label: opener, kind: caption, text: [A BEGINNING.] }",
        "variants:",
        "  jesus:",
        "    closer: { text: [NO SUCH PART.] }",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /no part labelled "closer"/,
    );
  });

  it("an addon that shadows the game's own prelude", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "cutscenes/prelude.yaml": [
        "id: prelude",
        "stage: { width: 224, height: 126, backdrop: space, props: [] }",
        "beats:",
        "  - { kind: caption, text: [A DIFFERENT NIGHT.] }",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /already exist in the base game: cutscene "prelude"/,
    );
  });

  it("a cap rotation naming a thought the mod does not ship", () => {
    // A mod's rotation REPLACES the game's, so a shipped id in it is a line the
    // mod does not own — and one that would vanish the moment it is played
    // beside a conversion that dropped it.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "thoughts.yaml": [
        "thoughts:",
        "  scratch_mutter:",
        "    speaker: ME",
        "    portrait: hero_suit",
        "    pages:",
        "      - - NOTHING LEFT HERE.",
        "capRotation:",
        "  - cap_pathetic_1",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /capRotation names "cap_pathetic_1", which is not a thought/,
    );
  });

  it("…but NOT a mod whose only content is story, which is a mod", () => {
    // The counterpart to "adds nothing": a mod may be nothing but writing. A
    // conversion re-scripting the shipped campaign's monologues ships no level,
    // no monster and no art at all, and refusing it would be the compiler
    // deciding what a mod is allowed to be about.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "thoughts.yaml": [
        "thoughts:",
        "  scratch_read:",
        "    speaker: ME",
        "    portrait: hero_suit",
        "    pages:",
        "      - - SO THAT IS WHAT THIS IS.",
      ].join("\n"),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(errors).toEqual([]);
    expect(Object.keys(bundle!.thoughts)).toEqual(["scratch_read"]);
  });

  /** A minimal valid companion, parameterized on what each test breaks. */
  const companionYaml = (lines: string[]) =>
    ["companions:", "  scratch_ally:", ...lines].join("\n");

  const VALID_ALLY = [
    "    name: SCRATCH ALLY",
    "    sprite: wisp",
    "    hp: 120",
    "    speed: 80",
    "    radius: 12",
    "    weapon: blaster",
    "    killQuotes: [DONE.]",
  ];

  it("a companion whose sprite family has no frames — the silent one", () => {
    // The same failure as the enemy sprite check, and just as invisible: the
    // renderer skips a name `spriteByName` answers nothing to, so a spared ally
    // walks beside the hero as empty floor.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "companions.yaml": companionYaml(
        VALID_ALLY.map((l) =>
          l.includes("sprite:") ? "    sprite: scratch_nobody" : l,
        ),
      ),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /sprite "scratch_nobody" has no frames/,
    );
  });

  it("a companion whose signature weapon exists nowhere", () => {
    // Worse than silent: the weapon is minted the instant she joins, so an
    // unknown id throws in the middle of the scene where the player just chose
    // to spare somebody.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "companions.yaml": companionYaml(
        VALID_ALLY.map((l) =>
          l.includes("weapon:") ? "    weapon: scratch_nothing" : l,
        ),
      ),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /weapon "scratch_nothing" is not a weapon/,
    );
  });

  it("a power that grows a kit the companion has not got", () => {
    // The one check that is about NOTHING happening. Nova growth is applied on
    // top of a `nova:` block, so on a companion without one every rank-up adds
    // nothing at all — forever, with no error at play time to explain it.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "companions.yaml": companionYaml([
        ...VALID_ALLY,
        "    power:",
        "      name: DEEP FROST",
        "      blurb: WIDENS EACH RANK",
        "      everyLevels: 3",
        "      novaRadiusPerRank: 10",
      ]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /grows a `nova:` this companion has not got/,
    );
  });

  it("a power that grows nothing at all", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "companions.yaml": companionYaml([
        ...VALID_ALLY,
        "    power:",
        "      name: A NAME",
        "      blurb: AND NO EFFECT",
        "      everyLevels: 3",
      ]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(/power grows nothing/);
  });

  /** A minimal valid talent, parameterized on what each test breaks. */
  const talentYaml = (lines: string[]) =>
    ["talents:", "  scratch_talent:", ...lines].join("\n");

  /** Everything a talent owes BUT its effect — each case below adds the one
   * thing it is about, so a failure names that thing and not a missing field.
   * The icon is a shipped glyph for the same reason. */
  const VALID_TALENT = [
    "    name: SCRATCH TALENT",
    "    tree: melee",
    "    kind: tank",
    "    maxRank: 5",
    "    blurb: A SCRATCH PASSIVE.",
    "    icon: icon_talent_bulwark",
  ];

  it("a talent that carries neither a slope nor a proc — the silent one", () => {
    // The one content bug this format can produce in total silence: the picker
    // offers the card, the player spends a point, and every rank buys nothing
    // for the rest of the campaign.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": talentYaml([
        "    name: A NAME",
        "    blurb: AND NO EFFECT",
      ]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /carries neither an `effect:` slope nor a proc block/,
    );
  });

  it("a talent whose slope nothing reads", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": talentYaml([
        ...VALID_TALENT,
        "    effect:",
        "      luckPerRank: 0.05",
      ]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /unknown field "effect.luckPerRank" — nothing reads it/,
    );
  });

  it("a talent whose proc block is missing a field the hook reads", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": talentYaml([
        ...VALID_TALENT,
        "    parry:",
        "      chancePerRank: 0.06",
        "      chanceCap: 0.4",
      ]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /parry.riposteFrac is required/,
    );
  });

  it("a talent with no picker glyph", () => {
    // Silent at play time: the picker draws a blank card in the one screen the
    // player has to choose from.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": [
        "talents:",
        "  scratch_nobody:",
        ...VALID_TALENT.filter((l) => !l.includes("icon:")),
        "    effect:",
        "      maxHpPerRank: 0.05",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /no picker icon — draw sprites\/icons\/icon_talent_scratch_nobody.yaml/,
    );
  });

  it("a talent ranked deeper than the shared ceiling", () => {
    // The rank cap is ECONOMY: the picker draws that many pips and the point
    // milestones are priced against a full tree.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": talentYaml([
        ...VALID_TALENT.map((l) =>
          l.includes("maxRank:") ? "    maxRank: 9" : l,
        ),
        "    effect:",
        "      maxHpPerRank: 0.05",
      ]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /maxRank 9 exceeds the shared cap 5/,
    );
  });

  it("an addon that carries a proc the shipped catalog already has", () => {
    // BASE ∪ MOD: two carriers would make "whose numbers apply" a question
    // about catalog order, which is not a decision anybody made. Re-carrying a
    // proc means REPLACING the talent that has it — a conversion's business.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": talentYaml([
        ...VALID_TALENT,
        "    parry:",
        "      chancePerRank: 0.06",
        "      chanceCap: 0.4",
        "      riposteFrac: 0.5",
        "      riposteRank: 5",
      ]),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /talents "parry" and "scratch_talent" both carry the "parry" proc/,
    );
  });

  it("an addon that shadows one of the game's own talents", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": [
        "talents:",
        "  bulwark:",
        ...VALID_TALENT,
        "    effect:",
        "      maxHpPerRank: 0.05",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /already exist in the base game: talent "bulwark"/,
    );
  });

  it("…but NOT a mod whose only content is a talent, which is a mod", () => {
    // A mod may be nothing but one new passive — an addon that adds a single
    // talent to the melee tree is a real, small mod.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "talents.yaml": talentYaml([
        ...VALID_TALENT,
        "    effect:",
        "      maxHpPerRank: 0.05",
      ]),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(errors).toEqual([]);
    expect(Object.keys(bundle!.talents)).toEqual(["scratch_talent"]);
  });

  it("an addon that shadows one of the game's own companions", () => {
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "companions.yaml": ["companions:", "  lucky:", ...VALID_ALLY].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /already exist in the base game: companion "lucky"/,
    );
  });

  it("…but NOT a mod whose only content is a companion, which is a mod", () => {
    // A mod may be nothing but a recruit — an addon that hands the player one
    // new ally off a shipped elite is a real, small mod.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      "companions.yaml": companionYaml(VALID_ALLY),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(errors).toEqual([]);
    expect(Object.keys(bundle!.companions)).toEqual(["scratch_ally"]);
  });

  it("lets a mod's elite spare into a SHIPPED companion", () => {
    // The other direction of base ∪ mod: an addon need not author a roster to
    // use one. Its monster may hand the player Tesla.
    const dir = scratchMod({
      "mod.yaml": MANIFEST,
      // `enemyYaml` is deliberately incomplete (the negative cases only ever
      // assert on ONE error), so this fills in what a def actually owes.
      "enemies/x/scratch_elite.yaml": [
        enemyYaml("scratch_elite", "wisp"),
        "lore: >-",
        "  A thing that was here before any of this, and has been waiting",
        "  patiently for somebody to walk past it close enough to reach.",
        "ai:",
        "  aggroRadius: 250",
        "spareable:",
        "  companion: nikola_tesla",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors).toEqual([]);
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

  it("a MISSION that draws its own map", () => {
    // A level is a mission now: the walls, the props and the horde are carved
    // per run from `maps/<id>.yaml`, so a mission that authors any of them is
    // refused BY NAME rather than ignored — an author who drew a wall, ran the
    // game and saw no wall would otherwise have nothing at all to read.
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
        "gravity: 340",
        "biome: moon",
        "tiles: { ground: { common: moon_0 } }",
        "intro: [[A LINE]]",
        "objective: { type: clearAll }",
        "decorClearance: 60",
        "loot: { weaponPool: [lunar_wrench], gearPool: [bag], abilityPool: [fire_orbs] }",
        "width: 800",
        "height: 600",
        "playerSpawn: { x: 100, y: 100 }",
      ].join("\n"),
    });
    const { bundle, errors } = buildMod(dir, catalog);
    expect(bundle).toBeNull();
    // Each one names where it went.
    expect(errors.join()).toMatch(/"width" is the map's/);
    expect(errors.join()).toMatch(/`sizes` in the blueprint/);
    expect(errors.join()).toMatch(/"playerSpawn" is the map's/);
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
        "gravity: 340",
        "biome: moon",
        "tiles: { ground: { common: moon_0 } }",
        "intro: [[A LINE]]",
        "objective: { type: clearAll }",
        "decorClearance: 60",
        "loot: { weaponPool: [lunar_wrench], gearPool: [bag], abilityPool: [fire_orbs] }",
      ].join("\n"),
    });
    expect(buildMod(dir, catalog).errors.join()).toMatch(
      /missing entry for level "scratch_level"/,
    );
  });
});

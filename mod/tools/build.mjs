// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// THE MOD COMPILER — a mod folder of YAML in, one validated JSON bundle out.
//
// This is the whole of what makes a mod safe to load: the game NEVER interprets
// a mod's YAML at runtime. The compiler reads it once — in the desktop shell's
// main process, or on a modder's machine via the CLI — validates every def
// against the SAME schema the shipped campaign goes through, and emits a
// `mod.json` bundle of plain data. The page then only ever sees JSON that has
// already been checked, which is what lets the renderer stay sandboxed with no
// filesystem and no YAML parser in it.
//
// Three rules hold the format together:
//
//  1. **A mod's content is authored exactly like the game's.** A mod's level is
//     a `content/levels/<id>.yaml` file, its enemy a
//     `content/enemies/<biome>/<id>.yaml` file, its companion a
//     `content/companions.yaml` entry, its sprite a
//     `content/sprites/<family>/<name>.yaml` file — same keys, same schema,
//     same validator. That is why the loaders take a directory (see
//     `scripts/*-data/load-yaml.mjs`): "it works in my mod" and "it works in
//     the game" have to mean the same thing, and they only do if there is one
//     schema rather than a second, friendlier one that drifts.
//  2. **Cross-references resolve against BASE ∪ MOD.** A mod's level may name a
//     shipped enemy, its own new enemy, or both, and an unknown id is an error
//     at COMPILE time with a file and a line — never a blank sprite or a
//     missing monster at play time.
//  3. **A mod may change the RULES, and only inside a sandbox.** A bundle is
//     data (defs, sprites as raw pixels) plus `scripts:` — the Lua a mod may
//     ship to replace a shipped formula (`content/scripts/*.lua`). That is a
//     stranger's code, so it never leaves the box the engine puts it in: the
//     VM has no io, no os, no require, no load, no clock and no randomness, it
//     sees only the read-only views the host installs, and every call is
//     metered so a runaway loop dies instead of hanging the game. The compiler
//     PARSES every script here, with the game's own interpreter, so a broken
//     one fails on the author's machine rather than in a player's run.
//     → docs/scripting.md
//
// See mod/README.md for the authoring guide and mod/FORMAT.md for the
// reference.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { validateAnimations } from "../../scripts/asset-tools/animation-schema.mjs";
import { validateCompanion } from "../../scripts/asset-tools/companion-schema.mjs";
import { validateDifficultyVoice } from "../../scripts/asset-tools/difficulty-schema.mjs";
import { validateEnemy } from "../../scripts/asset-tools/enemy-schema.mjs";
import { validateItem } from "../../scripts/asset-tools/item-schema.mjs";
import { validateLevel } from "../../scripts/asset-tools/level-schema.mjs";
import { validateMap } from "../../scripts/asset-tools/map-schema.mjs";
import { validateTrack } from "../../scripts/asset-tools/music-schema.mjs";
import { validatePowerup } from "../../scripts/asset-tools/powerup-schema.mjs";
import { validateSet } from "../../scripts/asset-tools/set-schema.mjs";
import {
  validateHudCatalog,
  validateHudElement,
  validateHudEvents,
  validateHudRegions,
} from "../../scripts/asset-tools/hud-schema.mjs";
import {
  validateMenu,
  validateMenuElement,
} from "../../scripts/asset-tools/ingame-menu-schema.mjs";
import { validateSound } from "../../scripts/asset-tools/sound-schema.mjs";
import {
  moduleExports,
  validateScript,
} from "../../scripts/asset-tools/script-schema.mjs";
import { validateSprite } from "../../scripts/asset-tools/sprite-schema.mjs";
import {
  validateTalent,
  validateTalentCatalog,
} from "../../scripts/asset-tools/talent-schema.mjs";
import {
  validateCapRotation,
  validateCutscene,
  validateStoryItem,
  validateThought,
} from "../../scripts/asset-tools/story-schema.mjs";
import {
  validateQuest,
  validateQuestCatalog,
  validateQuestGiver,
} from "../../scripts/asset-tools/quest-schema.mjs";
import { glyphProblem } from "../../scripts/asset-tools/glyphs.mjs";
import { hexToRgba } from "../../scripts/asset-tools/sprite-yaml.mjs";
import { loadCompanions } from "../../scripts/companion-data/load-yaml.mjs";
import { loadDifficultyVoices } from "../../scripts/difficulty-data/load-yaml.mjs";
import { loadEnemies } from "../../scripts/enemy-data/load-yaml.mjs";
import {
  baseDef,
  splitItems,
  toRecord,
  uniqueDef,
} from "../../scripts/item-data/compile.mjs";
import { loadItems } from "../../scripts/item-data/load-yaml.mjs";
import { loadLadder } from "../../scripts/level-data/ladder.mjs";
import { loadLevels } from "../../scripts/level-data/load-yaml.mjs";
import { loadMaps } from "../../scripts/map-data/load-yaml.mjs";
import { cookTrack, loadMusic } from "../../scripts/music-data/load-yaml.mjs";
import { loadPowerups } from "../../scripts/powerup-data/load-yaml.mjs";
import { loadScripts } from "../../scripts/script-data/load-lua.mjs";
import { loadSets } from "../../scripts/set-data/load-yaml.mjs";
import { loadHud } from "../../scripts/hud-data/load-yaml.mjs";
import { loadMenus } from "../../scripts/menu-data/load-ingame-yaml.mjs";
import { loadSounds } from "../../scripts/sound-data/load-yaml.mjs";
import { loadTalents } from "../../scripts/talent-data/load-yaml.mjs";
import {
  loadCutscenes,
  loadStoryItems,
  loadThoughts,
} from "../../scripts/story-data/load-yaml.mjs";
import {
  loadQuestGivers,
  loadQuests,
} from "../../scripts/quest-data/load-yaml.mjs";

// WHAT A MOD FOLDER MAY HOLD lives in one place, and the compiler reads the
// audio extensions from it rather than repeating them — the validator refusing
// a file the compiler is about to load is the exact failure that module exists
// to prevent.
import { SAMPLE_EXTS, sampleStem, sampleTake } from "./layout.mjs";
import { decodePng, isPng, MAX_PNG_SIDE } from "./png.mjs";

/**
 * The bundle format the game loads. Bumped on a breaking change so an old
 * build refuses a new bundle loudly instead of half-reading it.
 *
 * 2 — a recording became a CLIP with one or more TAKES (`samples[].takes`,
 * where there was a single `data`), and a recording's routing became an
 * ordinary sound def with a `call: sample` voice rather than a parallel bank
 * consulted ahead of the catalog. Costless to bump: the shell COMPILES every
 * mod from its folder on load (`electron/src/mods.ts`), so the bundle is a
 * wire between two halves of one build rather than anything on disk — no
 * published mod needs rebuilding by its author.
 */
export const BUNDLE_FORMAT = 2;

/** A mod id: lowercase, url-safe, and long enough to not collide by accident.
 * It namespaces nothing by itself — see `checkIds` — but it IS the folder name
 * a Workshop item unpacks into and the key the game remembers a mod by. */
const MOD_ID = /^[a-z][a-z0-9-]{2,31}$/;

const KINDS = new Set(["addon", "conversion"]);

/**
 * Compile a mod directory.
 *
 * @param modDir  the folder holding `mod.yaml`
 * @param catalog the parsed `mod/catalog.json` — every id the base game ships
 * @returns `{ bundle, errors, warnings }`. `bundle` is null when `errors` is
 *          non-empty: a mod that does not compile is never half-loaded.
 */
export function buildMod(modDir, catalog) {
  const errors = [];
  const warnings = [];
  const fail = (msg) => errors.push(msg);

  // ---------------------------------------------------------------------
  // 1. The manifest.
  // ---------------------------------------------------------------------
  const manifestPath = path.join(modDir, "mod.yaml");
  if (!existsSync(manifestPath)) {
    return {
      bundle: null,
      errors: [`${rel(modDir)}: no mod.yaml — every mod needs a manifest`],
      warnings,
    };
  }

  let manifest;
  try {
    manifest = parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    return {
      bundle: null,
      errors: [`mod.yaml: not valid YAML — ${e.message}`],
      warnings,
    };
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      bundle: null,
      errors: ["mod.yaml: expected a mapping"],
      warnings,
    };
  }

  if (!MOD_ID.test(String(manifest.id ?? ""))) {
    fail(
      `mod.yaml: id "${manifest.id}" must be 3–32 chars, lowercase letters, ` +
        "digits and dashes, starting with a letter",
    );
  }
  for (const key of ["name", "version", "author"]) {
    if (!String(manifest[key] ?? "").trim()) {
      fail(`mod.yaml: ${key} is required`);
    }
  }
  const kind = manifest.kind ?? "addon";
  if (!KINDS.has(kind)) {
    fail(
      `mod.yaml: kind "${kind}" — expected "addon" (adds to the game) or ` +
        '"conversion" (replaces the campaign)',
    );
  }
  const brand = readBrand(manifest, kind, catalog, errors);
  const contents = readContents(manifest, modDir, catalog, errors, warnings);

  // THE MENU IS NOT CONTENT, and this refusal is a security rule rather than a
  // tidiness one. `content/mainmenu.yaml` decides which SCREENS exist and which
  // rows reach them, so a mod that could ship one could hand itself the hidden
  // DEVELOPER tree — the level warp, the balance multipliers, the free coin
  // grant — on a shipped store build. Refused loudly rather than ignored
  // quietly, so an author who tries learns why instead of wondering why their
  // file does nothing.
  if (existsSync(path.join(modDir, "mainmenu.yaml"))) {
    fail(
      "mainmenu.yaml: the title menu is the game's own chrome and cannot be " +
        "replaced by a mod — remove the file",
    );
  }

  // ---------------------------------------------------------------------
  // 2. The content, through the game's own loaders and schemas.
  // ---------------------------------------------------------------------
  const enemies = loadTree(
    () => loadEnemies(path.join(modDir, "enemies")),
    "enemies",
    fail,
  );
  // A mod's own ladder rows — where ITS venues sit on the campaign's depth
  // ladder. Optional only because a mod may ship enemies and no levels.
  const ladderPath = path.join(modDir, "ladder.yaml");
  let extraLadder = {};
  if (existsSync(ladderPath)) {
    try {
      extraLadder = parse(readFileSync(ladderPath, "utf8")) ?? {};
    } catch (e) {
      fail(`ladder.yaml: not valid YAML — ${e.message}`);
    }
  }
  const levels = loadTree(
    () => loadLevels(path.join(modDir, "levels"), { extraLadder }),
    "levels",
    fail,
  );
  // THE RECIPE HALF of a venue: `maps/<id>.yaml` beside `levels/<id>.yaml`, so a
  // mod's map is carved fresh per run under GENERATED MAPS instead of being
  // permanently hand-drawn. Optional in every sense — a mod may ship levels and
  // no blueprints, blueprints for only some of its levels, or neither.
  const maps = loadTree(
    () => loadMaps(path.join(modDir, "maps"), { extraLadder }),
    "maps",
    fail,
  );
  const sprites = loadSprites(path.join(modDir, "sprites"), errors, warnings);
  const items = loadTree(() => loadItems(modDir), "items", fail);
  const sounds = loadTree(
    () => loadSounds(path.join(modDir, "sounds")),
    "sounds",
    fail,
  );
  // The RECORDINGS beside them — the same folder, read a second time for the
  // files `loadSounds` skips. Two readers rather than one because they answer
  // to different halves of the toolchain: the YAML goes through the shipped
  // content loader (so "it works in my mod" and "it works in the game" mean
  // the same thing), and a media file has no shipped counterpart at all.
  const samples = loadSamples(path.join(modDir, "sounds"), errors, warnings);
  const music = loadTree(
    () => loadMusic(path.join(modDir, "music")),
    "music",
    fail,
  );
  const musicRecordings = loadMusicRecordings(
    path.join(modDir, "music"),
    errors,
  );
  // The catalogs that are a single FILE rather than a tree, so they take the
  // mod's root — `powerups.yaml` and `companions.yaml`, exactly like
  // `ladder.yaml`.
  const powerups = loadTree(() => loadPowerups(modDir), "powerups", fail);
  // THE TALENT TREES. A conversion could already re-skin every monster, venue
  // and relic and still hand the player THIS game's eight melee talents — the
  // build system was the one thing a mod could not touch. A mod's talents MERGE
  // into the shipped trees like its monsters do (later wins), so an addon adds a
  // talent and a conversion replaces one by shipping its id. The point ECONOMY
  // behind them — a point per 10 chosen stat points, the shared rank ceiling —
  // stays the game's.
  const talents = loadTree(() => loadTalents(modDir), "talents", fail);
  // THE PARTY. A spared elite falling in beside the hero is a story beat, not a
  // stat line — so a conversion whose roster could be re-skinned but whose
  // recruits could not would be missing the payoff for sparing anything.
  const companions = loadTree(() => loadCompanions(modDir), "companions", fail);
  // THE KITS. A mod could already ship `rarity: set` items; without this the
  // pieces belonged to nothing, granted nothing, and read as a bug in the mod.
  const sets = loadTree(() => loadSets(modDir), "sets", fail);

  // THE RULES. A mod's `scripts/<id>.lua` replaces the shipped formula of the
  // same name for the length of a modded run — the one catalog that is
  // behaviour rather than data, and therefore the one a total conversion needs
  // to be a different GAME rather than a re-skin of this one. Optional, and
  // absent from almost every mod: an addon that adds monsters changes no rules.
  const scripts = loadTree(() => loadScripts(modDir), "scripts", fail);
  // THE HUD. A mod's `hud/` folder is the game's own `content/hud/` in the same
  // format, through the same loader and the same schema — the frame, the
  // elements, the event sounds and the Lua judgements behind them. It merges
  // per ELEMENT at load (later wins), so a mod may re-skin one pouch, move the
  // minimap, re-point one press's sound, or hang a whole panel of its own off
  // the rail — and a mod that ships none leaves the HUD exactly as it found it.
  //
  // CHECKED far below, once the sprite and sound names this mod may reach are
  // known: an element's icon, its plate and its press's click are all
  // cross-references, and checking them before those sets exist would only be
  // able to check their punctuation.
  const hud = loadTree(() => loadHud(modDir), "hud", fail);
  // THE RUN'S OWN WINDOWS. A mod's `menus/` folder is the game's own
  // `content/menus/` in the same format, through the same loader and the same
  // schema — the pause menu, the bag's frame, a modal of its own, and the Lua
  // that decides when one goes up. It merges per WINDOW and per ROW at load
  // (later wins), so a mod may re-word one button, add a row to the pause menu,
  // re-draw a whole window or ship a modal nothing else has — and a mod that
  // ships none leaves every window exactly as it found it.
  //
  // CHECKED far below with the HUD, and for the same reason: a window's frame
  // sprite and a row's press sound are cross-references.
  const menus = loadTree(() => loadMenus(modDir), "menus", fail);
  // HOW THE ART MOVES. Parsed here and CHECKED far below, once the sprite names
  // this mod may reach are known — a clip is nothing but a list of frames, so
  // validating it before the sprite tree has been read would only be able to
  // check its punctuation.
  const animationsDoc = readAnimations(modDir, errors);
  // THE LADDER'S VOICE — what the difficulty rungs are CALLED. A conversion set
  // somewhere else entirely still offered "JESUS CHRIST!"; the numbers behind
  // each rung stay the game's (see the schema's header).
  const difficulties = loadTree(
    () => loadDifficultyVoices(modDir),
    "difficulties",
    fail,
  );
  // THE STORY: the scenes a mod opens with, the hero's inner monologues, and the
  // plot pieces his finds spell out. A conversion that shipped none of these
  // would be a re-skin — new monsters on somebody else's plot — so all three go
  // in, and a mod's script is the mod's own (mod/FORMAT.md).
  const cutscenes = loadTree(
    () => loadCutscenes(path.join(modDir, "cutscenes")),
    "cutscenes",
    fail,
  );
  const thoughts = loadTree(() => loadThoughts(modDir), "thoughts", fail);
  const storyItems = loadTree(
    () => loadStoryItems(modDir),
    "story-items",
    fail,
  );
  // THE ERRANDS: the people on a mod's maps who are not trying to kill anyone,
  // and what they ask for. Same two files, same loader and same schema the
  // campaign's own go through (content/quests/ + quest-givers.yaml).
  const questGivers = loadTree(
    () => loadQuestGivers(modDir),
    "quest-givers",
    fail,
  );
  const quests = loadTree(
    () => loadQuests(path.join(modDir, "quests")),
    "quests",
    fail,
  );

  if (errors.length > 0) return { bundle: null, errors, warnings };

  const modEnemies = enemies?.enemies ?? {};
  const modLevels = (levels?.entries ?? []).map((e) => e.def);
  const modBlueprints = maps?.entries ?? [];
  const modItems = splitItems(items?.entries ?? []);

  const modSounds = sounds?.entries ?? [];
  /** Every CLIP this mod ships, by name. A clip is a file stem with one or
   * more takes behind it; whether it is also a SOUND depends on whether
   * anything routes it. */
  const clipNames = new Set(samples.map((s) => s.id));
  /** The sound ids this mod ships a RECORDING for — a clip that is being
   * played AS the sound of its own name, which is the plain drop-in case. A
   * clip only ever reached from a `call: sample` voice is not one of these:
   * it is a part, not a sound. Read by the clash check, by the schema (it is
   * what makes `voices:` optional) and by every cross-reference. */
  const sampledIds = new Set(
    samples
      .map((s) => s.id)
      .filter(
        (id) =>
          // A YAML that authors its own voices has said what it is; the file
          // beside it is a clip those voices name, not a replacement for them.
          !Array.isArray(sounds?.sounds?.[id]?.voices),
      ),
  );
  const modMusic = music?.entries ?? [];
  const modPowerups = powerups?.powerups ?? {};
  const modTalents = talents?.talents ?? {};
  const modCompanions = companions?.companions ?? {};
  const modSets = sets?.sets ?? {};
  const modScripts = scripts?.scripts ?? {};
  const modDifficulties = difficulties?.voices ?? {};
  const modCutscenes = cutscenes?.cutscenes ?? {};
  const modThoughts = thoughts?.thoughts ?? {};
  const modCapRotation = thoughts?.capRotation ?? [];
  const modStoryItems = storyItems?.storyItems ?? {};
  const modQuests = quests?.quests ?? {};
  const modQuestGivers = questGivers?.questGivers ?? {};
  const adds =
    modLevels.length +
    modBlueprints.length +
    Object.keys(modEnemies).length +
    (items?.entries?.length ?? 0) +
    // AN ART PACK IS A REAL MOD, and for a long time it was the one kind this
    // count refused: a folder of PNGs that redraws every monster in the game
    // adds no level, no rule and no id, and was told it "would install and do
    // nothing at all". It replaces what the player looks at for the whole run.
    sprites.length +
    // …and so is a mod whose whole contribution is how the art MOVES: a pack
    // that re-times every idle, or gives the shipped bodies a longer walk.
    (animationsDoc && typeof animationsDoc === "object"
      ? Object.keys(animationsDoc).length
      : 0) +
    modSounds.length +
    // A SOUND PACK is a real mod and often the whole point of one: a folder of
    // recordings named after the sounds they replace, with not a line of YAML
    // in it.
    samples.length +
    modMusic.length +
    // A mod whose whole contribution is a recorded soundtrack is a real mod
    // and adds nothing to any catalog above.
    musicRecordings.length +
    Object.keys(modPowerups).length +
    Object.keys(modTalents).length +
    Object.keys(modCompanions).length +
    Object.keys(modSets).length +
    Object.keys(modDifficulties).length +
    Object.keys(modCutscenes).length +
    Object.keys(modThoughts).length +
    Object.keys(modStoryItems).length +
    Object.keys(modQuests).length +
    // A RULES-ONLY mod is a real mod, and a valuable one — "the XP curve is
    // twice as steep and the horde is a quarter tougher" adds nothing to the
    // game's contents and changes the whole of how it plays.
    Object.keys(modScripts).length;
  if (adds === 0) {
    fail(
      "a mod must add at least one level, map blueprint, enemy, item, sprite, " +
        "animation, sound, recording, track, powerup, talent, companion, " +
        "cutscene, thought, story item, quest or rule script — a bundle of " +
        "nothing would install and do nothing at all",
    );
  }

  checkIds({
    manifest,
    catalog,
    kind,
    enemies: modEnemies,
    levels: modLevels,
    items: modItems,
    sounds: modSounds,
    // The id-clash exemption asks "did this mod ship a RECORDING for that
    // id", which is `clipNames` — shipping one is the only way to replace a
    // sound, and it is the one clash an addon is allowed. `sampledIds` is the
    // narrower "and it is played AS that sound", which is not the question.
    sampled: clipNames,
    music: modMusic,
    powerups: modPowerups,
    talents: modTalents,
    companions: modCompanions,
    sets: modSets,
    cutscenes: modCutscenes,
    thoughts: modThoughts,
    storyItems: modStoryItems,
    quests: modQuests,
    questGivers: modQuestGivers,
    errors,
  });

  // Cross-references resolve against the base game PLUS this mod's own
  // additions, which is what lets a mod's level name a mod's monster.
  const modWeaponIds = modItems.weapons.map((e) => e.id);
  const modGearIds = modItems.gear.map((e) => e.id);
  const modUniqueIds = modItems.uniques.map((e) => e.id);
  const refs = {
    enemies: union(catalog.enemies, Object.keys(modEnemies)),
    enemyRoles: new Map([
      ...Object.entries(catalog.enemyRoles),
      ...Object.entries(modEnemies).map(([id, d]) => [id, d.role]),
    ]),
    // The WALKING BOMBS a `martyrs:` cadence may name — the shipped ones plus
    // this mod's own, on the same terms as every other cross-reference here.
    martyrEnemies: union(
      catalog.martyrEnemies ?? [],
      Object.entries(modEnemies)
        .filter(([, d]) => d.martyr !== undefined)
        .map(([id]) => id),
    ),
    events: new Set(catalog.events ?? []),
    cues: new Set(catalog.cues ?? []),
    weapons: union(catalog.weapons, modWeaponIds),
    gear: union(catalog.gear, modGearIds),
    abilities: union(catalog.abilities, Object.keys(modPowerups)),
    thoughts: union(catalog.thoughts, Object.keys(modThoughts)),
    storyItems: union(catalog.storyItems, Object.keys(modStoryItems)),
    // A mod's level may open on a shipped scene, its own, or a variant of
    // either — `<id>_<difficulty>` variants are already expanded by the loader.
    cutscenes: union(catalog.cutscenes ?? [], Object.keys(modCutscenes)),
    uniques: union(catalog.uniques, modUniqueIds),
    // A mod's unique is `world: true` or it is not — the same flag the shipped
    // ones carry, and the reason a level may name it in a world pool.
    worldUniques: union(
      catalog.worldUniques,
      modItems.uniques.filter((e) => e.doc.world).map((e) => e.id),
    ),
    doorKeys: union(
      catalog.doorKeys,
      Object.values(modStoryItems)
        .map((item) => item.unlocks)
        .filter(Boolean),
    ),
    // A level's theme may be one of the game's or one of this mod's — the same
    // base ∪ mod rule every other cross-reference follows.
    music: union(
      catalog.music ?? [],
      modMusic.map((e) => e.id),
    ),
  };
  // The enemy schema wants a different slice: `items` is weapons ∪ gear (the
  // pool a `loot.items` line may name), and it has no notion of sprites.
  const enemyRefs = {
    enemies: refs.enemies,
    // Base ∪ mod, like every other cross-reference — which is the whole point
    // of a mod-authored roster: a mod's elite spares into a mod's companion.
    // Naming a SHIPPED one still resolves, so an addon can hand the player
    // Tesla off a monster of its own.
    companions: union(catalog.companions, Object.keys(modCompanions)),
    uniques: refs.uniques,
    storyItems: refs.storyItems,
    // The scripted send-off a mod's boss may name (`death:`). SHIPPED ONLY, and
    // deliberately: a rite is engine behaviour rather than content — there is a
    // module behind each one — so a mod picks from the catalog and cannot
    // declare a new one. Split by ENDING so the schema can refuse a finisher on
    // a boss that flees, and name the alternatives when it does.
    deathRites: new Set([
      ...(catalog.deathRites ?? []),
      ...(catalog.flightRites ?? []),
    ]),
    flightRites: new Set(catalog.flightRites ?? []),
    // Base ∪ mod, like everything else. `refs.weapons`/`refs.gear` already carry
    // this mod's own — reading `catalog.*` here instead meant a mod's monster
    // could not drop a weapon the SAME MOD ships, which is rule 2 of this file
    // broken in the one place it is easiest not to notice.
    // (Spread rather than `union`, which flattens ARRAYS — handing it two Sets
    // yields a Set holding two Set objects and every id check quietly fails.)
    items: new Set([...refs.weapons, ...refs.gear]),
  };
  for (const { id, def } of enemies?.entries ?? []) {
    const res = validateEnemy(def, enemyRefs);
    errors.push(...prefix(res.errors, `enemies/${id}`));
    warnings.push(...prefix(res.warnings, `enemies/${id}`));
  }
  // Items validate against the base catalogs PLUS this mod's own, so a mod's
  // unique may sit on a mod's base weapon. Sprites are the base atlas plus the
  // mod's — an item names ONE sprite (its icon), unlike a mob's two frames.
  // A RECORDING is a sound like any other as far as every reference goes: a
  // weapon's `sfx:` may name one, and so may a powerup's. The routing is the
  // only thing that differs, and only for an id the base game does not have.
  const soundIds = union(catalog.sounds ?? [], [
    ...modSounds.map((e) => e.id),
    ...sampledIds,
  ]);
  for (const entry of modMusic) {
    const res = validateTrack(entry.doc);
    errors.push(...prefix(res.errors, `music/${entry.id}`));
    warnings.push(...prefix(res.warnings, `music/${entry.id}`));
  }
  const claimed = new Map();
  for (const entry of modSounds) {
    // Only the compiler can see the folder, so only it can tell the schema
    // that a recording sits beside this file — which is what lets the YAML
    // carry an `on:` block and no `voices:` at all — or which CLIPS exist, so
    // a `call: sample` naming a file the author never shipped is an error
    // here rather than a sound that is silently missing a layer.
    const res = validateSound(entry.doc, {
      events: refs.events,
      cues: refs.cues,
      clips: clipNames,
      sampled: sampledIds.has(entry.id),
    });
    errors.push(...prefix(res.errors, `sounds/${entry.id}`));
    warnings.push(...prefix(res.warnings, `sounds/${entry.id}`));
    // Two of a mod's OWN sounds answering one event shape (or one cue) is the
    // same error the shipped pipeline reports: which of them plays would be
    // decided by file order, which is not a decision anybody made. (Two MODS
    // colliding is a different thing entirely, and the load order settles it.)
    if (!entry.doc.on) continue;
    const key = isCueOn(entry.doc.on)
      ? `cue ${soundCueKey(entry.doc.on)}`
      : soundMatchKey(entry.doc.on);
    if (claimed.has(key)) {
      errors.push(
        `sounds "${claimed.get(key)}" and "${entry.id}" both answer ` +
          `${key} — one event shape, one sound`,
      );
    }
    claimed.set(key, entry.id);
  }
  // A weapon may name its own sound; an id that resolves to nothing would fall
  // back to the class sound at play time, which is a silent "my sound never
  // plays" rather than an error anybody can act on.
  for (const entry of items?.entries ?? []) {
    const sfx = entry.doc.sfx;
    if (sfx && !soundIds.has(sfx)) {
      errors.push(
        `items/${entry.rarity}/${entry.id}: sfx "${sfx}" is not a sound this ` +
          "mod ships or the game has",
      );
    }
  }

  // A RECORDING NOBODY CAN HEAR is the one way to get this feature wrong, and
  // it is a typo away: `sounds/enemy_kiled.wav` compiles perfectly, ships,
  // installs, and never makes a sound. A recording is heard when it is named
  // after a SHIPPED sound (it replaces it), or when something in this mod
  // points at the id — an `on:` block in its own YAML, or a weapon's or a
  // power's `sfx:`.
  const shippedSounds = new Set(catalog.sounds ?? []);
  const routedByMod = new Set([
    ...modSounds.filter((e) => e.doc.on).map((e) => e.id),
    ...(items?.entries ?? []).map((e) => e.doc.sfx),
    ...Object.values(modPowerups).map((def) => def.sfx),
  ]);
  // …and the clips a `call: sample` voice reaches BY NAME. A clip layered into
  // somebody else's sound is heard without ever being a sound id itself, so
  // without this the composed case would warn about every one of its own parts.
  const usedAsClip = new Set(
    modSounds.flatMap((e) =>
      (Array.isArray(e.doc.voices) ? e.doc.voices : [])
        .filter((v) => v?.call === "sample")
        .map((v) => v.clip),
    ),
  );
  for (const sample of samples) {
    if (
      shippedSounds.has(sample.id) ||
      routedByMod.has(sample.id) ||
      usedAsClip.has(sample.id)
    ) {
      continue;
    }
    warnings.push(
      `sounds/${sample.id}.${sample.formats[0]}: "${sample.id}" is not a ` +
        "sound the game has, and nothing in this mod plays it — name it after " +
        "the sound it replaces (`cli.mjs sounds`), give it a " +
        `sounds/${sample.id}.yaml with an \`on:\` block, or name it from a ` +
        "`call: sample` voice",
    );
  }
  // …and the same trap for a recorded SCORE: `music/regolith_rde.opus` compiles
  // perfectly and is never played. A track is heard when it replaces a shipped
  // one, or when one of this mod's levels names it.
  const shippedTracks = new Set(catalog.music ?? []);
  const trackedByMod = new Set([
    ...modMusic.map((e) => e.id),
    ...modLevels.map((def) => def.music),
  ]);
  for (const track of musicRecordings) {
    if (shippedTracks.has(track.id) || trackedByMod.has(track.id)) continue;
    warnings.push(
      `music/${track.id}: "${track.id}" is not a track the game has, and no ` +
        "level in this mod names it — name it after the theme it replaces, " +
        "or point a level's `music:` at it",
    );
  }
  // One id, ONE player. A recorded track beside a YAML arrangement of the same
  // name is two scores for one theme, and which won would be decided by the
  // page's lookup order rather than by anybody's intent.
  for (const track of musicRecordings) {
    if (!music?.music?.[track.id]) continue;
    errors.push(
      `music/${track.id}: shipped both as a recording and as a YAML ` +
        "arrangement — a theme is played from one or the other",
    );
  }
  // A `sample:` block is a mod saying "this sound is a recording"; without the
  // recording it is a sound with no voices and no file, which is silence.
  for (const entry of modSounds) {
    // `clipNames`, not `sampledIds`: the question is whether a FILE is there
    // to be trimmed, and a YAML that (wrongly) also authors voices is out of
    // `sampledIds` — which would make this fire on a mod that did ship the
    // recording, on top of the schema error that is the real complaint.
    if (entry.doc.sample === undefined || clipNames.has(entry.id)) continue;
    errors.push(
      `sounds/${entry.id}.yaml: has a \`sample:\` block but no recording — ` +
        `add ${entry.id}.wav (or ${SAMPLE_EXTS.slice(1).join("/.")}) beside ` +
        "it, or drop the block and author `voices:`",
    );
  }

  // The atlas as this mod will see it: the base game's names plus its own. Every
  // schema that checks a sprite reference resolves against this one set — the
  // same base ∪ mod rule every other cross-reference follows.
  const spriteNames = union(
    catalog.sprites,
    sprites.map((s) => s.name),
  );
  // THE HUD, against everything this mod may actually reach: the sprite names
  // above (an element's icon and its 9-slice plate), the sound ids (a press's
  // click), the REGIONS the merged frame will have — the game's own plus this
  // mod's, because an element may sit in a shipped region or in one of its own
  // — and its own scripts, which are compiled with the game's VM here so a
  // broken judgement fails on the author's machine rather than in a run.
  const modHudScripts = {};
  const hudScriptExports = new Map();
  for (const script of hud?.scripts ?? []) {
    const res = moduleExports(script.source, script.file);
    errors.push(...res.errors);
    hudScriptExports.set(script.id, res.functions);
    modHudScripts[script.id] = { id: script.id, source: script.source };
  }
  // The frame as this mod will see it: the game's own regions plus the ones it
  // ships itself — the same base ∪ mod rule every other cross-reference here
  // follows, so an element may sit in a shipped rail or in a panel of its own.
  const hudRegions = union(
    catalog.hudRegions ?? [],
    Object.keys(hud?.regions ?? {}),
  );
  {
    const res = validateHudRegions(hud?.regions ?? {}, {
      sprites: spriteNames,
      scripts: hudScriptExports,
    });
    errors.push(...prefix(res.errors, "hud/hud.yaml"));
    warnings.push(...prefix(res.warnings, "hud/hud.yaml"));
  }
  const hudRefs = {
    sprites: spriteNames,
    sounds: soundIds,
    scripts: hudScriptExports,
    regions: hudRegions,
  };
  for (const element of hud?.elements ?? []) {
    const res = validateHudElement(element, hudRefs);
    errors.push(...prefix(res.errors, `hud/elements/${element.id}`));
    warnings.push(...prefix(res.warnings, `hud/elements/${element.id}`));
  }
  if (Object.keys(hud?.events ?? {}).length > 0) {
    const res = validateHudEvents(hud.events, { sounds: soundIds });
    errors.push(...prefix(res.errors, "hud"));
    // NOT its warnings: the shipped catalog warns about a moment nothing
    // answers, and a mod that re-points one moment answers exactly one on
    // purpose.
  }
  {
    const res = validateHudCatalog(hud?.elements ?? []);
    errors.push(...res.errors);
  }

  // THE WINDOWS, against the same sprite and sound names — plus this mod's own
  // menu judgements, compiled with the game's VM here so a broken one fails on
  // the author's machine rather than in a run.
  //
  // The CATALOG check (`validateMenuCatalog`) is deliberately NOT run: it
  // refuses a catalog that leaves one of the run's screens unanswered, which is
  // exactly what a mod shipping a single window looks like. The game's own
  // catalog is what has to answer every screen, and its generator checks that.
  const modMenuScripts = {};
  const menuScriptExports = new Map();
  for (const script of menus?.scripts ?? []) {
    const res = moduleExports(script.source, script.file);
    errors.push(...res.errors);
    menuScriptExports.set(script.id, res.functions);
    modMenuScripts[script.id] = { id: script.id, source: script.source };
  }
  const menuRefs = {
    sprites: spriteNames,
    sounds: soundIds,
    scripts: menuScriptExports,
    // The windows this mod's rows may be aimed at: the game's own plus the ones
    // it ships itself — the same base ∪ mod rule every other cross-reference
    // here follows.
    menus: union(catalog.menus ?? [], [
      ...(menus?.menus ?? []).map((menu) => menu.id),
      ...(menus?.modals ?? []).map((modal) => modal.id),
    ]),
  };
  for (const menu of menus?.menus ?? []) {
    const res = validateMenu(menu, menuRefs);
    errors.push(...prefix(res.errors, `menus/${menu.id}`));
    warnings.push(...prefix(res.warnings, `menus/${menu.id}`));
  }
  for (const modal of menus?.modals ?? []) {
    const res = validateMenu(modal, menuRefs, { modal: true });
    errors.push(...prefix(res.errors, `menus/modals/${modal.id}`));
    warnings.push(...prefix(res.warnings, `menus/modals/${modal.id}`));
  }
  for (const element of menus?.elements ?? []) {
    const res = validateMenuElement(element, menuRefs);
    errors.push(...prefix(res.errors, `menus/elements/${element.id}`));
    warnings.push(...prefix(res.warnings, `menus/elements/${element.id}`));
  }

  // HOW THE ART MOVES, against the sprite names this mod may actually reach.
  // Every frame is checked here for the same reason a monster's `sprite:` is:
  // a clip naming art nobody shipped fails SILENTLY at draw time — the frame
  // resolves to undefined, the renderer skips it, and the body flickers out of
  // existence one frame in six with every check green.
  const { clips: modClips, ...animationCheck } = validateAnimations(
    animationsDoc,
    { sprites: spriteNames },
  );
  errors.push(...prefix(animationCheck.errors, "animations.yaml"));
  warnings.push(...prefix(animationCheck.warnings, "animations.yaml"));

  const powerupRefs = { sprites: spriteNames, sounds: soundIds };
  for (const { id, def } of powerups?.entries ?? []) {
    const res = validatePowerup(id, def, powerupRefs);
    errors.push(...prefix(res.errors, "powerups.yaml"));
    warnings.push(...prefix(res.warnings, "powerups.yaml"));
  }

  // THE TALENT TREES, against the same schema the shipped ones go through. Its
  // one reference is the picker's GLYPH, which fails silently at play time: a
  // talent whose icon nothing answers to draws a blank card in the one screen
  // the player has to choose from. The rank CEILING comes from the catalog —
  // the shared cap is the game's economy, and a mod may choose a shallower
  // ladder but never a deeper one.
  {
    const talentRefs = {
      sprites: spriteNames,
      maxRank: catalog.talentMaxRank,
    };
    for (const { id, def } of talents?.entries ?? []) {
      const res = validateTalent(id, def, talentRefs);
      errors.push(...prefix(res.errors, "talents.yaml"));
      warnings.push(...prefix(res.warnings, "talents.yaml"));
    }
    // ONE CARRIER PER PROC, judged over BASE ∪ MOD — because a mod's talents
    // MERGE into the shipped trees rather than replacing them, exactly as its
    // monsters and venues do. So an addon adding a second talent that carries
    // `parry:` would make "whose numbers apply" a question about catalog order,
    // which is not a decision anybody made. The way to re-carry a shipped proc
    // is to REPLACE the talent that has it (ship a talent with its id — a
    // conversion's business), and that is what this skips a shipped carrier for.
    const merged = {};
    for (const [proc, owner] of Object.entries(catalog.talentProcs ?? {})) {
      if (modTalents[owner]) continue;
      merged[owner] = { ...(merged[owner] ?? {}), [proc]: {} };
    }
    Object.assign(merged, modTalents);
    const res = validateTalentCatalog(merged);
    errors.push(...prefix(res.errors, "talents.yaml"));
    warnings.push(...prefix(res.warnings, "talents.yaml"));
  }

  // THE PARTY, against the same schema the shipped roster goes through. Its two
  // references are the ones that fail SILENTLY at play time: a sprite family
  // nothing answers to walks beside the hero as nothing at all, and an unknown
  // signature weapon throws out of the mint the instant the figure joins — which
  // is the middle of the scene where the player just spared somebody.
  const companionRefs = { sprites: spriteNames, weapons: refs.weapons };
  for (const { id, def } of companions?.entries ?? []) {
    const res = validateCompanion(id, def, companionRefs);
    errors.push(...prefix(res.errors, "companions.yaml"));
    warnings.push(...prefix(res.warnings, "companions.yaml"));
  }

  // THE KITS, against the same schema the shipped ones go through.
  //
  // Its members are the MOD'S OWN named items, and only those — not base ∪ mod
  // like every other cross-reference here. That is not an oversight: a piece
  // and its kit each name the other (`UniqueDef.setId` ↔ `SetDef.members`), and
  // a mod cannot edit a shipped piece's back-reference. So a kit claiming a
  // shipped piece would compile into exactly the mismatch this schema exists to
  // catch — a green piece paying one set's bonuses while its card names
  // another. A conversion that wants a shipped kit re-homed ships the pieces
  // too, which puts them in this very list.
  const modUniques = new Map(
    modItems.uniques.map((entry) => [
      entry.id,
      { tier: entry.rarity, slot: entry.doc.slot, setId: entry.doc.setId },
    ]),
  );
  for (const { id, def } of sets?.entries ?? []) {
    const res = validateSet(id, def, { uniques: modUniques });
    errors.push(...prefix(res.errors, "sets.yaml"));
    warnings.push(...prefix(res.warnings, "sets.yaml"));
  }
  // THE RULES a mod ships, through the game's own Lua compiler (see
  // `asset-tools/script-schema.mjs`). This is the only content kind whose
  // validator RUNS what it is checking — it parses the chunk and loads its top
  // level in an empty sandbox — because a scripting hook's failures are
  // otherwise all silent: a typo'd hook name is a file that quietly does
  // nothing for the rest of a campaign, and the shipped rule standing in for it
  // looks exactly like a mod that "didn't work".
  //
  // An unknown export is a WARNING here rather than an error (unlike the
  // shipped catalog), because a mod may legitimately carry a helper the engine
  // does not call — but it is named, because nine times in ten it is a typo.
  for (const { id, source } of scripts?.entries ?? []) {
    const res = validateScript(id, source, { shipped: false });
    errors.push(...res.errors);
    warnings.push(...res.warnings);
  }

  // And the other direction: a `rarity: set` piece with no kit grants nothing
  // and reads as a bug in the mod rather than as a missing file.
  {
    const claimed = new Set(
      Object.values(modSets).flatMap((def) => def.members ?? []),
    );
    for (const entry of modItems.uniques) {
      if (entry.rarity !== "set" || claimed.has(entry.id)) continue;
      errors.push(
        `items/set/${entry.id}: belongs to no set — add it to a kit's ` +
          "`members:` in sets.yaml, or make it a plain unique",
      );
    }
  }

  // The ladder's voice. Both strings are drawn in the pixel font on the CHOOSE
  // YOUR NIGHTMARE screen, so they go through the same glyph check the brand
  // does — a rung named with an accent renders as "?" on the one screen every
  // player passes through.
  const difficultyRefs = {
    difficulties: new Set(catalog.difficulties ?? []),
    glyphs: catalog.glyphs,
  };
  for (const { id, def } of difficulties?.entries ?? []) {
    const res = validateDifficultyVoice(id, def, difficultyRefs);
    errors.push(...prefix(res.errors, "difficulties.yaml"));
    warnings.push(...prefix(res.warnings, "difficulties.yaml"));
  }

  const itemRefs = {
    weapons: refs.weapons,
    gear: refs.gear,
    sprites: spriteNames,
    // The elements a weapon's `fx:` may name — the game's palette, not a mod's
    // to extend: a kit is pixels drawn by the app, so a name nothing draws
    // would be a weapon that silently swings the plain look.
    elements: new Set(catalog.elements ?? []),
  };
  for (const entry of items?.entries ?? []) {
    // `grades:` mints extra ids at ENGINE LOAD, out of a catalog that ships
    // compiled into the build — there is no runtime seam to add to, so a mod
    // that authored one would silently get nothing. Refuse it with the reason
    // rather than dropping it.
    if (entry.doc.grades) {
      errors.push(
        `items/${entry.rarity}/${entry.id}: \`grades:\` is not available to ` +
          "mods — the grade catalog is compiled into the game. Author the " +
          "exceptional/elite versions as their own items instead.",
      );
    }
    const res = validateItem(entry.doc, itemRefs);
    errors.push(...prefix(res.errors, `items/${entry.rarity}/${entry.id}`));
    warnings.push(...prefix(res.warnings, `items/${entry.rarity}/${entry.id}`));
  }
  // The story, against the same schemas the campaign's own goes through. A scene
  // is checked as AUTHORED (variants intact) and its per-difficulty variants may
  // name any rung the game ships, which is why the catalog carries them.
  const storyRefs = {
    sprites: spriteNames,
    sounds: soundIds,
    difficulties: new Set(catalog.difficulties ?? []),
  };
  for (const { doc } of cutscenes?.entries ?? []) {
    const res = validateCutscene(doc, storyRefs);
    errors.push(...prefix(res.errors, `cutscenes/${doc.id}`));
    warnings.push(...prefix(res.warnings, `cutscenes/${doc.id}`));
  }
  for (const { id, def } of thoughts?.entries ?? []) {
    const res = validateThought(id, def, storyRefs);
    errors.push(...prefix(res.errors, "thoughts.yaml"));
    warnings.push(...prefix(res.warnings, "thoughts.yaml"));
  }
  for (const { id, def } of storyItems?.entries ?? []) {
    const res = validateStoryItem(id, def, storyRefs);
    errors.push(...prefix(res.errors, "story-items.yaml"));
    warnings.push(...prefix(res.warnings, "story-items.yaml"));
  }
  // The cap-farm rotation may only name thoughts THIS mod ships: it replaces the
  // game's wholesale (there is no merging a rotation), so a shipped id in it
  // would be a line the mod does not own.
  {
    const res = validateCapRotation(
      modCapRotation,
      new Set(Object.keys(modThoughts)),
    );
    errors.push(...prefix(res.errors, "thoughts.yaml"));
    // An empty rotation is the normal case for a mod — only the SHIPPED catalog
    // is expected to keep the mutter alive, so don't nag about it.
    if (modCapRotation.length > 0) {
      warnings.push(...prefix(res.warnings, "thoughts.yaml"));
    }
  }
  // THE ERRANDS. A quest cross-references six ways (a level, a giver, monster
  // breeds, sprites, uniques, powerups) and every one of them is silent at
  // runtime if it resolves to nothing — a `kill` objective for a breed that
  // never spawns looks exactly like bad luck. Validated against the base game
  // PLUS this mod's own additions, like every other cross-reference here.
  {
    const questRefs = {
      levels: union(
        catalog.levels ?? [],
        modLevels.map((def) => def.id),
      ),
      enemies: refs.enemies,
      sprites: spriteNames,
      uniques: refs.uniques,
      abilities: refs.abilities,
      difficulties: new Set(catalog.difficulties ?? []),
      givers: new Set(Object.keys(modQuestGivers)),
      giverLevels: new Map(
        Object.entries(modQuestGivers).map(([id, def]) => [id, def.level]),
      ),
      quests: union(catalog.quests ?? [], Object.keys(modQuests)),
    };
    for (const { id, def } of questGivers?.entries ?? []) {
      const res = validateQuestGiver(id, def, questRefs);
      errors.push(...prefix(res.errors, "quest-givers.yaml"));
      warnings.push(...prefix(res.warnings, "quest-givers.yaml"));
    }
    for (const { id, def } of quests?.entries ?? []) {
      const res = validateQuest(id, def, questRefs);
      errors.push(...prefix(res.errors, `quests/${id}`));
      warnings.push(...prefix(res.warnings, `quests/${id}`));
    }
    // The whole-catalog rules (a giver with no quests, a chain that loops)
    // judge THIS MOD's pair alone: a mod's giver has to be given work by the
    // mod, and a shipped giver is none of its business.
    const res = validateQuestCatalog(modQuests, modQuestGivers);
    errors.push(...prefix(res.errors, "quests"));
    warnings.push(...prefix(res.warnings, "quests"));
  }

  // A story item's `unlocks` names a door in the LEVEL that holds it, and a key
  // for a door nobody cut is a key that never opens anything.
  const modDoorIds = new Set(
    modLevels.flatMap((def) => (def.doors ?? []).map((d) => d.id)),
  );
  for (const { id, def } of storyItems?.entries ?? []) {
    if (!def.unlocks) continue;
    if (
      !modDoorIds.has(def.unlocks) &&
      !catalog.doorKeys?.includes(def.unlocks)
    ) {
      warnings.push(
        `story-items.yaml: "${id}" unlocks "${def.unlocks}", which is not a ` +
          "door in this mod's levels — the key will never open anything",
      );
    }
  }

  for (const entry of levels?.entries ?? []) {
    const res = validateLevel(entry.def, refs, entry.description);
    errors.push(...prefix(res.errors, `levels/${entry.id}`));
    warnings.push(...prefix(res.warnings, `levels/${entry.id}`));
  }

  // THE BLUEPRINTS, through the same gate the shipped ones go through.
  //
  // Two of its four id sets are base ∪ mod like every other cross-reference (a
  // mod's carve places a mod's monster on a mod's sprite); the RAMP names come
  // from the shipped ladder, because a mod prices where its venue sits and never
  // what `savage` means; and the compass grammar arrives as the list of names
  // the ENGINE's own parser accepts, snapshotted into the catalog, since the
  // desktop app compiling this has no TypeScript to run that parser with.
  const mapRefs = {
    enemies: refs.enemies,
    levels: union(
      catalog.levels ?? [],
      modLevels.map((def) => def.id),
    ),
    sprites: spriteNames,
    // Which side of a wall each piece of art belongs on: the shipped
    // declarations from the catalog, plus this mod's own sprites, which state it
    // in exactly the same field of exactly the same file.
    spriteSpace: new Map([
      ...Object.entries(catalog.spriteSpaces ?? {}),
      ...sprites.filter((s) => s.space).map((s) => [s.name, s.space]),
    ]),
    ramps: new Set(Object.keys(loadLadder().ramps)),
    parseRegion: regionChecker(catalog.regions),
  };
  const ownLevelIds = new Set(modLevels.map((def) => def.id));
  for (const { id, raw, description } of modBlueprints) {
    const res = validateMap(raw, mapRefs, description);
    errors.push(...prefix(res.errors, `maps/${id}`));
    warnings.push(...prefix(res.warnings, `maps/${id}`));
    // A blueprint carves the mission it is NAMED AFTER, so one naming a shipped
    // venue re-carves that venue — which is a conversion's business, not an
    // addon's. Caught here rather than in `checkIds` because the rule is not
    // "this id is taken" but "this is somebody else's map".
    if (kind !== "conversion" && !ownLevelIds.has(id)) {
      errors.push(
        `maps/${id}: a blueprint carves the level it is named after, and ` +
          `"${id}" is not a level this mod ships. Name it after one of your ` +
          "own levels, or set kind: conversion to re-carve a shipped venue.",
      );
    }
  }

  // The one cross-reference no shipped schema makes, because the shipped
  // pipeline cannot get it wrong: the atlas is GENERATED from the sprite tree,
  // so a name that resolves at build time always resolves at draw time. A mod's
  // sprites are merged into the atlas at load instead, so a typo here draws an
  // enemy as nothing at all — silently, because `spriteByName` answers
  // undefined and the renderer simply skips it. Catch it while there is still
  // a filename to blame.
  for (const { id, def } of enemies?.entries ?? []) {
    // A mob's `sprite` names a FAMILY — the renderer draws `<sprite>_0`/`_1`.
    if (def.sprite && !spriteNames.has(`${def.sprite}_0`)) {
      errors.push(
        `enemies/${id}: sprite "${def.sprite}" has no frames — expected at ` +
          `least "${def.sprite}_0" in this mod's sprites/ or in the base game`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // 3. The campaign order. A CONVERSION replaces the game's; an ADDON's
  //    levels hang off the campaign they were authored into.
  // ---------------------------------------------------------------------
  const campaign = campaignOrder(manifest, kind, levels?.entries ?? [], errors);

  if (errors.length > 0) return { bundle: null, errors, warnings };

  return {
    bundle: {
      formatVersion: BUNDLE_FORMAT,
      id: manifest.id,
      name: manifest.name,
      version: String(manifest.version),
      author: manifest.author,
      description: manifest.description ?? "",
      kind,
      // What a CONVERSION calls itself on the title screen; null for every
      // other mod, which plays under the game's own name (see `readBrand`).
      brand,
      campaign,
      levels: modLevels,
      // The carve recipes, keyed by the level each one generates — exactly the
      // shape `registerDefs({ blueprints })` takes.
      blueprints: Object.fromEntries(
        modBlueprints.map((e) => [e.id, e.blueprint]),
      ),
      enemies: modEnemies,
      weapons: toRecord(modItems.weapons, baseDef),
      gear: toRecord(modItems.gear, baseDef),
      uniques: toRecord(modItems.uniques, uniqueDef),
      // EVERY sound this mod ships, synthesized and recorded alike, as one
      // catalog of defs.
      //
      // A RECORDING IS NOT A SECOND KIND OF THING ANY MORE. A dropped-in
      // `enemy_killed.wav` is compiled HERE into an ordinary def whose single
      // voice is `call: sample, clip: enemy_killed` — so the page merges it,
      // routes it and plays it through exactly the code that handles a
      // synthesized sound, and a mod that wants to layer that clip under a
      // tail writes the same def out longhand instead. (It used to be a
      // parallel bank consulted ahead of the catalog, which worked for
      // replacing a sound and made composing one impossible.)
      sounds: Object.fromEntries(soundDefs(modSounds, sampledIds)),
      // The recordings themselves: an id and its TAKES, base64, in order.
      samples: samples.map((sample) => ({
        id: sample.id,
        takes: sample.takes,
      })),
      // Event shape → sound id, keyed exactly as the game's own catalog is, so
      // a mod can replace a shipped sound by answering the same event. A
      // RECORDING is routed by this table too whenever its YAML carries an
      // `on:` — which is how a mod gives a brand-new event moment a real
      // sound rather than only re-recording an existing one.
      soundKeys: Object.fromEntries(
        modSounds
          .filter((e) => e.doc.on && !isCueOn(e.doc.on))
          .map((e) => [soundMatchKey(e.doc.on), e.id]),
      ),
      // …and the same for CUES, in their own key space. A mod may give the
      // game footsteps on a surface the shipped bank never authored, without
      // the engine growing an event for it.
      cueKeys: Object.fromEntries(
        modSounds
          .filter((e) => e.doc.on && isCueOn(e.doc.on))
          .map((e) => [soundCueKey(e.doc.on), e.id]),
      ),
      // Cooked here rather than in the page, for the same reason the sprites
      // are rasterized here: the renderer gets data it can use directly, and
      // the only YAML parser in the build stays in the main process.
      music: Object.fromEntries(modMusic.map((e) => [e.id, cookTrack(e.doc)])),
      // …and the RECORDED scores, which are bytes rather than arrangements.
      // Their own field rather than a variant inside `music`: the page plays
      // them through an `<audio>` element and the sequencer never sees them,
      // so a shape that made the two interchangeable would be a lie about
      // which player is involved.
      musicSamples: musicRecordings,
      // Already `{ id → def }` with each id stamped in by the loader, which is
      // exactly the shape `registerDefs` takes.
      powerups: modPowerups,
      // The three passive TREES, merged into the shipped ones at load — already
      // `{ id → TalentDef }` with each id stamped in by the loader, which is
      // exactly the shape `registerDefs({ talents })` takes.
      talents: modTalents,
      companions: modCompanions,
      // The KITS a mod's green pieces belong to. `{ id → SetDef }`, exactly the
      // shape `registerDefs({ sets })` takes.
      sets: modSets,
      // The RULES — `{ id → { id, source } }`, exactly the shape
      // `registerDefs({ scripts })` takes. The SOURCE travels, not a compiled
      // form: the VM parses at load, once per run, and shipping an AST would
      // freeze the interpreter's internal shape into a published bundle.
      scripts: modScripts,
      // What the ladder's rungs are CALLED under this mod — a partial
      // `{ rung → { name?, tagline? } }` the page folds onto the shipped defs,
      // never a replacement for them.
      difficulties: modDifficulties,
      // The story. `cutscenes` has its `variants:` already expanded into
      // `<id>_<difficulty>` scenes, so the page registers exactly what
      // `cutsceneVariant` looks up.
      cutscenes: modCutscenes,
      thoughts: modThoughts,
      capRotation: modCapRotation,
      storyItems: modStoryItems,
      // The errands and the people who hand them out — two catalogs, both
      // already `{ id → def }` with ids stamped in by the loader, which is
      // exactly the shape `registerDefs` takes.
      quests: modQuests,
      questGivers: modQuestGivers,
      sprites,
      // HOW THE ART MOVES: subject → state → frames, every default filled in
      // by the schema. Empty for the overwhelming majority of mods, which draw
      // the two frames the game's own renderer already knows what to do with.
      clips: modClips,
      // THE HUD this mod ships — its frame, its elements, its event sounds and
      // its judgements. Merged per element at load rather than wholesale, so a
      // mod that re-skins one pouch keeps the rest of the player's HUD (see
      // `mergeHud`). Omitted entirely by the many mods that leave it alone.
      hud:
        (hud?.elements.length ?? 0) > 0 ||
        Object.keys(hud?.regions ?? {}).length > 0 ||
        Object.keys(hud?.events ?? {}).length > 0 ||
        Object.keys(modHudScripts).length > 0
          ? {
              regions: hud.regions,
              elements: hud.elements,
              events: hud.events,
              scripts: modHudScripts,
            }
          : undefined,
      // THE WINDOWS this mod ships — its menus, its modals, the rows it hangs
      // off ours and the judgements behind them. Merged per window and per row
      // at load rather than wholesale (see `mergeMenus`), so a mod that re-words
      // one button keeps the player the rest of their pause menu. Omitted
      // entirely by the many mods that leave the windows alone.
      menus:
        (menus?.menus.length ?? 0) > 0 ||
        (menus?.modals.length ?? 0) > 0 ||
        (menus?.elements.length ?? 0) > 0 ||
        Object.keys(modMenuScripts).length > 0
          ? {
              menus: menus.menus,
              modals: menus.modals,
              elements: menus.elements,
              scripts: modMenuScripts,
            }
          : undefined,
      // The manifest's inventory — what the MOD INFO screen reads to tell a
      // player what this mod puts in their game. Empty for a mod authored
      // before the block existed (see `readContents`).
      contents,
    },
    errors,
    warnings,
  };
}

/** Run one loader, turning its loud throw into a finding. The loaders throw
 * because a broken SHIPPED tree must stop the build; a broken MOD must only
 * stop that mod. */
function loadTree(load, what, fail) {
  try {
    return load();
  } catch (e) {
    fail(`${what}: ${e.message}`);
    return null;
  }
}

/**
 * Sprites, decoded to raw pixels here rather than in the game.
 *
 * The page gets `width × height × RGBA` bytes, base64'd — no palette, no grid,
 * no PNG, no YAML. That keeps the whole pixel format on this side of the wall,
 * so the renderer's job stays "make an ImageBitmap out of these bytes" and a
 * mod cannot reach the atlas pipeline at all.
 *
 * TWO WAYS IN, ONE WAY OUT. A `.yaml` grid is the game's own format; a `.png`
 * is the same sprite drawn in an editor, decoded by `png.mjs`. Which one a
 * sprite was authored as stops mattering at the `return` — the bundle carries
 * bytes either way, and nothing downstream can tell them apart.
 */
function loadSprites(spritesDir, errors, warnings) {
  const out = [];
  if (!existsSync(spritesDir)) return out;

  const families = readdirSync(spritesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const seen = new Map();
  let pngBytes = 0;
  for (const family of families) {
    const dir = path.join(spritesDir, family);
    const files = readdirSync(dir)
      .filter(
        (f) =>
          (f.endsWith(".yaml") || f.endsWith(".png")) && !f.startsWith("_"),
      )
      .sort();
    for (const file of files) {
      const label = `sprites/${family}/${file}`;
      const png = file.endsWith(".png");
      const stem = file.slice(0, file.lastIndexOf("."));

      // ONE SPRITE, ONE FILE. `ghoul_0.yaml` beside `ghoul_0.png` is not a
      // choice anybody made — which won would be decided by the sort order
      // above, and the loser would be edited for an afternoon with nothing
      // changing on screen.
      const already = seen.get(stem);
      if (already !== undefined) {
        errors.push(
          `${label}: "${stem}" is already drawn by ${already} — a sprite is ` +
            "authored as a grid or as a picture, not as both",
        );
        continue;
      }

      const sprite = png
        ? readPngSprite(dir, file, stem, label, errors, warnings)
        : readGridSprite(dir, file, stem, label, errors, warnings);
      if (sprite === null) continue;
      if (png) pngBytes += sprite.width * sprite.height * 4;
      seen.set(stem, label);
      out.push(sprite);
    }
  }

  // The decoded pixels are what travels, and every enabled mod's travel at
  // once — so the ceiling is on the PICTURES rather than on the files, which
  // is the number a PNG's compression hides. (A 64×64 sprite is 16 KB here
  // whether it exported at 2 KB or at 12.)
  if (pngBytes > MAX_SPRITE_PIXEL_BYTES) {
    errors.push(
      `sprites/: ${mib(pngBytes)} of decoded picture is over the ` +
        `${mib(MAX_SPRITE_PIXEL_BYTES)} a mod may ship — the bundle crosses ` +
        "to the page in one message, alongside every other enabled mod's",
    );
  } else if (pngBytes > WARN_SPRITE_PIXEL_BYTES) {
    warnings.push(
      `sprites/: ${mib(pngBytes)} of decoded picture — a sprite's pixels are ` +
        "world units, so art this large is usually art drawn at the wrong scale",
    );
  }
  return out;
}

/** How much decoded sprite art one mod may ship, and where to say so first.
 * Held in memory as `ImageBitmap`s for as long as the mod is on. */
const MAX_SPRITE_PIXEL_BYTES = 16 * 1024 * 1024;
const WARN_SPRITE_PIXEL_BYTES = 6 * 1024 * 1024;

/**
 * The largest a sprite gets before it stops looking like this game.
 *
 * Not a refusal — `png.mjs` has the hard one, and an author drawing a
 * screen-filling boss is allowed to mean it. But a sprite's pixels ARE world
 * units (the hero is sixteen of them), so the overwhelmingly likely reason for
 * a 512-px body is art drawn at 8× and never scaled down, which reads as a
 * blurry giant rather than as a detailed anything.
 */
const WARN_SPRITE_SIDE = 96;

/** One `<id>.yaml` pixel grid → the bundle's sprite shape, or null. */
function readGridSprite(dir, file, stem, label, errors, warnings) {
  let sprite;
  try {
    sprite = parse(readFileSync(path.join(dir, file), "utf8"));
  } catch (e) {
    errors.push(`${label}: not valid YAML — ${e.message}`);
    return null;
  }
  if (sprite?.name !== stem) {
    errors.push(`${label}: name is "${sprite?.name}", expected "${stem}"`);
    return null;
  }
  const res = validateSprite(sprite);
  errors.push(...prefix(res.errors, label));
  warnings.push(...prefix(res.warnings, label));
  if (res.errors.length > 0) return null;
  return rasterize(sprite);
}

/**
 * One `<id>.png` → the same shape, decoded.
 *
 * THE FILE NAME IS THE SPRITE, exactly as a recording's stem is its sound: drop
 * `ghoul_0.png` in and the mob is drawn with it, with no manifest entry and no
 * YAML beside it. What a PNG cannot say is the one thing the grid format
 * carries that is not pixels — `space:`, the indoor/outdoor fact the map
 * compiler reads — so art that needs it stays a grid. Nothing else is lost.
 */
function readPngSprite(dir, file, stem, label, errors, warnings) {
  if (!/^[a-z][a-z0-9_]*$/.test(stem)) {
    errors.push(
      `${label}: "${stem}" is not a sprite name — the file name IS the sprite ` +
        "it draws, so it takes lowercase letters, digits and underscores",
    );
    return null;
  }
  const bytes = readFileSync(path.join(dir, file));
  if (bytes.length === 0) {
    errors.push(`${label}: the file is empty`);
    return null;
  }
  if (!isPng(bytes)) {
    errors.push(
      `${label}: the first bytes are not a PNG — export it as one rather than ` +
        "renaming it, or author it as a .yaml grid",
    );
    return null;
  }
  let decoded;
  try {
    decoded = decodePng(bytes);
  } catch (e) {
    errors.push(`${label}: ${e.message}`);
    return null;
  }
  if (decoded.width > WARN_SPRITE_SIDE || decoded.height > WARN_SPRITE_SIDE) {
    warnings.push(
      `${label}: ${decoded.width}×${decoded.height} — a sprite's pixels are ` +
        `world units and the hero is 16 of them, so anything past ` +
        `${WARN_SPRITE_SIDE} is usually art that was never scaled down ` +
        `(the ceiling is ${MAX_PNG_SIDE})`,
    );
  }
  return {
    name: stem,
    width: decoded.width,
    height: decoded.height,
    rgba: decoded.rgba.toString("base64"),
  };
}

/** One validated sprite → `{ name, width, height, rgba }`, the pixels base64'd
 * row-major RGBA. `.` is the reserved transparent key. */
function rasterize(sprite) {
  const [width, height] = sprite.size;
  const palette = {};
  for (const [char, hex] of Object.entries(sprite.palette ?? {})) {
    palette[char] = hexToRgba(hex);
  }
  const rows = String(sprite.grid).replace(/\n$/, "").split("\n");
  const bytes = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const char = rows[y][x];
      if (char === ".") continue; // transparent, already zeroed
      const [r, g, b, a] = palette[char];
      const i = (y * width + x) * 4;
      bytes[i] = r;
      bytes[i + 1] = g;
      bytes[i + 2] = b;
      bytes[i + 3] = a;
    }
  }
  return {
    name: sprite.name,
    width,
    height,
    rgba: bytes.toString("base64"),
    // Carried through unrasterized: it is not pixels, it is the fact the MAP
    // gate reads to keep this art on its own side of a wall (see `space:` in
    // sprite-schema.mjs). Harmless in the bundle, and the alternative is a
    // second pass over the same files.
    ...(sprite.space ? { space: sprite.space } : {}),
  };
}

/** How big one recording may be. 2 MiB is about twelve seconds of CD-quality
 * stereo WAV — far past any sound effect, and short of the 16 MiB ceiling the
 * shell's zip reader puts on a single entry (`electron/src/mod-archive.ts`). */
const MAX_SAMPLE_BYTES = 2 * 1024 * 1024;
/** How much recorded audio one mod may ship. A whole 135-sound overhaul in
 * WAV fits; the warning below lands long before the refusal does. */
const MAX_SAMPLES_BYTES = 24 * 1024 * 1024;
/** Past this, say so: the bundle is base64 JSON that crosses to the page in
 * one message, alongside every OTHER installed mod's. */
const WARN_SAMPLES_BYTES = 8 * 1024 * 1024;

/** How big one recorded TRACK may be. Far larger than an effect's, because a
 * track is minutes rather than a second — 8 MiB is about eleven minutes of
 * Opus, past any loop this game asks for. It streams rather than decoding
 * whole (`music/recorded.ts`), so this bounds the BUNDLE, not memory. */
const MAX_TRACK_BYTES = 8 * 1024 * 1024;
/** …and how much recorded music one mod may ship. The bundle is base64 JSON
 * crossing to the page in one message, which is the real ceiling here. */
const MAX_TRACKS_BYTES = 32 * 1024 * 1024;

/**
 * RECORDED SOUNDS — `sounds/<id>.wav` and `sounds/<id>.mp3`.
 *
 * This is the one place a mod hands the game a media file rather than a
 * description of one, and the reason is that a sound designer's work IS the
 * waveform: `content/sounds/` describes every shipped effect as oscillators
 * because that keeps the app free of audio files, but nobody is going to spell
 * a recorded orchestral hit as a list of detunes.
 *
 * THE STEM IS THE ROUTING. A file named `enemy_killed.wav` replaces the sound
 * `enemy_killed`, everywhere it plays — no `on:` block, no manifest entry, no
 * new table. The event routing the shipped catalog already carries keeps
 * pointing where it pointed.
 *
 * The bytes are passed through UNTOUCHED and decoded by the browser's own
 * audio decoder in the page. This module therefore checks only what it can
 * check honestly: that the name is an id, that the container is one of the two
 * every WebView decodes, that the magic bytes agree with the extension, and
 * that the size is sane. It does not parse audio, and it must not start: a
 * decoder written here would be a decoder written by us for a stranger's file.
 *
 * @returns `[{ id, format, data }]` — `data` base64, ready for the bundle.
 */
function loadSamples(soundsDir, errors, warnings) {
  if (!existsSync(soundsDir)) return [];

  // Sorted so takes cycle in the order an author numbered them, and so a
  // build is byte-identical across filesystems.
  const files = readdirSync(soundsDir)
    .filter((f) => sampleStem(f) !== null)
    .sort((a, b) => {
      const clipA = sampleStem(a);
      const clipB = sampleStem(b);
      return clipA === clipB
        ? sampleTake(a) - sampleTake(b)
        : clipA.localeCompare(clipB);
    });

  /** clip name → `{ takes: [{ label, format, data }] }` */
  const clips = new Map();
  let total = 0;
  for (const file of files) {
    const label = `sounds/${file}`;
    const clip = sampleStem(file);
    const take = sampleTake(file);
    const format = file.slice(file.lastIndexOf(".") + 1);
    if (!/^[a-z][a-z0-9_]*$/.test(clip)) {
      errors.push(
        `${label}: "${clip}" is not a sound id — the file name IS the sound ` +
          "it replaces, so it takes lowercase letters, digits and underscores",
      );
      continue;
    }

    const existing = clips.get(clip);
    // ONE TAKE, ONE FILE. `enemy_hit.1.wav` beside `enemy_hit.1.mp3` is the
    // same collision the single-file case always had — which one won would be
    // decided by alphabetical order, which is not a decision anybody made.
    // (Two DIFFERENT takes of one clip are exactly what this feature is for,
    // so those are welcomed rather than refused.)
    if (existing?.takes.some((t) => t.take === take)) {
      errors.push(
        `${label}: take ${take} of "${clip}" is already recorded by ` +
          `${existing.takes.find((t) => t.take === take).label} — one take, ` +
          "one file",
      );
      continue;
    }

    const bytes = readFileSync(path.join(soundsDir, file));
    if (bytes.length === 0) {
      errors.push(`${label}: the file is empty`);
      continue;
    }
    if (bytes.length > MAX_SAMPLE_BYTES) {
      errors.push(
        `${label}: ${mib(bytes.length)} is over the ${mib(MAX_SAMPLE_BYTES)} ` +
          "limit for one recording — trim it, or ship it as .opus",
      );
      continue;
    }
    const actual = sniffAudio(bytes);
    if (actual === null) {
      errors.push(
        `${label}: the first bytes are not audio the game can play ` +
          `(${SAMPLE_EXTS.join(", ")}), so it would have nothing to play`,
      );
      continue;
    }
    if (actual !== format) {
      errors.push(
        `${label}: the contents are ${actual.toUpperCase()}, not ` +
          `${format.toUpperCase()} — rename it to "${file.slice(
            0,
            file.lastIndexOf("."),
          )}.${actual}"`,
      );
      continue;
    }
    total += bytes.length;
    const entry = existing ?? { id: clip, takes: [] };
    entry.takes.push({ take, label, format, data: bytes.toString("base64") });
    if (!existing) clips.set(clip, entry);
  }

  if (total > MAX_SAMPLES_BYTES) {
    errors.push(
      `sounds/: ${mib(total)} of recordings is over the ` +
        `${mib(MAX_SAMPLES_BYTES)} a mod may ship — every enabled mod's audio ` +
        "is held in memory at once",
    );
  } else if (total > WARN_SAMPLES_BYTES) {
    warnings.push(
      `sounds/: ${mib(total)} of recordings — .opus is about a third the size ` +
        "of .mp3 at the same quality, and the desktop shell decodes it",
    );
  }

  // Flattened to what the bundle carries: an id and its takes IN ORDER. The
  // take numbers themselves never travel — they only ever picked the order.
  return [...clips.values()].map((clip) => ({
    id: clip.id,
    formats: clip.takes.map((t) => t.format),
    takes: clip.takes.map((t) => t.data),
  }));
}

/**
 * RECORDED SCORES — `music/<id>.<ext>`.
 *
 * The same bargain as a recorded effect, made for stronger reasons: a mod that
 * has a finished mix should not have to re-enter it as tracker tokens. The stem
 * is the routing here too — `music/regolith_ride.opus` replaces the theme of
 * that name, and a brand-new id is named by a level's `music:`.
 *
 * Deliberately simpler than `loadSamples`: a track has no takes (nothing about
 * a two-minute loop repeats often enough to fatigue) and no mix block (it plays
 * at the music volume, like every other track).
 */
function loadMusicRecordings(musicDir, errors) {
  if (!existsSync(musicDir)) return [];
  const files = readdirSync(musicDir)
    .filter((f) => sampleStem(f) !== null)
    .sort();

  const out = [];
  const claimed = new Map();
  let total = 0;
  for (const file of files) {
    const label = `music/${file}`;
    const id = sampleStem(file);
    const format = file.slice(file.lastIndexOf(".") + 1);
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      errors.push(
        `${label}: "${id}" is not a track id — the file name IS the track it ` +
          "replaces, so it takes lowercase letters, digits and underscores",
      );
      continue;
    }
    if (claimed.has(id)) {
      errors.push(
        `${label}: "${id}" is already recorded by ${claimed.get(id)} — one ` +
          "track, one file",
      );
      continue;
    }
    claimed.set(id, label);

    const bytes = readFileSync(path.join(musicDir, file));
    if (bytes.length === 0) {
      errors.push(`${label}: the file is empty`);
      continue;
    }
    if (bytes.length > MAX_TRACK_BYTES) {
      errors.push(
        `${label}: ${mib(bytes.length)} is over the ${mib(MAX_TRACK_BYTES)} ` +
          "limit for one track — ship it as .opus, which is about a third of " +
          "MP3 at the same quality",
      );
      continue;
    }
    const actual = sniffAudio(bytes);
    if (actual === null) {
      errors.push(
        `${label}: the first bytes are not audio the game can play ` +
          `(${SAMPLE_EXTS.join(", ")})`,
      );
      continue;
    }
    if (actual !== format) {
      errors.push(
        `${label}: the contents are ${actual.toUpperCase()}, not ` +
          `${format.toUpperCase()} — rename it to "${id}.${actual}"`,
      );
      continue;
    }
    total += bytes.length;
    out.push({ id, data: bytes.toString("base64") });
  }

  if (total > MAX_TRACKS_BYTES) {
    errors.push(
      `music/: ${mib(total)} of recorded score is over the ` +
        `${mib(MAX_TRACKS_BYTES)} a mod may ship — the compiled bundle crosses ` +
        "to the game in one message",
    );
  }
  return out;
}

/** A `sample:` block's knobs, as the bundle carries them — omitted entirely
 * when the author set none, so a plain dropped-in file stays a bare clip. */
function mixOf(sample) {
  if (!sample) return {};
  const out = {};
  for (const key of [
    "volume",
    "pan",
    "echo",
    "rate",
    "pitchJitter",
    "volumeJitter",
  ]) {
    if (typeof sample[key] === "number") out[key] = sample[key];
  }
  if (typeof sample.pick === "string") out.pick = sample.pick;
  return out;
}

/**
 * What a file's first bytes say it is — one of `SAMPLE_EXTS`, or null.
 *
 * This is a NAME CHECK, not a parse: it exists so a mislabelled file is caught
 * here (where the author can rename it) rather than reaching a player as
 * silence. Nothing downstream branches on the answer — the page hands the bytes
 * to the browser's own decoder, which sniffs them again for real.
 */
function sniffAudio(bytes) {
  const head = (from, to) => bytes.toString("latin1", from, to);
  // RIFF....WAVE
  if (bytes.length >= 12 && head(0, 4) === "RIFF" && head(8, 12) === "WAVE") {
    return "wav";
  }
  // fLaC — a native FLAC stream.
  if (bytes.length >= 4 && head(0, 4) === "fLaC") return "flac";
  // An Ogg page. Which CODEC is inside decides the extension the author should
  // have used: an Opus stream opens `OpusHead`, a Vorbis one `\x01vorbis`, and
  // both sit at a fixed offset past the 27-byte page header + segment table.
  if (bytes.length >= 36 && head(0, 4) === "OggS") {
    const body = bytes.toString("latin1", 27, 80);
    if (body.includes("OpusHead")) return "opus";
    // Ogg FLAC exists and is legal; it is still a `.ogg` as far as a file name
    // goes, and the decoder does not care either.
    return "ogg";
  }
  // An ID3 tag, or a bare frame sync (11 set bits) for a tagless file.
  if (head(0, 3) === "ID3") return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "mp3";
  }
  return null;
}

/** A byte count, for a message a human reads. */
function mib(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * The mod's `animations.yaml`, parsed but not yet judged.
 *
 * Absent from almost every mod, and absent by design: the game's own art is two
 * frames per body and the renderer knows that convention by heart, so a mod
 * that draws two frames per body needs no file at all. This one is for the mod
 * that draws SIX — or that draws a mouth moving, which the convention has no
 * name for. See `scripts/asset-tools/animation-schema.mjs`.
 */
function readAnimations(modDir, errors) {
  const file = path.join(modDir, "animations.yaml");
  if (!existsSync(file)) return null;
  try {
    return parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`animations.yaml: not valid YAML — ${e.message}`);
    return null;
  }
}

/**
 * Id collisions, which mean different things per kind.
 *
 * An ADDON is playing alongside the shipped game, so a clash is a bug: the
 * player subscribed to something that adds a level and it silently ate one of
 * theirs. A CONVERSION is replacing the game, so a clash is the point — it is
 * how a mod re-skins THE MOON rather than adding a seventh venue — and is
 * allowed, loudly, in the report.
 */
/**
 * EVERY SOUND A MOD SHIPS, as the defs the page merges into its catalog.
 *
 * Three kinds go in and one comes out, which is the point:
 *
 *   * a YAML with `voices:` — carried through as authored, `call: sample`
 *     voices and all;
 *   * a YAML with a `sample:` block and a recording beside it — the block's
 *     knobs become the one voice's knobs;
 *   * a bare recording with no YAML at all — a one-voice def, which is what
 *     keeps "the file name is the whole of the routing" true.
 */
function soundDefs(modSounds, sampledIds) {
  const out = [];
  const authored = new Set();
  for (const entry of modSounds) {
    authored.add(entry.id);
    const voices = Array.isArray(entry.doc.voices)
      ? entry.doc.voices
      : sampledIds.has(entry.id)
        ? [{ call: "sample", clip: entry.id, ...mixOf(entry.doc.sample) }]
        : null;
    // A YAML that is neither is one the schema already refused; skip it rather
    // than emit a def with no voices, which would be a hole in the bank.
    if (!voices) continue;
    out.push([entry.id, { id: entry.id, voices, ...staging(entry.doc) }]);
  }
  // The bare recordings — a sound pack's whole contents.
  for (const id of sampledIds) {
    if (authored.has(id)) continue;
    out.push([id, { id, voices: [{ call: "sample", clip: id }] }]);
  }
  return out;
}

/** How a sound sits in the world, emitted only when the author asked for it. */
function staging(doc) {
  return {
    ...(doc.spatial ? { spatial: true } : {}),
    ...(doc.loop ? { loop: true } : {}),
    ...(doc.stopOn === undefined ? {} : { stopOn: doc.stopOn }),
    ...(doc.fadeMs === undefined ? {} : { fadeMs: doc.fadeMs }),
  };
}

/** Does this `on:` block answer a CUE rather than an engine event? */
function isCueOn(on) {
  return on?.cue !== undefined;
}

/** A cue `on:` block as the runtime looks it up by. Mirrors `playCue` in
 * pwa/src/game/sfx/cues.ts and the generator's own copy. */
function soundCueKey(on) {
  return [on.cue, on.surface ?? ""].join("|");
}

/** An `on:` block as the runtime looks a sound up by. Mirrors `routeKey` in
 * pwa/src/game/sfx/index.ts and the generator's own copy — three places, one
 * shape, and the sound tests pin all of them. */
function soundMatchKey(on) {
  return [
    on.type,
    on.weaponClass ?? "",
    on.crit ?? "",
    on.kind ?? "",
    on.tier ?? "",
  ].join("|");
}

function checkIds({
  manifest,
  catalog,
  kind,
  enemies,
  levels,
  items,
  sounds,
  /** The ids this mod ships a RECORDING for — see the sound clash below. */
  sampled,
  music,
  powerups,
  talents,
  companions,
  sets,
  cutscenes,
  thoughts,
  storyItems,
  quests,
  questGivers,
  errors,
}) {
  const shipped = {
    enemy: new Set(catalog.enemies),
    sound: new Set(catalog.sounds ?? []),
    music: new Set(catalog.music ?? []),
    weapon: new Set(catalog.weapons),
    gear: new Set(catalog.gear),
    unique: new Set(catalog.uniques),
    powerup: new Set(catalog.abilities ?? []),
    talent: new Set(catalog.talents ?? []),
    companion: new Set(catalog.companions ?? []),
    set: new Set(catalog.sets ?? []),
    cutscene: new Set(catalog.cutscenes ?? []),
    thought: new Set(catalog.thoughts ?? []),
    storyItem: new Set(catalog.storyItems ?? []),
    quest: new Set(catalog.quests ?? []),
    questGiver: new Set(catalog.questGivers ?? []),
  };
  const clashes = [];
  for (const id of Object.keys(enemies)) {
    if (shipped.enemy.has(id)) clashes.push(`enemy "${id}"`);
  }
  // A SHIPPED SPRITE'S ID IS ALLOWED TO AN ADDON, and this is the second place
  // the "an addon may not shadow a shipped id" rule deliberately inverts — for
  // the same reason the first one (a recording) does.
  //
  // Everywhere else, a shadowed id means the mod silently ate something the
  // player already had: an addon's level replacing a venue, its monster
  // replacing a breed, its quest replacing an errand. Art is not that. Naming a
  // sprite after the one it stands in for is the ONLY way to redraw it — the
  // mob is still `ghost`, its def, its drops and everything that references it
  // are untouched, and the only thing that changed is the picture. A RESKIN IS
  // THE ADDON-SHAPED CHANGE, and an art pack that had to declare itself a total
  // conversion to give the hero a new coat would be lying about what it does.
  //
  // It is not silent, either: `applyMods` claims every sprite name and the MODS
  // screen lists any two mods drawing the same one (`ModClash`), which is the
  // question a player actually has when two art packs are on at once.
  // A SHIPPED SOUND'S ID IS ALLOWED TO AN ADDON WHEN THE MOD RECORDED IT,
  // and only then. The rule everywhere else — an addon shadowing a shipped id
  // is a bug, because it silently ate something the player already had —
  // inverts for a recording: naming a file after the sound it stands in for is
  // the ONLY way to ship one, and a sound pack that had to declare itself a
  // total conversion to replace a footstep would be lying about what it does.
  // A synthesized `sounds/<id>.yaml` still has to be a conversion, because
  // that one CAN add a sound of its own and shadowing is likelier a typo.
  for (const s of sounds) {
    if (shipped.sound.has(s.id) && !sampled.has(s.id)) {
      clashes.push(`sound "${s.id}"`);
    }
  }
  for (const t of music) {
    if (shipped.music.has(t.id)) clashes.push(`track "${t.id}"`);
  }
  for (const id of Object.keys(powerups ?? {})) {
    if (shipped.powerup.has(id)) clashes.push(`powerup "${id}"`);
  }
  // A CONVERSION shadowing a talent id is how it REPLACES one of the game's —
  // which is also the only way to re-carry a proc block the shipped catalog
  // already claims (see the carrier check in `buildMod`).
  for (const id of Object.keys(talents ?? {})) {
    if (shipped.talent.has(id)) clashes.push(`talent "${id}"`);
  }
  // A CONVERSION shadowing `lucky` is the point — it is how a mod's spared elite
  // becomes its OWN figure rather than the leprechaun — so, like every other
  // clash, this is an error only for an ADDON.
  for (const id of Object.keys(companions ?? {})) {
    if (shipped.companion.has(id)) clashes.push(`companion "${id}"`);
  }
  for (const id of Object.keys(sets ?? {})) {
    if (shipped.set.has(id)) clashes.push(`set "${id}"`);
  }
  // The story. A CONVERSION shadowing `prelude` is the point — it is how a mod
  // opens on its own night instead of Ada's — so, like every other clash, this
  // is an error only for an ADDON.
  for (const id of Object.keys(cutscenes ?? {})) {
    if (shipped.cutscene.has(id)) clashes.push(`cutscene "${id}"`);
  }
  for (const id of Object.keys(thoughts ?? {})) {
    if (shipped.thought.has(id)) clashes.push(`thought "${id}"`);
  }
  for (const id of Object.keys(storyItems ?? {})) {
    if (shipped.storyItem.has(id)) clashes.push(`story item "${id}"`);
  }
  for (const id of Object.keys(quests ?? {})) {
    if (shipped.quest.has(id)) clashes.push(`quest "${id}"`);
  }
  for (const id of Object.keys(questGivers ?? {})) {
    if (shipped.questGiver.has(id)) clashes.push(`quest giver "${id}"`);
  }
  for (const [list, what] of [
    [items.weapons, "weapon"],
    [items.gear, "gear piece"],
    [items.uniques, "unique"],
  ]) {
    const known = shipped[what === "gear piece" ? "gear" : what];
    for (const entry of list) {
      if (known.has(entry.id)) clashes.push(`${what} "${entry.id}"`);
    }
  }
  // A level id is checked against the shipped campaign by name; the game's own
  // registry throws on a duplicate, so this must never reach it.
  for (const def of levels) {
    if (catalog.levels?.includes(def.id)) clashes.push(`level "${def.id}"`);
  }

  if (clashes.length === 0 || kind === "conversion") return;
  errors.push(
    `${clashes.length} id(s) already exist in the base game: ` +
      `${clashes.slice(0, 8).join(", ")}${clashes.length > 8 ? ", …" : ""}. ` +
      `Prefix them with "${manifest.id}_", or set kind: conversion if this ` +
      "mod is meant to REPLACE that content rather than add to it.",
  );
}

/** The campaign a conversion declares, checked against the levels it ships. */
function campaignOrder(manifest, kind, entries, errors) {
  const ids = entries.map((e) => e.id);
  if (kind !== "conversion") {
    // An addon's levels join the game's own order at their authored index.
    return null;
  }
  const declared = manifest.campaign;
  if (!Array.isArray(declared) || declared.length === 0) {
    errors.push(
      "mod.yaml: a conversion must list its campaign — `campaign: [level-id, …]` " +
        "in play order. It REPLACES the game's, so there is nothing to fall " +
        "back to.",
    );
    return null;
  }
  for (const id of declared) {
    if (!ids.includes(id)) {
      errors.push(
        `mod.yaml: campaign names "${id}", which this mod does not ship ` +
          `(it has ${ids.length ? ids.join(", ") : "no levels"})`,
      );
    }
  }
  return declared;
}

/**
 * THE BRAND a conversion puts on the title screen, in place of the game's own.
 *
 * A total conversion that is a different game with a different story and a
 * different hero still opened under somebody else's name, which is the loudest
 * thing on the screen saying whose game it really is. So a conversion may
 * declare its own `brand:` — and only a conversion: an ADDON is content INSIDE
 * this game, and one that renamed the whole game from a corner of the main menu
 * would be lying about what it is.
 *
 * What it may replace is exactly the two strings the title screen draws. The
 * storage prefix, the cache id, the archive format's game name and every
 * discovery surface (the `<title>`, the manifest, the OG card) are NOT here and
 * must never be: those are the INSTALL's identity, and a mod that moved them
 * would orphan the player's roster and rewrite a site it does not own.
 */
/**
 * `contents:` — the manifest's inventory: every file the game loads, and what
 * each one is in the author's own words.
 *
 * It travels in the bundle because the MODS screen shows it: a player who taps
 * a mod is asking "what does this do to my game", and counting a bundle's
 * levels and monsters answers that only in the arithmetic sense. Nobody but the
 * author can say that the new venue is a seed vault or that a sound file
 * replaces the shotgun's bark.
 *
 * The COMPLETENESS check — that every file in the folder is described, and that
 * nothing else is in there at all — belongs to `validate.mjs`, which audits a
 * folder rather than compiling one. Here the block is optional and only its
 * shape is checked: a mod published before the block existed still loads, and
 * says so with a warning rather than becoming unplayable on an update.
 */
function readContents(manifest, modDir, catalog, errors, warnings) {
  const declared = manifest.contents;
  if (declared === undefined) {
    warnings.push(
      "mod.yaml: no contents: block — the MODS screen can only count this " +
        "mod's files instead of saying what they are (mod/FORMAT.md → contents:)",
    );
    return [];
  }
  if (!Array.isArray(declared)) {
    errors.push("mod.yaml: contents: must be a list of { path, summary }");
    return [];
  }
  const out = [];
  declared.forEach((entry, i) => {
    const at = `mod.yaml: contents[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${at}: expected a mapping with a path: and a summary:`);
      return;
    }
    const file = String(entry.path ?? "");
    const summary = String(entry.summary ?? "").trim();
    const change = entry.change ?? "adds";
    // A path that escapes the folder is refused by NAME, before anything opens
    // it — the same rule the archive reader applies, for the same reason.
    if (
      !file ||
      file.includes("\\") ||
      file.startsWith("/") ||
      file.split("/").includes("..")
    ) {
      errors.push(`${at}: path "${file}" must be relative to the mod folder`);
      return;
    }
    if (!existsSync(path.join(modDir, file))) {
      errors.push(`${at}: "${file}" is not in the mod folder`);
      return;
    }
    if (!summary) {
      errors.push(`${at}: "${file}" needs a summary: — one line, for a player`);
      return;
    }
    if (change !== "adds" && change !== "replaces") {
      errors.push(`${at}: change "${change}" — expected "adds" or "replaces"`);
      return;
    }
    // Drawn in the game's own pixel font on the MOD INFO screen, so it gets the
    // check `brand:` gets: a pasted em dash is a "?" on the player's screen.
    const problem = glyphProblem(summary, catalog.glyphs, "summary");
    if (problem) errors.push(`${at}: ${problem}`);
    out.push({ path: file, summary, change });
  });
  return out;
}

function readBrand(manifest, kind, catalog, errors) {
  const brand = manifest.brand;
  if (brand === undefined) return null;
  if (typeof brand !== "object" || brand === null || Array.isArray(brand)) {
    errors.push("mod.yaml: brand must be a mapping of title/tagline");
    return null;
  }
  if (kind !== "conversion") {
    errors.push(
      "mod.yaml: only a conversion may set `brand:` — an addon adds to this " +
        "game rather than replacing it, so it does not get to rename it",
    );
    return null;
  }
  const title = String(brand.title ?? "").trim();
  const tagline = String(brand.tagline ?? "").trim();
  if (!title) {
    errors.push("mod.yaml: brand.title is required when `brand:` is set");
    return null;
  }
  // Length is a LAYOUT rule, not a taste one: the title screen measures its own
  // logo and steps the scale down until it fits (`fitScale`), so an essay does
  // not overflow — it shrinks to nothing legible on a phone held sideways.
  if (title.length > 28)
    errors.push(
      `mod.yaml: brand.title is ${title.length} characters — keep it to 28 or ` +
        "it shrinks to fit a phone and stops being readable",
    );
  if (tagline.length > 48)
    errors.push(
      `mod.yaml: brand.tagline is ${tagline.length} characters — keep it to 48`,
    );
  for (const [field, text] of [
    ["title", title],
    ["tagline", tagline],
  ]) {
    const problem = glyphProblem(text, catalog.glyphs, `brand.${field}`);
    // The generic wording plus where it would show: a "?" at triple size across
    // the author's own front page is worth naming.
    if (problem)
      errors.push(`mod.yaml: ${problem} — across the top of your title screen`);
  }
  return { title, tagline };
}

/**
 * The map schema's region gate, backed by the catalog's snapshot of the names
 * the engine's parser accepts.
 *
 * It is shaped as a THROWING parser rather than a Set because that is the shape
 * `validateMap` takes — the repo's own build hands it `parseRegion` straight out
 * of the engine — so there is one code path in the schema and the difference
 * between the two callers stays here, in the one file that knows the app has no
 * engine to ask.
 */
function regionChecker(regions) {
  const known = new Set(regions ?? []);
  return (name) => {
    if (typeof name !== "string" || !known.has(name.toLowerCase()))
      throw new Error(
        `unknown compass region "${name}" — try northeast, center-east, south ` +
          "(`cli.mjs ids --kind regions` lists them all)",
      );
  };
}

const union = (...lists) => new Set(lists.flat());
const prefix = (msgs, label) => msgs.map((m) => `${label}: ${m}`);
const rel = (p) => path.basename(p);

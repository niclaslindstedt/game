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
//  3. **Nothing executes.** A bundle is data: defs, and sprites as raw pixels.
//     There is no scripting hook, and adding one would turn "subscribe to a
//     mod" into "run a stranger's code".
//
// See mod/README.md for the authoring guide and mod/FORMAT.md for the
// reference.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { validateCompanion } from "../../scripts/asset-tools/companion-schema.mjs";
import { validateDifficultyVoice } from "../../scripts/asset-tools/difficulty-schema.mjs";
import { validateEnemy } from "../../scripts/asset-tools/enemy-schema.mjs";
import { validateItem } from "../../scripts/asset-tools/item-schema.mjs";
import { validateLevel } from "../../scripts/asset-tools/level-schema.mjs";
import { validateMap } from "../../scripts/asset-tools/map-schema.mjs";
import { validateTrack } from "../../scripts/asset-tools/music-schema.mjs";
import { validatePowerup } from "../../scripts/asset-tools/powerup-schema.mjs";
import { validateSet } from "../../scripts/asset-tools/set-schema.mjs";
import { validateSound } from "../../scripts/asset-tools/sound-schema.mjs";
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
import { loadSets } from "../../scripts/set-data/load-yaml.mjs";
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

/** The bundle format the game loads. Bumped on a breaking change so an old
 * build refuses a new bundle loudly instead of half-reading it. */
export const BUNDLE_FORMAT = 1;

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
  const music = loadTree(
    () => loadMusic(path.join(modDir, "music")),
    "music",
    fail,
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
  const modMusic = music?.entries ?? [];
  const modPowerups = powerups?.powerups ?? {};
  const modTalents = talents?.talents ?? {};
  const modCompanions = companions?.companions ?? {};
  const modSets = sets?.sets ?? {};
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
    modSounds.length +
    modMusic.length +
    Object.keys(modPowerups).length +
    Object.keys(modTalents).length +
    Object.keys(modCompanions).length +
    Object.keys(modSets).length +
    Object.keys(modDifficulties).length +
    Object.keys(modCutscenes).length +
    Object.keys(modThoughts).length +
    Object.keys(modStoryItems).length +
    Object.keys(modQuests).length;
  if (adds === 0) {
    fail(
      "a mod must add at least one level, map blueprint, enemy, item, sound, " +
        "track, powerup, talent, companion, cutscene, thought, story item or " +
        "quest — a bundle of nothing would install and do nothing at all",
    );
  }

  checkIds({
    manifest,
    catalog,
    kind,
    enemies: modEnemies,
    levels: modLevels,
    items: modItems,
    sprites,
    sounds: modSounds,
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
    events: new Set(catalog.events ?? []),
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
  const soundIds = union(
    catalog.sounds ?? [],
    modSounds.map((e) => e.id),
  );
  for (const entry of modMusic) {
    const res = validateTrack(entry.doc);
    errors.push(...prefix(res.errors, `music/${entry.id}`));
    warnings.push(...prefix(res.warnings, `music/${entry.id}`));
  }
  const claimed = new Map();
  for (const entry of modSounds) {
    const res = validateSound(entry.doc, { events: refs.events });
    errors.push(...prefix(res.errors, `sounds/${entry.id}`));
    warnings.push(...prefix(res.warnings, `sounds/${entry.id}`));
    // Two of a mod's OWN sounds answering one event shape is the same error the
    // shipped pipeline reports: which of them plays would be decided by file
    // order, which is not a decision anybody made. (Two MODS colliding is a
    // different thing entirely, and the load order settles that one.)
    if (!entry.doc.on) continue;
    const key = soundMatchKey(entry.doc.on);
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

  // The atlas as this mod will see it: the base game's names plus its own. Every
  // schema that checks a sprite reference resolves against this one set — the
  // same base ∪ mod rule every other cross-reference follows.
  const spriteNames = union(
    catalog.sprites,
    sprites.map((s) => s.name),
  );
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
      sounds: Object.fromEntries(
        modSounds.map((e) => [e.id, { id: e.id, voices: e.doc.voices }]),
      ),
      // Event shape → sound id, keyed exactly as the game's own catalog is, so
      // a mod can replace a shipped sound by answering the same event.
      soundKeys: Object.fromEntries(
        modSounds
          .filter((e) => e.doc.on)
          .map((e) => [soundMatchKey(e.doc.on), e.id]),
      ),
      // Cooked here rather than in the page, for the same reason the sprites
      // are rasterized here: the renderer gets data it can use directly, and
      // the only YAML parser in the build stays in the main process.
      music: Object.fromEntries(modMusic.map((e) => [e.id, cookTrack(e.doc)])),
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
 * no YAML. That keeps the whole pixel format on this side of the wall, so the
 * renderer's job stays "make an ImageBitmap out of these bytes" and a mod
 * cannot reach the atlas pipeline at all.
 */
function loadSprites(spritesDir, errors, warnings) {
  const out = [];
  if (!existsSync(spritesDir)) return out;

  const families = readdirSync(spritesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const seen = new Set();
  for (const family of families) {
    const dir = path.join(spritesDir, family);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
      .sort();
    for (const file of files) {
      const label = `sprites/${family}/${file}`;
      let sprite;
      try {
        sprite = parse(readFileSync(path.join(dir, file), "utf8"));
      } catch (e) {
        errors.push(`${label}: not valid YAML — ${e.message}`);
        continue;
      }
      const stem = file.slice(0, -".yaml".length);
      if (sprite?.name !== stem) {
        errors.push(`${label}: name is "${sprite?.name}", expected "${stem}"`);
        continue;
      }
      const res = validateSprite(sprite);
      errors.push(...prefix(res.errors, label));
      warnings.push(...prefix(res.warnings, label));
      if (res.errors.length > 0) continue;

      if (seen.has(sprite.name)) {
        errors.push(`${label}: duplicate sprite name "${sprite.name}"`);
        continue;
      }
      seen.add(sprite.name);
      out.push(rasterize(sprite));
    }
  }
  return out;
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
  };
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
/** An `on:` block as the runtime looks a sound up by. Mirrors `soundKey` in
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
  sprites,
  sounds,
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
    sprite: new Set(catalog.sprites),
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
  for (const s of sprites) {
    if (shipped.sprite.has(s.name)) clashes.push(`sprite "${s.name}"`);
  }
  for (const s of sounds) {
    if (shipped.sound.has(s.id)) clashes.push(`sound "${s.id}"`);
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

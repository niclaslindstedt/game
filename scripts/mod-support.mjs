// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MOD SUPPORT FOR THE REPO'S OWN TOOLS — the one seam that makes the analyzers,
// renderers and simulators in `scripts/` answer about a MOD's content instead of
// only the shipped campaign. (What takes the flag and what deliberately does
// not — the engine benchmarks, the hero's XP curve, the app-side preview
// scripts — is listed in mod/AGENTS.md step 5.)
//
// The whole balance/art/design toolchain in this repo (map-layout, level-render,
// simulate-run, drop-rate, progression-sim, the weapon calculators, the sprite
// previews) exists because a number nobody measured is a number nobody tuned.
// A mod author has exactly the same problem — is this venue survivable, does
// this monster con right, is this weapon on the damage-budget line, does the
// carve read as a place — and no way at all to answer it from inside the game.
// So every one of those tools takes `--mod <dir>`, and this module is what that
// flag does.
//
// Three rules hold it together:
//
//  1. **A mod is COMPILED, exactly as the game compiles it.** `buildMod` is the
//     same compiler `mod/tools/cli.mjs check` and the shipped desktop app run,
//     against the same schemas — so a mod a script will render is a mod the game
//     would accept, and a broken one fails here with the same message it fails
//     with there. There is no second, looser loader for tooling.
//  2. **The mod goes in through `registerDefs`**, the seam the app and the
//     engine test suites already use (see pwa/src/game/mods.ts, whose merge this
//     mirrors). A script therefore measures a mod's level through the same
//     `createGame`/`levelDef`/`enemyDef` path a run does, and nothing in the
//     engine learns that a mod exists.
//  3. **The SHIPPED catalog objects are merged IN PLACE as well.** The registry
//     is what the engine reads, but half the scripts read the exported records
//     directly (`ENEMY_DEFS[id].role`, `Object.values(WEAPON_DEFS)`,
//     `LEVEL_ORDER`) because they are reporting on a catalog rather than
//     playing it. Assigning into those same objects is what makes `--mod` one
//     line per script instead of a rewrite of each one's data access. It is a
//     TOOLING-only liberty — the app never does this, it starts every apply
//     from the shipped catalogs so switching a mod off removes its content —
//     and it is safe here because a script process loads one set of mods, once,
//     before it does any work, and then exits.
//
// Load order is the player's rule, kept: `--mod a --mod b` means b wins any id
// they both define, exactly as the MODS screen's list does. Clashes are
// reported rather than performed silently.
//
// Usage in a script:
//
//   import { takeModFlags, applyMods } from "./mod-support.mjs";
//   const { mods, rest } = takeModFlags(process.argv.slice(2));
//   const loaded = await applyMods(mods);      // null when no --mod was given
//   // …parse `rest` as before; loaded?.levels are the mod's own level entries
//
// Call `applyMods` BEFORE the script reads any catalog, and
// `installModSprites` (below) before it rasterizes any sprite.

import { register } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { buildMod } from "../mod/tools/build.mjs";
import { readCatalog } from "../mod/tools/catalog-read.mjs";
import { loadLevels } from "./level-data/load-yaml.mjs";
import { gridRows } from "./asset-tools/sprite-schema.mjs";
import { paletteFromHex } from "./asset-tools/sprite-yaml.mjs";

// The engine uses the @game/lib alias at runtime, so map it before anything
// here imports the engine — registering twice is harmless (the hooks chain and
// each one passes a specifier it does not own straight through), which is why
// this module does not care whether its caller registered it first.
register("./game-alias-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const engine = (p) => path.join(root, p);

/** The one-line flag summary to paste into a script's `--help` usage string. */
export const MOD_FLAG_USAGE = "[--mod <dir>]";

/** The paragraph to paste under a script's `--help`, so every tool explains the
 * flag the same way. */
export const MOD_FLAG_HELP =
  "mods (--mod <dir>, repeatable): compile that mod folder and read the game\n" +
  "                 WITH it — its levels, monsters, items, powers and blueprints\n" +
  "                 are registered exactly as the desktop game registers them, so\n" +
  "                 this tool reports on the modded game. Repeat the flag to stack\n" +
  "                 mods in load order (the LAST one wins any id two of them\n" +
  "                 define). A mod that does not compile fails here with the same\n" +
  "                 message `node mod/tools/cli.mjs check` gives.";

/**
 * Pull every `--mod <dir>` out of an argument list.
 *
 * Separated from applying them because most scripts hand their arguments to a
 * parser that rejects what it does not recognise: strip the flag first, parse
 * what is left exactly as before.
 *
 * @returns `{ mods, rest }` — resolved mod directories in the order given, and
 *          the arguments with those pairs removed.
 */
export function takeModFlags(args) {
  const mods = [];
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--mod") {
      const dir = args[i + 1];
      if (!dir || dir.startsWith("--")) {
        throw new Error("--mod needs a mod folder — `--mod path/to/my-mod`");
      }
      mods.push(path.resolve(dir));
      i += 1;
    } else if (arg.startsWith("--mod=")) {
      mods.push(path.resolve(arg.slice("--mod=".length)));
    } else {
      rest.push(arg);
    }
  }
  return { mods, rest };
}

/**
 * Compile a stack of mods and merge them into the live game.
 *
 * @param dirs   mod folders in LOAD ORDER (earliest first, last wins a clash)
 * @param quiet  suppress the "loaded MY MOD" line (a machine-readable dump)
 * @returns null when `dirs` is empty — so a caller can pass its flag through
 *          unconditionally — otherwise `{ bundles, levels, levelIds, dirs }`,
 *          where `levels` are the mods' own level entries in the `loadLevels`
 *          shape (`{ id, def, description, campaign, secret }`) the renderers
 *          take.
 */
export async function applyMods(dirs, { quiet = false } = {}) {
  if (!dirs || dirs.length === 0) return null;

  const catalog = readCatalog(path.join(root, "mod", "catalog.json"));
  const bundles = [];
  const levels = [];
  // Which venues each bundle brought, in the loader's own shape — the merge
  // needs the `campaign`/`secret` flags to place them, and those are shed on
  // the way onto a `LevelDef` (both kinds carry an `index`, so the def alone
  // cannot say which order a venue belongs in).
  const entriesPerBundle = [];
  for (const dir of dirs) {
    if (!existsSync(path.join(dir, "mod.yaml"))) {
      throw new Error(`${dir}: no mod.yaml — is that a mod folder?`);
    }
    const { bundle, errors, warnings } = buildMod(dir, catalog);
    for (const w of warnings) console.warn(`! ${path.basename(dir)}: ${w}`);
    if (!bundle) {
      for (const e of errors) console.error(`  ✗ ${e}`);
      throw new Error(
        `${path.basename(dir)}: ${errors.length} problem(s) — the mod does ` +
          "not compile, so there is nothing to measure. Fix them (the same " +
          "list `node mod/tools/cli.mjs check` prints) and run this again.",
      );
    }
    bundles.push(bundle);
    // The level ENTRIES rather than the bundle's bare defs: the renderers key
    // off the same `{ id, def, description, campaign, secret }` shape
    // `loadLevels` hands them for the shipped tree, and the description is a
    // map's design intent — the first thing `map-improvement` reads.
    const entries = modLevelEntries(dir);
    entriesPerBundle.push(entries);
    levels.push(...entries);
    if (!quiet) {
      console.log(
        `mod: ${bundle.name} ${bundle.version} (${bundle.id}, ${bundle.kind})` +
          ` — ${bundle.levels.length} level(s), ` +
          `${Object.keys(bundle.enemies).length} monster(s), ` +
          `${Object.keys(bundle.blueprints ?? {}).length} blueprint(s)`,
      );
    }
  }

  await mergeIntoGame(bundles, entriesPerBundle, { quiet });

  return {
    bundles,
    levels,
    levelIds: levels.map((e) => e.id),
    dirs,
  };
}

/** A mod's level entries, read the way the shipped tree is read — its own
 * `ladder.yaml` rows merged in, which is what prices its venues on the game's
 * depth ladder (see `loadLevels`). */
function modLevelEntries(dir) {
  const ladderPath = path.join(dir, "ladder.yaml");
  const extraLadder = existsSync(ladderPath)
    ? (parse(readFileSync(ladderPath, "utf8")) ?? {})
    : {};
  return loadLevels(path.join(dir, "levels"), { extraLadder }).entries;
}

/**
 * The merge itself — the tooling twin of `applyMods` in pwa/src/game/mods.ts.
 *
 * Every catalog is merged in bundle order so the last mod wins, then handed to
 * `registerDefs` AND assigned back into the exported record the shipped
 * catalog lives in (see rule 3 in this file's header).
 */
async function mergeIntoGame(bundles, entriesPerBundle, { quiet }) {
  const core = await import(engine("src/index.ts"));
  const {
    registerDefs,
    LEVELS,
    MAP_BLUEPRINTS,
    ENEMY_DEFS,
    WEAPON_DEFS,
    GEAR_DEFS,
    UNIQUE_DEFS,
    SET_DEFS,
    ABILITY_DEFS,
    COMPANION_DEFS,
    CUTSCENE_DEFS,
    THOUGHT_DEFS,
    CAP_THOUGHT_IDS,
    STORY_ITEM_DEFS,
    QUEST_DEFS,
    QUEST_GIVER_DEFS,
    DIFFICULTY_DEFS,
    LEVEL_ORDER,
    SECRET_LEVEL_ORDER,
  } = core;

  const owners = new Map();
  const claim = (kind, id, modId) => {
    const key = `${kind} "${id}"`;
    owners.set(key, [...(owners.get(key) ?? []), modId]);
  };
  const fold = (target, additions, kind, modId) => {
    for (const [id, def] of Object.entries(additions ?? {})) {
      if (id in target) claim(kind, id, modId);
      target[id] = def;
    }
  };

  let capThoughts = CAP_THOUGHT_IDS;
  for (const [i, bundle] of bundles.entries()) {
    fold(
      LEVELS,
      Object.fromEntries(bundle.levels.map((def) => [def.id, def])),
      "level",
      bundle.id,
    );
    fold(MAP_BLUEPRINTS, bundle.blueprints, "blueprint", bundle.id);
    fold(ENEMY_DEFS, bundle.enemies, "enemy", bundle.id);
    fold(WEAPON_DEFS, bundle.weapons, "weapon", bundle.id);
    fold(GEAR_DEFS, bundle.gear, "gear", bundle.id);
    fold(UNIQUE_DEFS, bundle.uniques, "unique", bundle.id);
    fold(SET_DEFS, bundle.sets, "set", bundle.id);
    fold(ABILITY_DEFS, bundle.powerups, "powerup", bundle.id);
    fold(COMPANION_DEFS, bundle.companions, "companion", bundle.id);
    fold(CUTSCENE_DEFS, bundle.cutscenes, "cutscene", bundle.id);
    fold(THOUGHT_DEFS, bundle.thoughts, "thought", bundle.id);
    fold(STORY_ITEM_DEFS, bundle.storyItems, "story item", bundle.id);
    fold(QUEST_DEFS, bundle.quests, "quest", bundle.id);
    fold(QUEST_GIVER_DEFS, bundle.questGivers, "quest giver", bundle.id);
    if (bundle.capRotation?.length) capThoughts = bundle.capRotation;
    // The ladder's VOICE is a partial overlay, never a replacement: a mod says
    // what a rung is CALLED and the numbers behind it stay the game's.
    for (const [id, voice] of Object.entries(bundle.difficulties ?? {})) {
      const base = DIFFICULTY_DEFS[id];
      if (!base) continue;
      DIFFICULTY_DEFS[id] = {
        ...base,
        name: voice.name ?? base.name,
        tagline: voice.tagline ?? base.tagline,
      };
    }
    orderLevels(
      bundle,
      entriesPerBundle[i] ?? [],
      LEVEL_ORDER,
      SECRET_LEVEL_ORDER,
      LEVELS,
    );
  }

  // The two catalogs that also publish a SNAPSHOT LIST of their ids, taken at
  // module load: the authoring tools iterate those rather than the record (the
  // relic audits walk `UNIQUE_IDS`), so a mod merged into the record alone would
  // be invisible to exactly the checks a mod most needs run over it.
  const { UNIQUE_IDS } = await import(engine("src/game/defs/uniques.ts"));
  const { SET_IDS } = await import(engine("src/game/defs/sets.ts"));
  for (const [list, catalog] of [
    [UNIQUE_IDS, UNIQUE_DEFS],
    [SET_IDS, SET_DEFS],
  ]) {
    for (const id of Object.keys(catalog)) {
      if (!list.includes(id)) list.push(id);
    }
  }

  const contested = [...owners.entries()].filter(([, m]) => m.length > 1);
  if (contested.length > 0 && !quiet) {
    for (const [what, mods] of contested) {
      console.warn(
        `! ${what} is defined by ${mods.join(", ")} — "${mods.at(-1)}" wins ` +
          "(it is later in the load order)",
      );
    }
  }

  registerDefs({
    levels: LEVELS,
    blueprints: MAP_BLUEPRINTS,
    enemies: ENEMY_DEFS,
    // Weapons and gear are ONE registry pair behind `registerDefs`, so both go
    // together or the omitted one is replaced with an empty catalog.
    weapons: WEAPON_DEFS,
    gear: GEAR_DEFS,
    uniques: UNIQUE_DEFS,
    sets: SET_DEFS,
    abilities: ABILITY_DEFS,
    companions: COMPANION_DEFS,
    difficulties: DIFFICULTY_DEFS,
    cutscenes: CUTSCENE_DEFS,
    thoughts: THOUGHT_DEFS,
    capThoughts,
    storyItems: STORY_ITEM_DEFS,
    quests: QUEST_DEFS,
    questGivers: QUEST_GIVER_DEFS,
  });
}

/**
 * Where a mod's venues sit in the play order the tools iterate (`--all`,
 * `--level all`).
 *
 * A CONVERSION replaces the campaign outright — that is what it declared its
 * `campaign:` for — while an ADDON's venues join the shipped order at their own
 * authored `index`, and its SECRET ones join the secret list instead, which is
 * exactly the split the shipped compiler makes. Both arrays are mutated in
 * place: they are module-level bindings the whole engine and every script read,
 * and a fresh array would be seen by nobody.
 */
function orderLevels(bundle, entries, order, secretOrder, levels) {
  if (bundle.kind === "conversion" && bundle.campaign?.length) {
    order.splice(0, order.length, ...bundle.campaign);
    return;
  }
  const fresh = entries.filter(
    (e) => !order.includes(e.id) && !secretOrder.includes(e.id),
  );
  for (const entry of fresh) {
    if (entry.secret) secretOrder.push(entry.id);
    else order.push(entry.id);
  }
  // Re-sort the campaign by story index, so an addon's venue lands where it
  // says it does rather than merely at the end.
  order.sort((a, b) => (levels[a]?.index ?? 0) - (levels[b]?.index ?? 0));
}

/**
 * Merge a mod's sprites into the node-side sprite maps, so every tool that
 * DRAWS (level-render, map-layout's mob shapes, the sprite previews, the art
 * audit sheets) paints a mod's monster as its own art rather than as a hole.
 *
 * The grids are read from the mod's YAML rather than decoded back out of the
 * compiled bundle's RGBA: these tools render from `SPRITES` + `SPRITE_PALETTES`
 * (char grid + palette), which is what the whole preview pipeline is built on,
 * and a rasterized bitmap would have to be un-rasterized to join it.
 *
 * `sprite-data/index.mjs` is imported here rather than at the top of this file
 * because loading it walks the entire shipped sprite tree and derives every
 * wound and worn frame — real work a simulation-only script must not pay for.
 *
 * @returns the number of sprites merged.
 */
export async function installModSprites(loaded) {
  if (!loaded) return 0;
  const {
    CORE_PALETTE,
    FAMILIES,
    SPRITES,
    SPRITE_PALETTES,
    SPRITE_FAMILY,
    deriveWorn,
    deriveWounds,
  } = await import("./sprite-data/index.mjs");

  let count = 0;
  for (const [i, dir] of loaded.dirs.entries()) {
    const bundle = loaded.bundles[i];
    const spritesDir = path.join(dir, "sprites");
    if (existsSync(spritesDir)) {
      const familyNames = readdirSync(spritesDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      for (const name of familyNames) {
        const familyDir = path.join(spritesDir, name);
        const files = readdirSync(familyDir)
          .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
          .sort();
        // A mod's family has no `_family.yaml`: every mod sprite carries its
        // own concrete palette, which is the whole of the format on that side
        // of the wall. The family palette is therefore the union of its
        // sprites' own colours OVER the shared core — the core half is what
        // makes the derived wound frames (whose splat/core/scuff chars come
        // from it) render in blood rather than in nothing.
        const family = FAMILIES.find((f) => f.name === name) ?? {
          name,
          ground: "moon_0",
          palette: { ...CORE_PALETTE },
          localPalette: {},
          sprites: {},
          animations: {},
          contrastExempt: [],
          speckleExempt: [],
        };
        if (!FAMILIES.includes(family)) FAMILIES.push(family);
        for (const file of files) {
          const sprite = parse(readFileSync(path.join(familyDir, file), "utf8"));
          // Already validated by `buildMod` — a mod whose sprite is malformed
          // never reaches this function.
          const grid = gridRows(sprite.grid);
          const palette = paletteFromHex(sprite.palette ?? {});
          SPRITES[sprite.name] = grid;
          SPRITE_PALETTES[sprite.name] = palette;
          SPRITE_FAMILY[sprite.name] = name;
          family.sprites[sprite.name] = grid;
          Object.assign(family.palette, palette);
          count += 1;
        }
      }
    }
    // The derived halves, exactly as the shipped pipeline derives them: a mod's
    // monster earns its battle-damage frames and a mod's armor its on-body
    // overlay, so a preview of a modded fight shows a wounded creeper and a
    // hero wearing the mod's plate rather than the shipped fallbacks.
    deriveWounds(bundle.enemies ?? {});
    deriveWorn(bundle.gear ?? {});
  }
  return count;
}

/**
 * The two flags together, for the common case: a script that renders.
 *
 * @returns the `applyMods` result (or null), with the mods' sprites already in
 *          the sprite maps.
 */
export async function applyModsWithSprites(dirs, options) {
  const loaded = await applyMods(dirs, options);
  await installModSprites(loaded);
  return loaded;
}

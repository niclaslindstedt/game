// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENGINE SEAM. Everything the library knows about the game passes through
// this module, and it reaches the game exactly two ways:
//
//   1. AUTHORED facts are read from the COMPILED catalogs (`src/generated/*`,
//      surfaced through `src/game/defs/**`) — the schema-validated, cross-
//      referenced, ladder-stamped form the game itself runs on, never the raw
//      YAML.
//   2. DERIVED facts — an enemy's hp on nightmare after the level ladder and
//      the menace curve, what a kill pays — come from CALLING the engine's own
//      functions. Never from re-deriving the maths here.
//
// No gameplay number is typed into the library. If a fact can't be reached by
// one of the two routes above it doesn't go on a page.
//
// The engine uses the `@game/lib` alias at runtime, so the resolver hook the
// other calculators register (scripts/game-alias-loader.mjs) is registered here
// before the first engine import.

import { register } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repository root — the engine lives at `<root>/src`. */
export const REPO = resolve(__dirname, "../../..");

register(pathToFileURL(join(REPO, "scripts/game-alias-loader.mjs")).href);

const engine = (path) => import(pathToFileURL(join(REPO, "src", path)).href);

const [
  enemies,
  levels,
  difficulties,
  equipment,
  gear,
  uniques,
  story,
  companions,
  abilities,
  menace,
  leveling,
  loot,
  config,
] = await Promise.all([
  engine("game/defs/enemies/index.ts"),
  engine("game/defs/levels/index.ts"),
  engine("game/defs/difficulties.ts"),
  engine("game/defs/equipment.ts"),
  engine("game/defs/gear.ts"),
  engine("game/defs/uniques.ts"),
  engine("game/defs/story.ts"),
  engine("game/defs/companions.ts"),
  engine("game/defs/abilities.ts"),
  engine("game/menace.ts"),
  engine("game/leveling.ts"),
  engine("game/loot.ts"),
  engine("game/config/index.ts"),
]);

export const ENEMY_DEFS = enemies.ENEMY_DEFS;
export const LEVELS = levels.LEVELS;
export const LEVEL_ORDER = levels.LEVEL_ORDER;
export const SECRET_LEVEL_ORDER = levels.SECRET_LEVEL_ORDER;
export const DIFFICULTY_DEFS = difficulties.DIFFICULTY_DEFS;
export const WEAPON_DEFS = equipment.WEAPON_DEFS;
export const GEAR_DEFS = gear.GEAR_DEFS;
export const UNIQUE_DEFS = uniques.UNIQUE_DEFS;
export const STORY_ITEM_DEFS = story.STORY_ITEM_DEFS;
export const COMPANION_DEFS = companions.COMPANION_DEFS;
export const ABILITY_DEFS = abilities.ABILITY_DEFS;
export const RARE_MOBS = config.RARE_MOBS;

/**
 * The difficulty rungs a page reports on, in ladder order. The first four have
 * AUTHORED mob levels per map (content/ladder.yaml); JESUS keeps the
 * player-relative ladder, so it has no fixed number to print and is left off
 * the field tables rather than guessed at.
 */
export const LADDER = ["easy", "medium", "hard", "nightmare"].map(
  (id) => difficulties.DIFFICULTY_DEFS[id],
);

/** `difficultyBandIndex`, but for the four authored rungs only. */
export const bandIndex = (difficultyId) =>
  menace.difficultyBandIndex(difficultyId);

/** Engine: the hp scale a mob of an AUTHORED monster level locks in at spawn. */
export const hardMobHpScale = menace.hardMobHpScale;
/** Engine: the per-level contact-damage ramp every spawn is stamped with. */
export const mobContactScaleFor = menace.mobContactScaleFor;
/** Engine: the scalar level of an authored `[min, max]` band. */
export const mobLevelMidpoint = menace.mobLevelMidpoint;
/** Engine: the XP unit a kill of a given monster level pays. */
export const mobLevelXp = leveling.mobLevelXp;

/**
 * Engine: the base XP one kill pays, role multipliers and all. `enemyKillXp`
 * reads exactly two things off the run — the enemy's settled monster level and
 * the hero's character level — so a rung's reference hero stands in for the
 * whole state, and the reward rule stays the engine's rather than a copy.
 */
export function killXp(def, mlvl, heroLevel) {
  return loot.enemyKillXp({ player: { level: heroLevel } }, def, { mlvl });
}

/** An equipment/unique/story/companion id resolved to its display name. */
export function itemName(id) {
  return (
    WEAPON_DEFS[id]?.name ??
    GEAR_DEFS[id]?.name ??
    UNIQUE_DEFS[id]?.name ??
    STORY_ITEM_DEFS[id]?.name ??
    COMPANION_DEFS[id]?.name ??
    ABILITY_DEFS[id]?.name ??
    id.replace(/_/g, " ").toUpperCase()
  );
}

/** The atlas sprite an item id draws with, when the catalogs name one. */
export function itemIcon(id) {
  return (
    WEAPON_DEFS[id]?.icon ??
    GEAR_DEFS[id]?.icon ??
    STORY_ITEM_DEFS[id]?.icon ??
    (UNIQUE_DEFS[id] ? itemIcon(UNIQUE_DEFS[id].base) : undefined)
  );
}

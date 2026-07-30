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
  grades,
  sets,
  story,
  companions,
  abilities,
  menace,
  leveling,
  loot,
  rolling,
  quality,
  durability,
  edge,
  weaponMath,
  requirements,
  create,
  config,
  cutscenes,
  thoughts,
] = await Promise.all([
  engine("game/defs/enemies/index.ts"),
  engine("game/defs/levels/index.ts"),
  engine("game/defs/difficulties.ts"),
  engine("game/defs/equipment.ts"),
  engine("game/defs/gear.ts"),
  engine("game/defs/uniques.ts"),
  engine("game/defs/grades.ts"),
  engine("game/defs/sets.ts"),
  engine("game/defs/story.ts"),
  engine("game/defs/companions.ts"),
  engine("game/defs/abilities.ts"),
  engine("game/menace.ts"),
  engine("game/leveling.ts"),
  engine("game/loot.ts"),
  engine("game/items/rolling.ts"),
  engine("game/items/quality.ts"),
  engine("game/items/durability.ts"),
  engine("game/items/edge.ts"),
  engine("game/items/weapon-math.ts"),
  engine("game/items/requirements.ts"),
  engine("game/create.ts"),
  engine("game/config/index.ts"),
  engine("game/defs/cutscenes.ts"),
  engine("game/defs/thoughts.ts"),
]);

// How an affix WORDS itself is the app's, not the engine's — and it lives in
// `pwa/src/lib/` precisely so a page can print the same line the item card
// does without importing a React component. Its only import is a type, so a
// plain `node` build loads it as-is.
const affixText = await import(
  pathToFileURL(join(REPO, "pwa/src/lib/affix-line.ts")).href
);

export const ENEMY_DEFS = enemies.ENEMY_DEFS;
export const LEVELS = levels.LEVELS;
export const LEVEL_ORDER = levels.LEVEL_ORDER;
export const SECRET_LEVEL_ORDER = levels.SECRET_LEVEL_ORDER;
export const DIFFICULTY_DEFS = difficulties.DIFFICULTY_DEFS;
export const WEAPON_DEFS = equipment.WEAPON_DEFS;
/** Every hand-authored base's lore paragraph, by id. It rides its own generated
 * module rather than the def, because it is the one authored field the shipped
 * game never reads and 9 KB gzipped of prose has no business in the app's
 * startup chunk (see scripts/generate-items.mjs). The LIBRARY is its only
 * reader, so it is merged back onto the def here — `baseLore(id) ?? def.description`
 * keeps a MOD's own base, whose lore does ride its def, working unchanged. */
const itemLore = await engine("generated/item-lore.ts");
export const baseLore = (id) => itemLore.GENERATED_ITEM_LORE[id];
export const GEAR_DEFS = gear.GEAR_DEFS;
export const UNIQUE_DEFS = uniques.UNIQUE_DEFS;
export const STORY_ITEM_DEFS = story.STORY_ITEM_DEFS;
export const COMPANION_DEFS = companions.COMPANION_DEFS;
export const ABILITY_DEFS = abilities.ABILITY_DEFS;
export const SET_DEFS = sets.SET_DEFS;
export const DIFFICULTY_ORDER = difficulties.DIFFICULTY_ORDER;
/** The cutscene catalog — the between-level scenes, as pure data. */
export const CUTSCENE_DEFS = cutscenes.CUTSCENE_DEFS;
/** Engine: the `<id>_<difficulty>` variant of a scene, when one is registered
 * (the prelude's wall weapon differs per rung). */
export const cutsceneVariant = cutscenes.cutsceneVariant;
/** The hero's pinned inner monologues, keyed by id. */
export const THOUGHT_DEFS = thoughts.THOUGHT_DEFS;
/** The recurring cap-farm mutter — the one thought that is not pinned to a
 * level, replayed whenever the hero out-levels the map he is standing on. */
export const CAP_THOUGHT_IDS = thoughts.CAP_THOUGHT_IDS;
export const WORLD_UNIQUES = uniques.WORLD_UNIQUES;
export const RARE_MOBS = config.RARE_MOBS;
const createGame = create.createGame;
/** The make-quality axis (`content/item_quality.yaml`) as the engine reads it. */
export const QUALITY = config.QUALITY;
/** The rarity ladder + economy (`content/item_rarity.yaml`), engine-side. */
export const LOOT = config.LOOT;
export const UNIQUE_TUNING = config.UNIQUE;
export const ARMOR = config.ARMOR;
export const ARMOR_TYPES = config.ARMOR_TYPES;
export const WEAPON = config.WEAPON;
export const WORLD_DROP = config.WORLD_DROP;
export const TIERS = equipment.TIERS;
export const TIER_LADDER = equipment.TIER_LADDER;
export const QUALITY_ORDER = equipment.QUALITY_ORDER;
export const QUALITY_PREFIX = equipment.QUALITY_PREFIX;
/** Engine: the def id of the built-in sidearm — the one weapon that is never
 * a drop, and the only one minted unbreakable. */
export const SIDEARM_DEF_ID = equipment.SIDEARM_DEF_ID;

/** Engine: the scale a make quality applies to a base's authored numbers. */
export const qualityMult = quality.qualityMult;
/** Engine: the odds of each make quality off a level-`mlvl` killer. */
export const qualityOdds = quality.qualityOdds;
/** Engine: the half-width of a weapon's damage band, as a fraction. */
export const weaponDamageVariance = equipment.weaponDamageVariance;
/** Engine: how many foes one swing/volley is BUDGETED to reach. */
export const weaponAssumedTargets = equipment.weaponAssumedTargets;
/** Engine: a weapon class's flat crit-damage multiplier. */
export const baseCritMult = equipment.baseCritMult;
/** Engine: the armor points one worn piece contributes. */
export const armorValueOf = durability.armorValueOf;
/** Engine: a gear def's armor material. */
export const armorTypeOf = durability.armorTypeOf;
/** Engine: whether a weapon CUTS or CRUSHES — carrying the engine's own
 * "melee omits it, so it is sharp" default rather than the raw authored
 * field, so a page says what the game does. */
export const weaponEdge = edge.weaponEdge;
/** Engine: an equipment def's two-way level gate. */
export const equipmentLevelReq = equipment.equipmentLevelReq;
/** Engine: a base's TreasureClass weight within its level's pool. */
export const equipmentDropWeight = equipment.equipmentDropWeight;
/** Engine: the exceptional/elite ids a pool base expands into at roll time. */
export const gradeVariantIds = grades.gradeVariantIds;
/** Engine: where a grade's level requirement lands. */
export const gradeLevelReq = grades.gradeLevelReq;
/** Engine: a named item's relative odds of being the one a rarity roll picks. */
export const uniqueDropWeight = rolling.uniqueDropWeight;
/** App: the one line an affix contributes to an item card (see above). */
export const affixLine = affixText.affixLine;

// How a tier and an affix are COLOURED is the app's business too, and it is
// already one module (pwa/src/game/tiers.ts, whose only import is a type) —
// so the library's item cards take the game's own palette rather than a
// second copy of it that would slowly drift a shade off.
const tiers = await import(
  pathToFileURL(join(REPO, "pwa/src/game/tiers.ts")).href
);
export const TIER_COLORS = tiers.TIER_COLORS;
export const TIER_LABELS = tiers.TIER_LABELS;
export const tierGlowClass = tiers.tierGlowClass;
/** App: the hue an affix reads in — orange for damage, gold for crit, … */
export const affixColor = (affix) => tiers.AFFIX_COLORS[affix.kind];

// ---- the reference hero ------------------------------------------------------

/**
 * THE REFERENCE HERO — a real, freshly created run, used as the stand-in state
 * every item figure on an arsenal page is measured in.
 *
 * A weapon's authored `damage` is now what a dropped copy swings for — the
 * engine keeps no global damper and no item-level growth between the catalog
 * and the blow — but the instance's make quality and the WIELDER's stats still
 * move it, so the catalog figure is still not automatically the figure a
 * player reads off a card.
 *
 * So the pages state what the item card states, by calling the very functions
 * the item card calls. A level-1 hero is the honest yardstick for that: he has
 * spent NOTHING (every stat sits at 0 on a fresh run), so the wielder term is
 * exactly 1 and what comes back is the piece itself, comparable across the
 * whole catalog — the same reason Arreat Summit's tables quote the base item.
 * Keep it that way: routing through the card's own functions is what stops a
 * page from drifting the next time a rule moves.
 */
const referenceState = createGame(1, LEVEL_ORDER[0]);

/**
 * The `Equipment` instance a FRESH, ordinary drop of `defId` would be: normal
 * make, no affixes, found at the base's own level, and carrying its wear
 * budget so the page describes a piece that can actually break.
 */
function freshDrop(defId) {
  const weapon = equipment.isWeaponDef(defId);
  const def = weapon ? WEAPON_DEFS[defId] : GEAR_DEFS[defId];
  return {
    defId,
    ilvl: equipment.equipmentLevelReq(defId),
    affixes: [],
    tier: "regular",
    quality: "normal",
    qualityRoll: 1,
    // The built-in sidearm is never a drop: the engine mints it into an empty
    // holster UNBREAKABLE (`drawSidearm`). Give it durability here and the
    // page would quote a wear budget the blaster never carries.
    ...(def.durability !== undefined && defId !== equipment.SIDEARM_DEF_ID
      ? { durability: def.durability }
      : {}),
  };
}

/** Engine: a fresh drop's per-hit damage band, as the item card prints it. */
export function weaponDropDamage(defId) {
  return weaponMath.weaponDamageRange(referenceState, freshDrop(defId));
}

/** Engine: a fresh drop's damage per second, as the item card prints it. */
export function weaponDropDps(defId) {
  return weaponMath.weaponDps(referenceState, freshDrop(defId));
}

/** Engine: a fresh drop's reach, as the item card prints it. */
export function weaponDropRange(defId) {
  return weaponMath.weaponRangeFor(referenceState, freshDrop(defId));
}

/** Engine: the seconds a fresh drop takes between blows, card-side. */
export function weaponDropCadence(defId) {
  return weaponMath.weaponCooldownFor(referenceState, freshDrop(defId)) / 1000;
}

/** Engine: the armor points a fresh drop of an armor piece contributes worn. */
export function gearDropArmor(defId) {
  return durability.armorValueOf(freshDrop(defId));
}

/** Engine: the STRENGTH a piece's material demands before it can be worn. */
export function gearStatRequirement(defId) {
  return requirements.statRequirement(defId);
}

/** True when a weapon/gear def is one of the GENERATED grade variants — an
 * exceptional/elite version of a pool base rather than a base of its own. Those
 * are described on their ancestor's page (the "what it becomes later" half of a
 * base spread), so they never claim a route. */
export const isGradeVariant = (def) => def.grade !== undefined;

/** Every hand-authored BASE, weapons and gear together, grade variants left
 * out. The blaster is engine machinery rather than content but still drops into
 * the hero's hands, so it keeps its page. */
export function baseItemDefs() {
  return [
    ...Object.values(WEAPON_DEFS).map((def) => ({ family: "weapon", def })),
    ...Object.values(GEAR_DEFS).map((def) => ({ family: "gear", def })),
  ].filter((entry) => !isGradeVariant(entry.def));
}

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

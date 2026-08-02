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
  talents,
  talentEffects,
  spells,
  menace,
  leveling,
  loot,
  rolling,
  quality,
  durability,
  edge,
  weaponMath,
  requirements,
  gold,
  create,
  config,
  cutscenes,
  thoughts,
  quests,
  questRewards,
  deathRites,
  companionStats,
  party,
  mapgen,
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
  engine("game/defs/talents/index.ts"),
  engine("game/talent-effects.ts"),
  engine("game/spells.ts"),
  engine("game/menace.ts"),
  engine("game/leveling.ts"),
  engine("game/loot.ts"),
  engine("game/items/rolling.ts"),
  engine("game/items/quality.ts"),
  engine("game/items/durability.ts"),
  engine("game/items/edge.ts"),
  engine("game/items/weapon-math.ts"),
  engine("game/items/requirements.ts"),
  engine("game/items/gold.ts"),
  engine("game/create.ts"),
  engine("game/config/index.ts"),
  engine("game/defs/cutscenes.ts"),
  engine("game/defs/thoughts.ts"),
  engine("game/defs/quests.ts"),
  engine("game/quests/rewards.ts"),
  engine("game/death-rites/catalog.ts"),
  engine("game/companion-stats.ts"),
  engine("game/companions.ts"),
  engine("game/mapgen/index.ts"),
]);

// How an affix WORDS itself is the app's, not the engine's — and it lives in
// `pwa/src/lib/` precisely so a page can print the same line the item card
// does without importing a React component. Its only import is a type, so a
// plain `node` build loads it as-is.
const affixText = await import(
  pathToFileURL(join(REPO, "pwa/src/lib/affix-line.ts")).href
);

export const ENEMY_DEFS = enemies.ENEMY_DEFS;
/** The scripted send-off a boss gets, resolved the way the engine resolves it
 * (the ENDING decides the default — see `riteFor`). */
export const riteFor = deathRites.riteFor;
/**
 * THE VENUES, AS ONE REPRESENTATIVE MAP EACH.
 *
 * A mission (`levels.LEVELS`) carries the story, the ladder rung and the loot
 * pools and NOTHING positional — its geometry, its horde and its cast are
 * carved fresh from `content/maps/<id>.yaml` on every run (see the engine's
 * `mapgen/`). A reference page has to describe a real map, so every level the
 * library reads is CARVED here, once, at a fixed seed and the shipped size: a
 * page then shows what a player will actually meet, drawn from the same
 * function the game builds a run with, rather than from a floor plan nobody
 * has played since the maps stopped being drawn by hand.
 *
 * The seed is fixed so the site is reproducible build to build; nothing about
 * a page should read as "the map is exactly this" — see the mission pages'
 * own wording.
 */
const LIBRARY_CARVE_SEED = 7;
export const LEVELS = Object.fromEntries(
  Object.keys(levels.LEVELS).map((id) => [
    id,
    mapgen.resolveLevelDef(id, LIBRARY_CARVE_SEED, "medium"),
  ]),
);
/** The authored half — what a mission says about itself, with no map on it. */
export const MISSIONS = levels.LEVELS;
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

// ---- the party ----------------------------------------------------------------

/** The recruited party's knobs (`config/companions.ts`) — the formation, the
 * engagement bubble, the damage damper, the leveling curve, the kneel and the
 * banter cadence. Every rule on the allies index is one of these. */
export const COMPANIONS = config.COMPANIONS;
/** Engine: a companion's max hp at its OWN level. */
export const companionMaxHp = companionStats.companionMaxHp;
/** Engine: the XP a companion needs to cross out of `level`. */
export const companionXpToLevelUp = companionStats.companionXpToLevelUp;
/** Engine: the XP one reference-mob kill pays at a level — the unit the curve
 * above is authored in, so a page can print the ladder in KILLS (which is what
 * a reader can act on) rather than in an XP figure that means nothing alone. */
export const referenceMobXp = leveling.referenceMobXp;
/** Engine: whether a body of this kind was carrying money (`items/gold.ts`) —
 * the humanoid rule, read off the def rather than re-derived, so the bestiary's
 * WHAT IT WAS CARRYING note can never disagree with the drop. */
export const carriesGold = gold.carriesGold;
/** Engine: which POWER RANK a companion of `level` has reached. */
export const companionPowerRank = companionStats.companionPowerRank;
/** Engine: the extra pellets / chain arcs / pierce a ranked power adds. */
export const companionProjectileBonus = companionStats.companionProjectileBonus;
/** Engine: the frost nova's blast radius, widened by rank. */
export const companionNovaRadius = companionStats.companionNovaRadius;
/** Engine: the party MAGIC FIND aura at a level, base plus rank. */
export const companionAuraMagicFind = companionStats.companionAuraMagicFind;
/** Engine: a companion's per-hit weapon damage — the catalog figure through the
 * party damper and its own training. NOT the same number the arsenal quotes for
 * the hero swinging the same weapon, which is exactly why it is asked for. */
export const companionWeaponDamage = party.companionWeaponDamage;
/** Engine: the ms between its blows (the weapon's cadence verbatim — a
 * companion has no speed stat to quicken it). */
export const companionWeaponCooldown = party.companionWeaponCooldown;
/** Engine: what one frost-nova pulse bites for at a level. */
export const companionNovaDamage = party.companionNovaDamage;

export const ABILITY_DEFS = abilities.ABILITY_DEFS;
/** Engine: the effect blocks a power actually carries, in catalog order. The
 * ONE accessor for "what does this power do" — `kind` is a label that names
 * only the block a composed power leads with, so a page reading it would
 * describe half of a two-block power and never say so. */
export const abilityBlocks = abilities.abilityBlocks;
/** Engine: a power's selection WEIGHT — its authored `rarity`, else the
 * default — which is what the drop roll and the merchant's stall both read. */
export const abilityRarity = abilities.abilityRarity;
/** Engine: the weight an un-annotated power carries, i.e. what "ordinary"
 * means on the rarity ladder every authored weight is written against. */
export const ABILITY_DEFAULT_RARITY = abilities.ABILITY_DEFAULT_RARITY;
/** The ability-power scaling knobs (`content` → config/abilities.ts): what INT
 * deepens, and by how much. */
export const ABILITY = config.ABILITY;
/** The purse's own knobs, for what the stall charges for a power. */
export const ECONOMY = config.ECONOMY;
/** The bailout knobs — read for the packed-field crowd-bomb ramp, the one
 * channel that hands out the power no venue's pool carries. */
export const MERCY = config.MERCY;
/** Engine: the id of that power. The bomb is the one thing in the catalog the
 * loot rules know by name (see `NUKE_DEF_ID`), which is exactly why its page
 * cannot be written from the pools like every other power's. */
export const NUKE_DEF_ID = abilities.NUKE_DEF_ID;
/** The leveling knobs — the library reads exactly one, `refMobHp`: the level-1
 * reference minion's healthbar, which is the yardstick every authored powerup
 * damage figure was picked against. */
export const LEVELING = config.LEVELING;

// ---- the talent trees ---------------------------------------------------------

/** The whole passive talent catalog, compiled (`content/talents.yaml`). */
export const TALENT_DEFS = talents.TALENT_DEFS;
/** Engine: every talent in one tree, in the order the picker lists them. */
export const talentsForTree = talents.talentsForTree;
/** Engine: the most ranks a tree can ever hold (Σ maxRank over its talents). */
export const treeCapacity = talents.treeCapacity;
/** Engine: the picker glyph a talent draws with — its own `icon`, else the
 * `icon_talent_<id>` convention. Asked rather than spelled out, so a talent
 * that names its own sprite is drawn with it. */
export const talentIcon = talents.talentIcon;
/** Engine: the proc blocks a talent carries, in catalog order — the ONE
 * accessor for "what does this talent do". `kind` is a label the picker groups
 * by, so a page reading it would describe none of the talent's actual effects. */
export const talentBlocks = talents.talentBlocks;
/** Engine: every proc block name there is, for the coverage contract. */
export const TALENT_BLOCKS = talents.TALENT_BLOCKS;
/** Engine: which stat earns points in which tree, and the reverse. */
export const TALENT_CLASS_STAT = talents.TALENT_CLASS_STAT;
export const TALENT_STATS = talents.TALENT_STATS;
/** Engine: CHOSEN points in a tree stat per talent point earned. */
export const TALENT_UNLOCK_STEP = talents.TALENT_UNLOCK_STEP;
/** The shared rank ceiling (config `TALENTS`), and the stat ceiling that
 * decides how many points a tree can ever be handed (config `STATS`). */
export const TALENTS = config.TALENTS;
export const STATS = config.STATS;
/** The granted-spell knobs — read for what INTELLIGENCE does to a conjured
 * spell's cadence, which is the one thing rank alone does not move. */
export const SPELL = config.SPELL;

// The tree PERSONAS (WARLORD / WINDRUNNER / ARCHON) and their colours are the
// app's, exactly as the tier colours are, and they already live in one
// type-import-only module — so the library wears the names and the accents the
// picker draws rather than a second copy of them.
const talentLook = await import(
  pathToFileURL(join(REPO, "pwa/src/game/talent-look.ts")).href
);
export const TREE_LOOK = talentLook.TREE_LOOK;

export const SET_DEFS = sets.SET_DEFS;
export const DIFFICULTY_ORDER = difficulties.DIFFICULTY_ORDER;
/** The cutscene catalog — the between-level scenes, as pure data. */
export const CUTSCENE_DEFS = cutscenes.CUTSCENE_DEFS;
/** Engine: the `<id>_<difficulty>` variant of a scene, when one is registered
 * (the prelude's wall weapon differs per rung). */
export const cutsceneVariant = cutscenes.cutsceneVariant;
/** The hero's pinned inner monologues, keyed by id. */
export const THOUGHT_DEFS = thoughts.THOUGHT_DEFS;

// ---- the errands --------------------------------------------------------------

/** The whole errand catalog, compiled (`content/quests/<id>.yaml`). */
export const QUEST_DEFS = quests.QUEST_DEFS;
/** The people who hand them out (`content/quest-givers.yaml`). */
export const QUEST_GIVER_DEFS = quests.QUEST_GIVER_DEFS;
/** Engine: a map's errands in the order the giver's pick list shows them —
 * `order`, then id. Asked rather than re-sorted here, because that fallback is
 * exactly the sort of rule a second implementation gets subtly wrong. */
export const questsForLevel = quests.questsForLevel;
/** Engine: the people standing on a map, in the same authored order. */
export const giversForLevel = quests.giversForLevel;
/** The errand knobs (`config/quests.ts`) — read for the ward that keeps the
 * horde off a civilian, a fetch piece's default odds and its pity floor, and
 * everything an escort is made of. */
export const QUESTS = config.QUESTS;

/**
 * Engine: what an errand's `xpShare` is actually WORTH to a hero of `level` on
 * `difficulty` — the very function the offer box quotes before the player
 * accepts, and the one the handover pays.
 *
 * It is the whole reason the reward can be published at all. `xpShare: 0.35` is
 * a share of a bar rather than a figure, so printing the authored number would
 * put a decimal on the page where the reader wants an amount; asking the engine
 * against the rung's own reference hero gives the amount, and it cannot drift
 * from the curve in `content/leveling.yaml` the way a copied formula would.
 */
export function questXp(reward, level, difficultyId) {
  const hero = { level };
  return questRewards.questXpReward(
    { players: [hero], difficulty: difficultyId },
    hero,
    reward,
  );
}
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

// ---- the badges ---------------------------------------------------------------

// THE ACHIEVEMENTS ARE THE APP'S, not the engine's — the engine never learns
// they exist (the whole ledger is fed from the events the app already consumes).
// So they are reached the same way the item card's wording and the tier palette
// are: by importing the app's own module rather than restating any of it. Three
// of them, because the catalog, the platform curation and the counter shape are
// three separate questions and the library asks all three.
const achievementDefs = await import(
  pathToFileURL(join(REPO, "pwa/src/game/achievement-defs.ts")).href
);
const platformAchievements = await import(
  pathToFileURL(join(REPO, "pwa/src/game/platform-achievements.ts")).href
);
const achievementTotals = await import(
  pathToFileURL(join(REPO, "pwa/src/game/achievement-totals.ts")).href
);
/** Every badge the game can award, in shelf order. */
export const ACHIEVEMENTS = achievementDefs.ACHIEVEMENTS;
/** The browser's sections, in display order, and their display names. */
export const ACHIEVEMENT_CATEGORIES = achievementDefs.ACHIEVEMENT_CATEGORIES;
export const CATEGORY_LABELS = achievementDefs.CATEGORY_LABELS;
/** App: a blank lifetime ledger — the honest way to ask a counter badge what
 * its GOAL is, since a goal is only ever reported alongside a live tally. */
export const emptyLifetimeTotals = achievementTotals.emptyTotals;
/** App: what one badge of each effort class is worth. */
export const ACHIEVEMENT_POINTS = achievementDefs.ACHIEVEMENT_POINTS;
/** App: whether a badge is one the platform lists carry (Game Center, Steam). */
export const isPlatformAchievement = platformAchievements.isPlatformAchievement;
/** App: the curated platform list, and the caps that shape it. */
export const PLATFORM_ACHIEVEMENTS = platformAchievements.PLATFORM_ACHIEVEMENTS;
export const PLATFORM_ACHIEVEMENT_LIMIT =
  platformAchievements.PLATFORM_ACHIEVEMENT_LIMIT;
export const PLATFORM_POINT_BUDGET = platformAchievements.PLATFORM_POINT_BUDGET;
/** App: the apportioned Game Center point value of every listed badge — asked
 * rather than re-derived, because the whole budget is re-sliced every time a
 * badge is added and a second implementation would be wrong within a release. */
export const platformPoints = platformAchievements.platformPoints;
/** App: whether Steam carries the whole catalog yet (it caps a new app at the
 * same 100 Game Center does — see `STEAM_FULL_CATALOG`). */
export const STEAM_FULL_CATALOG = platformAchievements.STEAM_FULL_CATALOG;
export const STEAM_ACHIEVEMENTS = platformAchievements.STEAM_ACHIEVEMENTS;

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
 * THE REFERENCE HERO WITH ONE TALENT TRAINED TO `rank`, handed to `read`.
 *
 * A talent's numbers are not on its def in the form a player meets them: a
 * chance is `rank × chancePerRank` clamped to the talent's own cap and scaled by
 * the developer TALENT POWER dial, a radius is `base + perRank × (rank - 1)`, a
 * crit bonus only counts on the tree's own weapon class. Publishing the authored
 * slope would be correct against the YAML and wrong against the game — the exact
 * trap the arsenal's reference hero exists for — so every figure the talent
 * pages print comes back from the engine's own accessor with a rank trained.
 *
 * ONE state, mutated and restored, rather than a fresh `createGame` per rank:
 * the accessors are pure reads of `player.talents` (plus, for two of them, the
 * hero's health and his live dodge window), and 24 talents × 5 ranks is 120
 * runs of level one otherwise. `read` may set those two scratch fields — a
 * BERSERKER RAGE figure means nothing at full health — and they are put back
 * here so no readout can leak into the next.
 *
 * Only ONE talent is ever trained at a time, which is also what makes the
 * summed accessors (IRONHIDE and MAGE ARMOR both fold into one flat cut) report
 * the talent whose page is being built rather than the pair.
 */
export function withTalent(id, rank, read) {
  const player = referenceState.players[0];
  const owned = player.talents;
  const hp = player.hp;
  const burstMs = player.evasionBurstMs;
  player.talents = { [id]: rank };
  try {
    return read(referenceState);
  } finally {
    player.talents = owned;
    player.hp = hp;
    player.evasionBurstMs = burstMs;
  }
}

/**
 * THE REFERENCE COMPANION — a real recruit at `level`, handed to `read`.
 *
 * The talents' reference hero one catalog over, for the same reason: three of
 * the figures an ally's page prints (what its blow lands for, how often, what a
 * nova pulse bites) are reads off a live `Companion`, not off the def. Printing
 * the weapon's catalog damage instead would be the arsenal's own trap in a new
 * place — a companion swings through the party damper (`COMPANIONS.damageMult`,
 * a HALVING) and its own training curve, so the catalog figure is one a player
 * never sees on this side of the party.
 *
 * It is the ENGINE that mints it: `recruitCompanion` is the one function that
 * knows a signature weapon is unbreakable, minted at regular tier with no
 * affixes and no make quality. Rebuilding that shape here would be a second
 * definition of a recruit, free to drift the first time one gains a field.
 *
 * The recruit joins at the HERO's level, so `level` is stamped on afterwards —
 * a companion earns its own levels from its own kills and the page tables what
 * each one comes to. It is popped off the reference state on the way out, so no
 * readout can leak into the next.
 */
export function withCompanion(defId, level, read) {
  const companion = party.recruitCompanion(referenceState, defId, {
    x: 0,
    y: 0,
  });
  companion.level = Math.max(1, level);
  try {
    return read(companion);
  } finally {
    referenceState.companions.pop();
    referenceState.events.length = 0;
  }
}

/**
 * Engine: the talent EFFECT reads, as a namespace.
 *
 * Named rather than re-exported one at a time because the talents model is a
 * TABLE mapping each authored field to the accessor that owns its rule
 * (`critChancePerRank` → `talentCritChanceBonus`, the `frostNova` block →
 * `talentFrostNova`), and a table wants its functions addressable by name. That
 * mapping is the whole coverage contract: an authored field with no accessor
 * beside it fails the build rather than quietly going unprinted.
 */
export const TALENT_READS = talentEffects;

/**
 * Engine: a CONJURED spell's live numbers at a rank, keyed by `SpellKind`.
 *
 * Each returns the very block shape `content/powerups.yaml` authors, which is
 * the whole point of the conjuration design — so a talent's ring is tabled with
 * the same labels and units the powers pages give a picked-up one, rather than
 * a second vocabulary for the same five numbers. The value is which
 * `AbilityDef` block shape comes back (the SEEKER's is a `volley`).
 */
export const SPELL_BLOCKS = {
  orbit: {
    block: "orbit",
    read: (state, rank) =>
      spells.orbitSpellBlock(state, state.players[0], rank),
  },
  storm: {
    block: "storm",
    read: (state, rank) =>
      spells.stormSpellBlock(state, state.players[0], rank),
  },
  stasis: {
    block: "stasis",
    read: (state, rank) =>
      spells.stasisSpellParams(state, state.players[0], rank),
  },
  seeker: {
    block: "volley",
    read: (state, rank) =>
      spells.seekerSpellBlock(state, state.players[0], rank),
  },
  singularity: {
    block: "singularity",
    read: (state, rank) =>
      spells.singularitySpellBlock(state, state.players[0], rank),
  },
  immolation: {
    block: "immolation",
    read: (state, rank) =>
      spells.immolationSpellBlock(state, state.players[0], rank),
  },
};

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
  return weaponMath.weaponDamageRange(
    referenceState,
    referenceState.players[0],
    freshDrop(defId),
  );
}

/** Engine: a fresh drop's damage per second, as the item card prints it. */
export function weaponDropDps(defId) {
  return weaponMath.weaponDps(
    referenceState,
    referenceState.players[0],
    freshDrop(defId),
  );
}

/** Engine: a fresh drop's reach, as the item card prints it. */
export function weaponDropRange(defId) {
  return weaponMath.weaponRangeFor(
    referenceState,
    referenceState.players[0],
    freshDrop(defId),
  );
}

/** Engine: the seconds a fresh drop takes between blows, card-side. */
export function weaponDropCadence(defId) {
  return (
    weaponMath.weaponCooldownFor(
      referenceState,
      referenceState.players[0],
      freshDrop(defId),
    ) / 1000
  );
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
  return loot.enemyKillXp({ players: [{ level: heroLevel }] }, def, { mlvl });
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

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DEVELOPER seed characters — mints ready-to-play heroes at the game's high
// tiers so a developer can jump straight into late-game content with a
// believable build instead of grinding one out. Each seed is a stat-build
// (melee / ranged / magic — the engine's `StatBuild` lanes) fixed to a target
// LEVEL, dressed in level-appropriate REROLLED gear whose armor material and
// stat spread follow the lane (melee → heavy STR armor, ranged → leather DEX,
// magic → cloth INT), and banked as a softcore Character that has already
// beaten every difficulty up to its tier so its level picker is open.
//
// Everything here reuses the ENGINE'S own machinery — `rollEquipment` for the
// realistic drops, `BUILD_ROTATION` for the point spend, `applyLoadout` +
// `autofillSpellSlots` to settle the spell bar off the built INT — so a seeded
// hero is indistinguishable from one the app itself would have produced.

import {
  BUILD_ROTATION,
  DIFFICULTY_ORDER,
  GEAR_DEFS,
  LEVEL_ORDER,
  MEDKIT,
  STARTING_DIFFICULTIES,
  STAT_NAMES,
  WEAPON_DEFS,
  applyLoadout,
  autofillSpellSlots,
  buildWeaponLane,
  chosenStatPointsThrough,
  createGame,
  difficultyDef,
  extractLoadout,
  levelDef,
  rollEquipment,
  type Difficulty,
  type Equipment,
  type GameState,
  type Loadout,
  type StatBuild,
  type StatName,
} from "@game/core";

import { seedCharacter, type Character } from "./characters.ts";

/** The three lane-biased builds a seed can mint (never `balanced` — a seed is
 * a focused specimen of one weapon class). */
export const SEED_BUILDS: StatBuild[] = ["melee", "ranged", "magic"];

/** A power tier a seed hero is minted at: a target hero LEVEL plus the
 * difficulty whose loot/level band that level sits in (drives the drop's item
 * level and the "beaten through" progression the seed is stamped with). */
export type SeedTier = {
  id: string;
  /** Short label for the menu row. */
  label: string;
  /** The hero level the seed is built at. */
  level: number;
  /** The difficulty band the level belongs to (loot ilvl + progression). */
  difficulty: Difficulty;
};

/** The four seed tiers: entering NIGHTMARE, entering JESUS, the post-JESUS
 * farm, and the level-99 endgame ceiling. */
export const SEED_TIERS: SeedTier[] = [
  { id: "nightmare", label: "NIGHTMARE", level: 34, difficulty: "nightmare" },
  { id: "jesus", label: "JESUS", level: 56, difficulty: "jesus" },
  { id: "postjesus", label: "POST-JESUS", level: 70, difficulty: "jesus" },
  { id: "endgame", label: "ENDGAME", level: 99, difficulty: "jesus" },
];

/** The armor materials each lane prefers, best-fit first: melee wears the
 * heaviest STR plate/mail, ranged the DEX leather, magic the INT cloth — so a
 * seed's armor `+stat` affixes lean into its own attack stat. */
const LANE_ARMOR_MATERIALS: Record<StatBuild, string[]> = {
  melee: ["plate", "mail"],
  ranged: ["leather"],
  magic: ["cloth"],
  balanced: [],
};

/** The four body slots a seed dresses. */
type ArmorSlot = "head" | "chest" | "legs" | "feet";

/** A zeroed stat record — the base every seed's point spend starts from. */
function zeroStats(): Record<StatName, number> {
  const stats = {} as Record<StatName, number>;
  for (const stat of STAT_NAMES) stats[stat] = 0;
  return stats;
}

/** The strongest wieldable weapon base of `lane`'s class: the highest level
 * requirement at or under `level` (tie-broken by raw damage), so a deep tier
 * naturally reaches the elite-grade variants. */
function bestWeaponId(build: StatBuild, level: number): string {
  const lane = buildWeaponLane(build);
  const candidates = Object.values(WEAPON_DEFS).filter(
    (def) =>
      def.class === lane &&
      def.levelReq <= level &&
      // The debug calibration probe is never a real weapon — keep it out.
      def.id !== "calibration_probe",
  );
  candidates.sort((a, b) =>
    b.levelReq !== a.levelReq ? b.levelReq - a.levelReq : b.damage - a.damage,
  );
  // Fall back to the difficulty's wall weapon should a lane somehow field no
  // base at this level (it always does with the shipped catalog).
  return candidates[0]?.id ?? (Object.keys(WEAPON_DEFS)[0] as string);
}

/** The best armor base for `slot` and `build` at `level`: the lane's preferred
 * material with the highest level requirement at or under `level`, falling back
 * to any material when the lane's own is unavailable that deep. */
function bestArmorId(
  build: StatBuild,
  slot: ArmorSlot,
  level: number,
): string | null {
  const fits = Object.values(GEAR_DEFS).filter(
    (def) =>
      def.slot === slot &&
      def.armor !== undefined &&
      (def.levelReq ?? 1) <= level,
  );
  if (fits.length === 0) return null;
  const byLevel = (a: (typeof fits)[number], b: (typeof fits)[number]) =>
    (b.levelReq ?? 1) !== (a.levelReq ?? 1)
      ? (b.levelReq ?? 1) - (a.levelReq ?? 1)
      : (b.armor ?? 0) - (a.armor ?? 0);
  for (const material of LANE_ARMOR_MATERIALS[build]) {
    const laned = fits.filter((def) => (def.armorType ?? "cloth") === material);
    if (laned.length > 0) return laned.sort(byLevel)[0]!.id;
  }
  return fits.sort(byLevel)[0]!.id;
}

/** The best charm/bag base at `level` (highest level requirement / bag size),
 * or null when the catalog fields none that deep. */
function bestGearId(
  slot: "charm" | "bag",
  level: number,
  by: (def: (typeof GEAR_DEFS)[string]) => number,
): string | null {
  const fits = Object.values(GEAR_DEFS).filter(
    (def) => def.slot === slot && (def.levelReq ?? 1) <= level,
  );
  if (fits.length === 0) return null;
  return fits.sort((a, b) => by(b) - by(a))[0]!.id;
}

/** Mint one realistic drop of a specific base at the seed's mob level. */
function mintPiece(
  state: GameState,
  defId: string,
  tier: Equipment["tier"],
  mlvl: number,
): Equipment {
  return rollEquipment(state, { defId, tier, mlvl });
}

/** Spend a hero-of-`level`'s worth of trainable points through `build`'s
 * rotation — the same cycle the autopilot and the analytic sim spend by. */
function spendPoints(
  build: StatBuild,
  level: number,
): Record<StatName, number> {
  const stats = zeroStats();
  const rotation = BUILD_ROTATION[build];
  const total = chosenStatPointsThrough(level);
  for (let i = 0; i < total; i++) {
    stats[rotation[i % rotation.length] as StatName]++;
  }
  return stats;
}

/**
 * Build the seed's Loadout: level-appropriate rerolled weapon + armor + charm +
 * bag, a lane-optimized stat spread on top of the difficulty's head start, a
 * stock of consumables, and (for casters) a filled spell bar settled off the
 * built INTELLIGENCE.
 */
function buildSeedLoadout(build: StatBuild, tier: SeedTier): Loadout {
  const { level, difficulty } = tier;
  const lastLevel = LEVEL_ORDER[LEVEL_ORDER.length - 1] as string;
  // A throwaway run only serves as the loot RNG + level context; nothing here
  // is ever stepped or rendered. The reroll pulls its item level off `mlvl`,
  // which we pin so the loot's own level lands right at the hero's.
  const seed = Math.floor(Math.random() * 1e9);
  const state = createGame(seed, lastLevel, difficulty);
  const mlvl = Math.max(1, level + difficultyDef(difficulty).mobLevelOffset);

  // Rare drops across the kit — a believable, strong-but-not-maxed endgame set.
  const weapon = mintPiece(state, bestWeaponId(build, level), "rare", mlvl);
  const armorFor = (slot: ArmorSlot): Equipment | null => {
    const id = bestArmorId(build, slot, level);
    return id ? mintPiece(state, id, "rare", mlvl) : null;
  };
  const charmId = bestGearId("charm", level, (d) => d.levelReq ?? 1);
  const bagId = bestGearId("bag", level, (d) => d.bagSlots ?? 0);

  const spent = spendPoints(build, level);
  // The difficulty head start rides on top of the spent pool, exactly as a
  // freshly-created hero of this rung would carry it (see create.ts).
  const stats = { ...spent };
  for (const [stat, amount] of Object.entries(
    difficultyDef(difficulty).startingStats,
  )) {
    stats[stat as StatName] += amount ?? 0;
  }

  // A healthy reserve of every consumable the tier's mob level unlocks.
  const medkits = MEDKIT.tiers.map((t) => (mlvl >= t.minMlvl ? 3 : 0));

  const loadout: Loadout = {
    level,
    xp: 0,
    stats,
    spentStats: { ...spent },
    equipment: {
      weapon,
      head: armorFor("head"),
      chest: armorFor("chest"),
      legs: armorFor("legs"),
      feet: armorFor("feet"),
      charm: charmId ? mintPiece(state, charmId, "rare", mlvl) : null,
      bag: bagId ? mintPiece(state, bagId, "regular", mlvl) : null,
    },
    inventory: [],
    heldAbilities: [],
    medkits,
    staminaPotions: 3,
    manaPotions: build === "magic" ? 5 : 1,
    repairKits: 3,
    spellSlots: [],
    coins: level * 50,
    companions: [],
  };

  // Settle the spell bar the way the app does: apply the build to the scratch
  // run so its effective INTELLIGENCE is live, auto-fill the unlocked spells,
  // then read the bar back onto the loadout (physical builds simply fill few or
  // none). This never mutates the loadout's own equipment.
  applyLoadout(state, loadout);
  autofillSpellSlots(state);
  loadout.spellSlots = [...state.player.spellSlots];

  return loadout;
}

/** The hero LEVEL a player would reach the chosen map at on `difficulty`: the low
 * end of the map's own authored mob band for that rung, with SAFETY FLOORS so the
 * BOT VIEW hero is never dropped in under-leveled. The band is the primary source
 * (moon/easy ≈ 7, later maps higher); the floors guarantee a sane minimum even if
 * a band reads low or is missing:
 *   • JESUS is player-relative (no authored band) — arrive at a late ceiling.
 *   • NIGHTMARE opens HIGH — a grind gate, mobs ~40 even on map 1 — so never < 40.
 *   • Every map past SPACEZ (campaign index 1) must arrive LEVELED: never a
 *     level-1 hero on a mid/late map, so the level floors by campaign position.
 * SPACEZ on easy/medium/hard is the one map that legitimately starts at level 1. */
function arrivalLevelFor(levelId: string, difficulty: Difficulty): number {
  if (difficulty === "jesus") return 58;
  const order: Difficulty[] = ["easy", "medium", "hard", "nightmare"];
  const band = levelDef(levelId).mobLevels?.[order.indexOf(difficulty)];
  const lo = Array.isArray(band)
    ? band[0]
    : typeof band === "number"
      ? band
      : 0;
  const index = Math.max(1, LEVEL_ORDER.indexOf(levelId) + 1);
  const floor = difficulty === "nightmare" ? 40 : (index - 1) * 5;
  return Math.max(lo, floor, 1);
}

/** A realistic hero for the DEVELOPER → BOT VIEW mode: a `build`-lane specimen
 * (melee/ranged/magic — the chosen BOT SPEC) minted at the level a player would
 * REACH the chosen map on the chosen difficulty (the map's own low mob band) in
 * level-appropriate rerolled gear — so the watched autopilot plays the level the
 * way a real arriving hero would, not a naked rookie. Gear is freshly rolled each
 * launch, like the seed-character picker. */
export function buildBotViewLoadout(
  levelId: string,
  difficulty: Difficulty,
  build: StatBuild = "ranged",
): Loadout {
  // The campaign's OPENING map on a starting lane is the one place a real hero
  // begins from scratch: level 1, holding only the DIFFICULTY's own start loot
  // (its wall weapon, street clothes, and banked head-start stats). Minting a
  // leveled kit of rolled gear there would show the autopilot playing the
  // tutorial map with random loot no new player could have — so instead hand it
  // the same fresh start `createGame` gives a rookie, captured as a loadout.
  // (Nightmare/Jesus are gated tiers no one starts fresh on, and every later
  // map is reached leveled, so both keep the realistic rolled arrival below.)
  if (
    levelId === LEVEL_ORDER[0] &&
    STARTING_DIFFICULTIES.includes(difficulty)
  ) {
    const seed = Math.floor(Math.random() * 1e9);
    return extractLoadout(createGame(seed, levelId, difficulty));
  }
  return buildSeedLoadout(build, {
    id: "botview",
    label: "BOT VIEW",
    level: arrivalLevelFor(levelId, difficulty),
    difficulty,
  });
}

/** The difficulties a seed of `tier` is stamped as having BEATEN — every rung
 * up to and including its band — so its level picker is open on each and the
 * ladder above it is unlocked. */
function beatenThrough(tier: SeedTier): Difficulty[] {
  const top = difficultyDef(tier.difficulty).index;
  return DIFFICULTY_ORDER.filter((id) => difficultyDef(id).index <= top);
}

/** Mint and bank one seed hero for `build` at `tier`, returning the stored
 * Character. Re-seeding replaces any existing hero of the same name. */
export function seedBuildCharacter(
  build: StatBuild,
  tier: SeedTier,
): Character {
  return seedCharacter({
    name: `${build.toUpperCase()} ${tier.level}`,
    loadout: buildSeedLoadout(build, tier),
    beaten: beatenThrough(tier),
  });
}

/** Seed all three lane builds at `tier` (or, with no tier, the whole 3×4
 * matrix). Returns how many heroes were minted. */
export function seedTierCharacters(tier: SeedTier | null): number {
  const tiers = tier ? [tier] : SEED_TIERS;
  let count = 0;
  for (const t of tiers) {
    for (const build of SEED_BUILDS) {
      seedBuildCharacter(build, t);
      count++;
    }
  }
  return count;
}

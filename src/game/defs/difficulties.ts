// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty catalog. A difficulty is pure data layered over every
// level, and it turns a whole rack of knobs at once: how the hero starts
// (stat head-start, the weapon off the wall), how the horde compares to him
// (count and RELATIVE LEVEL), how generous the floor is (medkits, armor,
// powerups), how fast he tires (stamina), how touchy the rampage meter is —
// and it pays the harder rungs back in richer loot (higher tiers, deeper
// item levels). MEDIUM is the 1.0 baseline the levels are tuned at; every
// other entry scales from it.

import type { Difficulty, StatName, Tier } from "../types.ts";

/**
 * A rung's MERCY strengths — how forcefully the rope pulls (the ramp SHAPES
 * that turn each signal into a 0→1 desperation live in the `MERCY` config).
 * The strengths TAPER geometrically down the ladder (~×0.4 per rung off
 * medium): easy is a firm hand, medium a light one, hard a whisper,
 * nightmare a ghost — and JESUS is absolute zero, the no-net terminus.
 */
export type MercyTuning = {
  /**
   * The most a PACKED FIELD adds to each kill's chance of dropping a
   * screen-nuke — the bomb-in-a-swarm bailout. Ramps in from zero once the
   * on-screen crowd passes `MERCY.crowdBombThreshold`, reaching this cap at
   * `MERCY.crowdBombFull`. Easy tops out at 5%, tapering to 0 on JESUS.
   */
  crowdBombChanceMax: number;
  /**
   * Extra medkit-slice multiplier at full low-health desperation (hp at/under
   * `MERCY.lowHealthFull`): the medkit share is scaled by `1 + this *
   * desperation`, so healing rains harder the closer the hero is to death.
   */
  medkitBonus: number;
  /**
   * Chance, at full low-health desperation, that an otherwise-armorless random
   * gear drop is swapped for an ARMOR piece from the same pool — armor is
   * life-saving gear too, so a hurting hero finds it more often. Scaled by the
   * same hp desperation as `medkitBonus`.
   */
  armorBonus: number;
  /**
   * Extra repair-slice multiplier at full low-durability desperation (equipped
   * weapon at/under `MERCY.lowDurabilityFull` of its max): the repair share is
   * scaled by `1 + this * desperation`, so a near-broken weapon draws repair
   * kits before it snaps.
   */
  repairBonus: number;
  /**
   * The per-kill chance a stranded hero is thrown an ENERGY DRINK once his
   * sprint pool is BONE-DRY (exactly empty, not merely low). Zero the instant
   * stamina hits empty, ramping to this cap over `MERCY.staminaEmptyDrinkRampMs`
   * — 15% on easy tapering to nothing by JESUS (a winded hero on the top
   * rungs recovers by backing off, not by looting his way out).
   */
  staminaDrinkChanceMax: number;
};

export type DifficultyDef = {
  /** Registry key. */
  id: Difficulty;
  /** Menu order, gentlest first. */
  index: number;
  /** Menu label. */
  name: string;
  /** One-line menu blurb under the label. Level-agnostic — it describes the
   * difficulty, not any one level's flavor (the ladder is shown globally). */
  tagline: string;
  /** Menu color for this rung; the ladder heats up as it descends. Lives with
   * the def so a new difficulty is pure data (no TitleScreen edit). */
  color: string;
  /**
   * The weapon off the hero's wall: the WEAPON_DEFS id minted in hand when a
   * run starts fresh (create.ts). The prelude cutscene shows the same piece
   * mounted on the living-room wall (see defs/cutscenes.ts — the scene has a
   * per-difficulty variant so the wall always matches what he lands with),
   * and the auto-equip treats it as the pickup floor: any real weapon the
   * world yields supplants it (see isBetterEquipment).
   */
  startingWeapon: string;
  /**
   * Pre-allocated stat points the hero opens with — the gentler rungs' head
   * start (a few level-ups' worth of training banked before the first kill).
   * Applied at creation, before any carried-over loadout (which keeps its own
   * earned stats). Empty = the bare authored start.
   */
  startingStats: Partial<Record<StatName, number>>;
  /**
   * The clothes on the hero's back: GEAR_DEFS ids minted onto the body when
   * a run starts fresh (create.ts), each into its def's slot. The shipped
   * ladder dresses every rung in the same street clothes — a t-shirt, jeans
   * and worn boots, no bonuses and a whisper of armor. Omitted = bare.
   */
  startingGear?: string[];
  /** Multiplies every spawn count: placed spawns and wave budgets alike. */
  mobCountMult: number;
  /**
   * The horde's level RELATIVE to the player's: every monster spawns at
   * `player level + this offset` (plus a per-mob random band, see
   * `MENACE.mobLevelBand`), and each level off the baseline shifts its hp by
   * `MENACE.mobHpPerLevel` (kill XP is LEVEL-based, so a higher-level horde
   * also pays more — for its level). EASY fields mobs three levels under the
   * hero; NIGHTMARE matches him; JESUS fields mobs two levels ABOVE him, so
   * the gap never closes. See `mobHpScaleFor` in menace.ts.
   */
  mobLevelOffset: number;
  /** Multiplies the wave spawner's live cap AND floor (`maxAlive`,
   * `minAlive`) — harder difficulties keep a denser field on screen. */
  aliveMult: number;
  /**
   * The fraction of its normal chase speed the plain horde keeps once the
   * player has ENGAGED an elite or boss — a gentle-rung mercy that lets him
   * push past the swarm and close on the set piece instead of being dog-piled
   * at it. The minions don't stop hunting, they just crawl: EASY drops them to
   * 10% (0.1), MEDIUM to half (0.5). The trigger is the encounter actually
   * starting — the elite/boss is awake, wounded, or the player has stepped
   * inside its aggro range — NOT that one merely sleeps somewhere on the map
   * (which would slow the whole level and gut the "idle play loses" promise).
   * Applies only to the ordinary minion chase (elites/bosses, scripted rushers
   * and returning-home drifters keep their own pace), and lifts the instant no
   * set piece is engaged. Omitted (undefined) means no slowdown — the horde
   * chases at full speed regardless, as on the harder rungs where running to
   * the boss is meant to cost you.
   */
  mobPursuitNearElite?: number;
  /**
   * How sensitively the rampage (menace) meter answers this difficulty: a
   * master multiplier on all menace gain (rolling DPS/kill-rate heat AND
   * overkill jolts — see `menaceSensitivity` in menace.ts). EASY barely reacts
   * (a rampage is almost impossible even for a strong build); MEDIUM is the 1.0
   * baseline where only a genuinely overpowered player heats it; the harder
   * rungs climb toward JESUS, where a mere handful of kills tips it over —
   * deliberately touchier up the ladder, since a tougher horde dies slower and
   * would otherwise never heat the meter.
   */
  menaceMult: number;
  /**
   * How fast the menace meter COOLS on this rung: multiplies the fixed
   * `MENACE.decayPerSec` bleed. Above 1 the meter settles back to normal
   * quickly (EASY forgives a hot streak); below 1 a rampage lingers — on the
   * hardest rungs the horde stays stirred long after the slaughter pauses.
   */
  menaceDecayMult: number;
  /**
   * How hard a menace stage lands on the MOBS: multiplies both the extra hp
   * evolved minions spawn with (`MENACE.hpPerStage`) and the lure that swells
   * the live crowd (`MENACE.lurePerStage`). The gentle rungs turn a rampage
   * into a shrug; the hard rungs turn it into a wall.
   */
  menaceEffectMult: number;
  /**
   * The highest evolution STAGE the rampage meter is allowed to reach on this
   * rung — its PEAK. Both the live meter and the permanent ratchet floor are
   * clamped here (see `menaceStageCap`/`menaceCeiling` in menace.ts), so a
   * gentle rung tops out early no matter how thoroughly the horde is
   * steamrolled: EASY peaks at 3, MEDIUM 5, HARD 10, NIGHTMARE 100. Left
   * `undefined` on JESUS — that rung stays UNCAPPED, the horde evolving without
   * a roof for as long as the player keeps proving it too easy.
   */
  menaceStageCap?: number;
  /** Added to the base minion drop chance (LOOT.dropChance). */
  dropChanceBonus: number;
  /**
   * Multiplies the medkit slice of the drop ladder (LOOT.medkitShare) —
   * healing thins out a few percent per rung, so the harder fights are also
   * the leaner ones.
   */
  medkitDropMult: number;
  /**
   * Multiplies the odds that a random GEAR drop is an ARMOR piece (one worn
   * in a body slot): when the gear pick lands on armor, this is its chance to
   * stand — a failed roll re-picks among the pool's non-armor pieces. The
   * armor half of the "medkits and armor thin out" rule (see rollEquipment).
   */
  armorDropMult: number;
  /**
   * Multiplies the ability-powerup slice of the drop ladder
   * (LOOT.abilityShare) — the storm/orbit/nuke rain eases off with the
   * medkits as the ladder climbs.
   */
  powerupDropMult: number;
  /**
   * Multiplies the golden-XP-arrow slice of the drop ladder (LOOT.arrowShare) —
   * free levels thin out up the rungs, so the harder fights lean on the kill
   * grind instead of arrow rain. Whatever this trims off the slice simply
   * doesn't drop (arrows are the ladder's tail, not the leftover). JESUS sets
   * it to 0: no arrows at all, the climb is earned kill by kill.
   */
  arrowDropMult: number;
  /**
   * MERCY DROPS (see the `MERCY` config for the ramp shapes) — the per-rung
   * STRENGTH of the easy/medium rope: how hard a packed field, a bleeding
   * hero, or a near-broken weapon bends the drops in the player's favor. The
   * gentle rungs set these; hard and up zero every one, so death stays on the
   * table. A nudge, never a safety net.
   */
  mercy: MercyTuning;
  /**
   * Added per tier to the global base chances (config LOOT.tierChances) —
   * the reward side of the ladder: richer blues/yellows per rung. The
   * monster-level gates (LOOT.tierUnlockMlvl) still hold: no bonus makes a
   * tier drop off a mob whose level hasn't unlocked it — but since mobs run
   * at `player level + mobLevelOffset`, the harder rungs also reach every
   * gate earlier in the campaign. Unique/legendary are hand-authored drops
   * with their own channels (boss tables, world drops) — a bonus here can't
   * make them roll (their base chance is 0; see LOOT.tierChances).
   */
  tierChanceBonus: Partial<Record<Tier, number>>;
  /**
   * Levels ADDED to every drop's rolled ITEM LEVEL (see `rollItemLevel`) —
   * the "harder difficulties roll BIGGER" half of the reward, beside the
   * rarer-tier odds above. Ilvl sizes both affix magnitudes and an armor
   * piece's rolled armor points, so one knob sweetens the whole drop.
   */
  lootIlvlBonus: number;
  /**
   * Multiplies the sprint pool's drain rate (STAMINA.drainPerSec): the harder
   * rungs wind the hero a touch faster. JESUS deliberately matches NIGHTMARE —
   * kiting is the whole game up there, so the legs stay.
   */
  staminaDrainMult: number;
  /**
   * Multiplies the hero's DODGE chance — his odds of sidestepping an enemy
   * blow entirely (see `playerDodgeChance`; the DODGE.max cap still holds).
   * Above 1 the gentle rungs let him slip more hits; the hard rungs trim the
   * reflexes down so every contact counts.
   */
  playerDodgeMult: number;
  /**
   * Multiplies the hero's MISS chance — the innate whiff on his own weapon
   * blows (see `playerMissChance`; DEXTERITY still trims it first, and the
   * floor holds). Below 1 the gentle rungs barely whiff; the hard rungs make
   * the swing itself less reliable.
   */
  playerMissMult: number;
  /**
   * Multiplies every foe's DODGE chance against the hero's weapon blows (see
   * `enemyDodgeChance`; DEXTERITY still trims it first). The harder rungs'
   * monsters are slipperier — the second half, with `playerMissMult`, of
   * "your blows land less up the ladder".
   */
  enemyDodgeMult: number;
  /**
   * The bite an ASTEROID strike takes out of the hero, as a fraction of his
   * MAX hp — the rift's rock rain scales its blow by the rung, not by a flat
   * number (see stepAsteroids). The suit's plating still soaks its grade's
   * share of the result like any physical hit, but there is no crit and no
   * dodge roll — a rock is dodged with the feet. EASY loses a fifth of the
   * bar to a hit; JESUS loses three quarters, two rocks from dead.
   */
  asteroidDamageFrac: number;
};

export const DIFFICULTY_DEFS: Record<Difficulty, DifficultyDef> = {
  easy: {
    id: "easy",
    index: 1,
    name: "EASY",
    tagline: "A GENTLE WARM-UP",
    color: "#7ef0c8",
    startingWeapon: "hairy_potters_wand",
    // Four banked points — a broad head start, one in each combat stat.
    startingStats: { stamina: 1, strength: 1, dexterity: 1, intelligence: 1 },
    startingGear: ["t_shirt", "jeans", "leather_boots"],
    mobCountMult: 0.9,
    mobLevelOffset: -3,
    aliveMult: 0.9,
    // The gentlest rung all but parks the horde once a set piece is engaged:
    // 10% speed, so the player can walk straight through it to the boss.
    mobPursuitNearElite: 0.1,
    menaceMult: 0.05,
    menaceDecayMult: 1.5,
    menaceEffectMult: 0.5,
    menaceStageCap: 3,
    dropChanceBonus: 0,
    medkitDropMult: 1.05,
    armorDropMult: 1.05,
    powerupDropMult: 1.05,
    // The gentlest rung keeps the full arrow rain — the onboarding wants the
    // quick dings.
    arrowDropMult: 1,
    // The most forgiving rung: a full screen tops out at a 5%-per-kill bomb,
    // a dying hero triples his medkit odds and coin-flips gear into armor, and
    // a near-broken weapon draws repairs three times as hard.
    mercy: {
      crowdBombChanceMax: 0.05,
      medkitBonus: 2,
      armorBonus: 0.5,
      repairBonus: 2,
      staminaDrinkChanceMax: 0.15,
    },
    lootIlvlBonus: 0,
    tierChanceBonus: {},
    staminaDrainMult: 0.95,
    playerDodgeMult: 1.3,
    playerMissMult: 0.5,
    enemyDodgeMult: 0.5,
    asteroidDamageFrac: 0.2,
  },
  medium: {
    id: "medium",
    index: 2,
    name: "MEDIUM",
    tagline: "THE FIGHT AS INTENDED",
    color: "#4da6ff",
    startingWeapon: "medieval_sword",
    startingStats: {},
    startingGear: ["t_shirt", "jeans", "leather_boots"],
    mobCountMult: 1,
    mobLevelOffset: -2,
    aliveMult: 1,
    // Halved pursuit once a set piece is engaged — enough to break for the
    // boss, not enough to ignore the swarm entirely.
    mobPursuitNearElite: 0.5,
    menaceMult: 0.7,
    menaceDecayMult: 1,
    menaceEffectMult: 1,
    menaceStageCap: 5,
    // Every step up the ladder pays in drop VOLUME too (easy 0 → jesus 0.1);
    // medium's small step is what makes the first climb feel it.
    dropChanceBonus: 0.01,
    medkitDropMult: 1,
    armorDropMult: 1,
    powerupDropMult: 1,
    // The 1.0 baseline: the arrow slice fills the rest of the ladder exactly
    // as the old implicit remainder did.
    arrowDropMult: 1,
    // The fight as intended, with a lighter touch than easy: a packed field
    // caps at 3% bomb, and the low-health/low-durability boosts are dialed
    // back so the rope is thinner.
    mercy: {
      crowdBombChanceMax: 0.03,
      medkitBonus: 1.3,
      armorBonus: 0.35,
      repairBonus: 1.3,
      staminaDrinkChanceMax: 0.1,
    },
    // The first rung of the "climbing pays" loot ladder: easy and medium used
    // to be loot-identical, so the harder fight bought nothing — now every
    // step up the ladder is strictly better gear (ilvl AND tier odds).
    lootIlvlBonus: 1,
    tierChanceBonus: { magic: 0.04, rare: 0.02 },
    staminaDrainMult: 1,
    playerDodgeMult: 1,
    playerMissMult: 1,
    enemyDodgeMult: 1,
    asteroidDamageFrac: 0.3,
  },
  hard: {
    id: "hard",
    index: 3,
    name: "HARD",
    tagline: "NO ROOM FOR MISTAKES",
    color: "#ffd75e",
    startingWeapon: "combat_knife",
    startingStats: {},
    startingGear: ["t_shirt", "jeans", "leather_boots"],
    mobCountMult: 1.1,
    mobLevelOffset: -1,
    aliveMult: 1.1,
    menaceMult: 1.5,
    menaceDecayMult: 0.85,
    menaceEffectMult: 1.15,
    menaceStageCap: 10,
    dropChanceBonus: 0.03,
    medkitDropMult: 0.95,
    armorDropMult: 0.95,
    powerupDropMult: 0.95,
    // Arrows start thinning: fewer free levels, more of the climb earned.
    arrowDropMult: 0.7,
    // The mercy taper (~x0.4 per rung off medium): hard keeps a WHISPER of
    // the rope — a rare bomb in a drowning swarm, a thin low-health boost —
    // so the cliff out of medium is a step, not a wall.
    mercy: {
      crowdBombChanceMax: 0.012,
      medkitBonus: 0.5,
      armorBonus: 0.13,
      repairBonus: 0.5,
      staminaDrinkChanceMax: 0.04,
    },
    lootIlvlBonus: 2,
    tierChanceBonus: { magic: 0.09, rare: 0.05 },
    staminaDrainMult: 1.05,
    playerDodgeMult: 0.9,
    playerMissMult: 1.1,
    enemyDodgeMult: 1.1,
    asteroidDamageFrac: 0.4,
  },
  nightmare: {
    id: "nightmare",
    index: 4,
    name: "NIGHTMARE",
    tagline: "THEY NEVER STOP COMING",
    color: "#ff8c42",
    startingWeapon: "brass_knuckles",
    startingStats: {},
    startingGear: ["t_shirt", "jeans", "leather_boots"],
    mobCountMult: 1.2,
    mobLevelOffset: 0,
    aliveMult: 1.3,
    menaceMult: 3.5,
    menaceDecayMult: 0.7,
    menaceEffectMult: 1.3,
    menaceStageCap: 100,
    dropChanceBonus: 0.06,
    medkitDropMult: 0.9,
    armorDropMult: 0.9,
    powerupDropMult: 0.9,
    // Arrows are scarce up here — the horde is the only real XP source.
    arrowDropMult: 0.4,
    // A ghost of mercy (the taper's last audible step before JESUS's zero).
    mercy: {
      crowdBombChanceMax: 0.005,
      medkitBonus: 0.2,
      armorBonus: 0.05,
      repairBonus: 0.2,
      staminaDrinkChanceMax: 0.015,
    },
    lootIlvlBonus: 3,
    tierChanceBonus: { magic: 0.15, rare: 0.09 },
    staminaDrainMult: 1.1,
    playerDodgeMult: 0.8,
    playerMissMult: 1.25,
    enemyDodgeMult: 1.25,
    asteroidDamageFrac: 0.5,
  },
  jesus: {
    id: "jesus",
    index: 5,
    name: "JESUS CHRIST!",
    tagline: "ABANDON ALL HOPE",
    color: "#d83a3a",
    startingWeapon: "stick",
    startingStats: {},
    startingGear: ["t_shirt", "jeans", "leather_boots"],
    // One extra step of count PLUS the +50% pile-on: 1.2 × 1.5.
    mobCountMult: 1.8,
    mobLevelOffset: 2,
    aliveMult: 1.8,
    menaceMult: 6.0,
    menaceDecayMult: 0.5,
    menaceEffectMult: 1.5,
    // No `menaceStageCap`: JESUS stays UNCAPPED — the horde evolves without a
    // roof, matching the "abandon all hope" promise.
    dropChanceBonus: 0.1,
    // A step below nightmare, then the extra −10% squeeze: 0.855 × 0.9.
    medkitDropMult: 0.77,
    armorDropMult: 0.77,
    powerupDropMult: 0.77,
    // No arrows at all on JESUS: every level is earned kill by kill.
    arrowDropMult: 0,
    // JESUS is the taper's terminus: absolute zero, no net, by design.
    mercy: {
      crowdBombChanceMax: 0,
      medkitBonus: 0,
      armorBonus: 0,
      repairBonus: 0,
      staminaDrinkChanceMax: 0,
    },
    lootIlvlBonus: 5,
    tierChanceBonus: { magic: 0.22, rare: 0.14 },
    // No extra burn past nightmare — JESUS is kited or not survived at all.
    staminaDrainMult: 1.1,
    playerDodgeMult: 0.7,
    playerMissMult: 1.4,
    enemyDodgeMult: 1.4,
    asteroidDamageFrac: 0.75,
  },
};

/** Menu order of the difficulties, gentlest first. Also orders the mob-level
 * offsets and the select-screen rows; the UNLOCK graph below is separate. */
export const DIFFICULTY_ORDER: Difficulty[] = [
  "easy",
  "medium",
  "hard",
  "nightmare",
  "jesus",
];

/**
 * The wandering merchant's SEND-OFF line, tuned to the difficulty — the second
 * half of his "welcome back" when he's already set up here (see
 * `revealMerchant` / `LevelDef.merchant.returnGreeting`). Paired with the
 * per-level warmth line, so each (level × difficulty) return greeting reads a
 * little different: an easy floor gets a light "you'll be fine," JESUS the
 * no-net truth. Dialogue text — mirror any change into `docs/manuscript.md`.
 */
export const MERCHANT_RETURN_SENDOFF: Record<Difficulty, string> = {
  easy: "STAY SHARP. YOU'LL DO FINE.",
  medium: "IT BITES HARDER NOW. WATCH IT.",
  hard: "IT'S UGLY OUT THERE. CAREFUL.",
  nightmare: "NOTHING'S FAIR NOW. GO SLOW.",
  jesus: "MOST DON'T COME BACK. LUCK.",
};

/**
 * The three PARALLEL starting lanes. All are open from the first launch — a
 * player picks one as their entry point. They run the same missions over the
 * same hero-level band (and share one XP-cap band, see `XP_CAP`); the only
 * difference is how much help each gives (easy the most, hard the least).
 * Beating ANY one of them opens the gated tier (nightmare).
 */
export const STARTING_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/**
 * Unlock graph for the difficulty ladder: a rung opens once ANY difficulty in
 * its prerequisite list is beaten. The three starting lanes have no prereqs
 * (always open); NIGHTMARE opens on any starting lane beaten; JESUS opens on
 * NIGHTMARE beaten. This replaces the old strict five-rung chain (each rung
 * needing the one before it). Consumed by the app's progression gate
 * (`isDifficultyUnlocked` in website `characters.ts`).
 */
export const DIFFICULTY_UNLOCK_PREREQS: Record<Difficulty, Difficulty[]> = {
  easy: [],
  medium: [],
  hard: [],
  nightmare: [...STARTING_DIFFICULTIES],
  jesus: ["nightmare"],
};

// Active registry the accessor reads (defaults to the shipped ladder;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeDifficultyDefs: Record<string, DifficultyDef> = DIFFICULTY_DEFS;

/** Test/authoring hook: replace the active difficulty ladder. */
export function setDifficultyDefs(defs: Record<string, DifficultyDef>): void {
  activeDifficultyDefs = defs;
}

/** Look up a difficulty def; throws on a broken id so bugs surface loudly. */
export function difficultyDef(difficulty: Difficulty): DifficultyDef {
  const def = activeDifficultyDefs[difficulty];
  if (!def) throw new Error(`unknown difficulty "${difficulty as string}"`);
  return def;
}

/** A spawn count through a difficulty's mob multiplier (never rounds a
 * non-empty spawn line down to zero). */
export function scaledMobCount(count: number, difficulty: Difficulty): number {
  if (count <= 0) return 0;
  return Math.max(
    1,
    Math.round(count * difficultyDef(difficulty).mobCountMult),
  );
}

/**
 * Resolve a PLACED PACK member's count for a difficulty (see `PackMember`).
 * A plain number is a BASE count auto-scaled by the difficulty's
 * `mobCountMult`, exactly like the wave budget (`scaledMobCount`) — the
 * ergonomic default, so a pack grows with the rung without hand-authoring
 * every one. A per-difficulty record instead hand-authors each rung VERBATIM
 * (no auto-scale) for exact control; a rung the record omits falls back to
 * the nearest DEFINED rung (preferring one below, else the closest above), so
 * a sparse `{ easy: 2, hard: 5 }` still yields a count on every difficulty and
 * a single-entry record is a flat count everywhere.
 */
export function resolvePackCount(
  count: number | Partial<Record<Difficulty, number>>,
  difficulty: Difficulty,
): number {
  if (typeof count === "number") return scaledMobCount(count, difficulty);
  const exact = count[difficulty];
  if (exact !== undefined) return Math.max(0, Math.round(exact));
  const here = difficultyDef(difficulty).index;
  let best: number | undefined;
  let bestDist = Infinity;
  for (const rung of DIFFICULTY_ORDER) {
    const value = count[rung];
    if (value === undefined) continue;
    const idx = difficultyDef(rung).index;
    // Prefer the nearest rung; on a tie prefer the LOWER one (a +0.5 nudge to
    // the above-distance breaks ties toward "no harder than authored").
    const dist = Math.abs(idx - here) + (idx > here ? 0.5 : 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = value;
    }
  }
  return best === undefined ? 0 : Math.max(0, Math.round(best));
}

/**
 * Does `current` sit at or above `min` on the ladder? The ordering is a def's
 * `index`, so this is how difficulty-gated content (a level's
 * `minDifficulty` spawn/wave lines) decides whether to appear: a line tagged
 * `minDifficulty: "hard"` is skipped on easy/medium and included from hard up.
 * An omitted `min` always passes.
 */
export function meetsMinDifficulty(
  current: Difficulty,
  min: Difficulty | undefined,
): boolean {
  if (!min) return true;
  return difficultyDef(current).index >= difficultyDef(min).index;
}

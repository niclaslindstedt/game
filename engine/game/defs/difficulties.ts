// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The difficulty catalog. A difficulty is pure data layered over every
// level, and it turns a whole rack of knobs at once: how the hero starts
// (stat head-start, the weapon off the wall), how the horde compares to him
// (count and RELATIVE LEVEL), how generous the floor is (medkits, armor,
// powerups), how fast he tires (stamina), how touchy the rampage meter is —
// and it pays the harder rungs back in richer loot (higher tiers, deeper
// item levels). MEDIUM is the 1.0 baseline the levels are tuned at; every
// other entry scales from it.

import {
  GENERATED_MOB_HP,
  GENERATED_STAMINA_DRAIN,
  GENERATED_STAMINA_EMPTY_LOCK,
  GENERATED_STAMINA_REFILL,
} from "../../generated/level-index.ts";
import type { Difficulty, StatName, Tier } from "../types/index.ts";

/**
 * A rung's sprint-pool drain multiplier, authored in `content/ladder.yaml`
 * (`staminaDrain`) beside the mob bands and hp curves — how hard it is to keep
 * MOVING on this rung, tuned from the same one file the rest of the ladder is.
 * The loader already proves every rung is priced and that the ladder never
 * eases as it climbs, so a miss here is a broken build, not a soft default.
 */
function ladderStaminaDrain(rung: Difficulty): number {
  const value = GENERATED_STAMINA_DRAIN[rung];
  if (value === undefined)
    throw new Error(`ladder.yaml prices no staminaDrain for "${rung}"`);
  return value;
}

/**
 * A rung's MOB-HP multiplier, authored in `content/ladder.yaml` (`mobHp`)
 * beside the mob bands — the ladder's own toughness STEP, applied on top of
 * the level curve (`MENACE.mobHpGrowthPerLevel`, which shapes how hp grows
 * WITH monster level). Without it a harder rung was only tougher because its
 * mobs stood a couple of LEVELS higher, which is a small gradual difference;
 * NIGHTMARE is meant to land as a step. The loader already proves every rung
 * is priced and that the ladder never eases as it climbs, so a miss here is a
 * broken build, not a soft default.
 */
function ladderMobHp(rung: Difficulty): number {
  const value = GENERATED_MOB_HP[rung];
  if (value === undefined)
    throw new Error(`ladder.yaml prices no mobHp for "${rung}"`);
  return value;
}

/**
 * A rung's standstill BREATHER, in seconds to refill the base pool — the other
 * half of the ladder's stamina economy, authored beside the drain in
 * `content/ladder.yaml` (`staminaRefill`). The high rungs make catching a
 * breath cost more of the fight, not merely spend faster.
 */
function ladderStaminaRefill(rung: Difficulty): number {
  const value = GENERATED_STAMINA_REFILL[rung];
  if (value === undefined)
    throw new Error(`ladder.yaml prices no staminaRefill for "${rung}"`);
  return value;
}

/**
 * A rung's empty-pool LOCKOUT, in seconds of uninterrupted standstill owed
 * before regen resumes — the price of running dry, authored beside the drain
 * and the breather in `content/ladder.yaml` (`staminaEmptyLock`). The harshest
 * of the three ladders: it is dead time with the horde still coming.
 */
function ladderStaminaEmptyLock(rung: Difficulty): number {
  const value = GENERATED_STAMINA_EMPTY_LOCK[rung];
  if (value === undefined)
    throw new Error(`ladder.yaml prices no staminaEmptyLock for "${rung}"`);
  return value;
}

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
  /**
   * Multiplies every spawn count: placed spawns, spawn-point queues and wave
   * budgets alike (`scaledMobCount`).
   *
   * THE DENSITY LADDER — this is how many bodies a map HOLDS in total, not how
   * thick the ring around the hero stands at any moment (that is `aliveMult`).
   * The two were confused for a long time, and the cost was a
   * campaign that played as a WALK between fights: the ladder ran 0.8 / 1 / 1.1
   * / 1.2 / 1.8, so even NIGHTMARE fielded barely a fifth more bodies than the
   * baseline over maps that keep getting bigger — and on a GENERATED map, whose
   * carve is roughly twice the authored map's area, the same thin count is
   * spread over twice the ground and the hero spends the walk hunting for
   * something to fight.
   *
   * The rung's step is now a real one — 1.2 / 2 / 2.75 / 3.6 / 7.2 — which is
   * ×1.5 / ×2 / ×2.5 / ×3 / ×4 on what each rung used to field. A harder rung
   * is not merely a tougher mob, it is MORE of them.
   *
   * This knob does NOT change leveling pace per KILL (a mob's XP is priced off
   * its level, not off how many of it there are), but it does change what a
   * full clear PAYS — so every rung's `xpBonus` was re-trimmed against the
   * progression sim to land each lane on the same finish level it landed on
   * before (easy 34 / medium 36 / hard 38 / nightmare 52 / jesus 50). Move this
   * and that trim has to be re-measured: `node scripts/progression-sim.mjs
   * --difficulty <rung>`, first-visit `heroLevelEnd` per map.
   */
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
  /**
   * HARD CAPS on the horde's monster level (`mobLevelFor` clamps
   * `player + mobLevelOffset` into `[mobLevelMin, mobLevelMax]`). This bounds a
   * tier's mobs to a level BAND regardless of how far the hero out- or
   * under-levels it: EASY 1–34, MEDIUM 2–36, HARD 3–38, NIGHTMARE 38–56,
   * JESUS 58+. The floor makes the low end of a tier fight mobs a touch ABOVE
   * a freshly-arrived hero (nightmare/jesus catch-up); the ceiling stops mobs
   * scaling once the hero out-levels the tier, so an over-levelled farm run
   * meets stuck (and, via the level-difference XP rule, XP-poor) mobs. Elites
   * and bosses add their own `levelBonus` ON TOP and may run past the ceiling.
   * Optional: a difficulty that omits them is UNCAPPED (the bare
   * `player + mobLevelOffset`, as before) — the shipped rungs all set them; the
   * test fixtures leave them off to keep the old uncapped calibration.
   */
  mobLevelMin?: number;
  mobLevelMax?: number;
  /**
   * THE CHEST THIS RUNG PAYS — the CACHE Ruth hands over for THE SCALE
   * (engine/game/cache.ts). A rung that names none pays no chest, which is what
   * keeps the test fixtures free of it.
   *
   * IT IS A LADDER, AND THE LADDER IS THE POINT. Ruth's last errand is run once
   * per difficulty, and each time she brings something further back out of her
   * mother's house: a bigger piece of furniture with its own name, worth one
   * more ROW of cells. The shipped rungs run 16 → 24 → 32 → 40 → 48, two rows
   * up to six, and the top of it is exactly Diablo II's stash — the thing this
   * whole feature is.
   *
   * WHAT A HERO OWNS IS A HIGH-WATER MARK, never this number directly: the
   * chest earned on NIGHTMARE is still forty cells deep on a fresh EASY run,
   * because a stash that shrank when you started an easier game would have to
   * decide which of the player's things to throw away. `grantCache` only ever
   * raises it (see `GameState.cacheSlots`).
   *
   * `slots` must be a multiple of `CACHE.cols` or the chest ends in a ragged
   * half row; the content suite checks it.
   */
  cache?: {
    /** What Ruth calls the thing she brings on this rung. */
    name: string;
    /** How many cells it holds — a multiple of `CACHE.cols`. */
    slots: number;
    /**
     * THE THING ITSELF, as a sprite. Each rung is a visibly grander piece of
     * furniture than the one below — a lidded box, the chest proper, a banded
     * travel trunk, a carved dowry chest, and finally the gilded one — because
     * a reward that is only a bigger NUMBER is a reward the player reads in a
     * tooltip. The chest is the thing standing in their garage; it should look
     * like the climb.
     *
     * The garage blueprint authors a sprite too, and it is only the fallback
     * (and what satisfies the atlas check): what actually stands there is the
     * rung the hero has EARNED, which is not knowable when the map is carved.
     */
    sprite: string;
    /**
     * WHAT RUTH SAYS SHE BROUGHT — the provenance, and the other half of the
     * ladder. The furniture gets grander; so does the story behind it, from a
     * flea-market box on the gentlest rung to a thing her family swears came
     * off a king on the hardest. A reward that only grew a NUMBER would be
     * something the player reads in a tooltip.
     *
     * Written as one whole page (`CACHE_TOKEN` — the errand's `complete:`
     * block writes `{CACHE}` where it goes), so it obeys the same ~120
     * character budget every other authored page does.
     */
    line: string;
  };
  /**
   * MOB ARMOR — this rung's flat bonus to PHYSICAL-damage mitigation, STACKED ON
   * TOP of the steady per-level armor ramp (config `MOB_ARMOR`, applied in
   * `mobArmorReduction`/`mobArmorMult`, loot.ts). The level ramp climbs to 35%
   * by the cap on every rung; this bonus is what makes the JUMP between rungs
   * felt: EASY 0, MEDIUM +2%, HARD +5%, NIGHTMARE +10%, JESUS +15% — so a JESUS
   * mob reaches the full 50% reduction at the level cap. MAGIC weapons (and
   * powerups/procs) ignore armor entirely, so the armored top rungs tilt toward
   * magic builds. Runtime-scaled by BALANCE › MOB ARMOR; omitted (test fixtures)
   * = 0.
   */
  mobArmor?: number;
  /**
   * HOW THICK THE CROWD STANDS — the rung's multiplier on the live cap of every
   * spawner on the map: the wave spawner's cap AND floor (`maxAlive`,
   * `minAlive`), and the per-point CONCURRENT-ALIVE CAP of every finite spawn
   * point (`SPAWNERS.maxAlive`, resolved through `scaledAliveCap` in create.ts).
   *
   * It used to reach the WAVE spawner only — and since `the_bunker` is the only
   * map that streams waves, that meant the whole campaign had NO difficulty
   * knob on how many mobs stand on the field at once: every rung held the same
   * flat 14 live members per spawn point, easy through JESUS. A rung got
   * tougher mobs, more of them in total, and a faster refill, but never a
   * THICKER crowd — which is what "there are too few mobs showing up" actually
   * is. Scaling the spawn-point cap here is what makes the rung's step visible
   * on screen rather than only in the totals.
   *
   * Read it beside `mobCountMult`, which is the SUPPLY (how many bodies the map
   * holds in total): the two have to climb together, because a raised cap with
   * a flat supply just empties each point's queue faster and hands the map back
   * empty — the hunting the ladder is meant to end.
   */
  aliveMult: number;
  /**
   * THE LANDING RAMP's strength on this rung: the multiplier on a spawn point's
   * live cap for a point sitting ON the hero's spawn, ramping linearly back to 1
   * at `SPAWNERS.landingReach` of the way to the objective. Below 1 the map opens
   * thin and thickens as the hero commits to it.
   *
   * The ladder is roughly the INVERSE of each rung's `aliveMult` step, which is
   * the point: it hands the doorstep back to about the thickness it had before
   * the density ladder (a touch over, so the opening is still denser than it
   * was), while the rest of the map keeps the full new crowd. A rung that
   * multiplied its horde by 4 needs to give more of it back at the landing than
   * one that multiplied by 1.5 — so the HARSHER the rung, the SMALLER this
   * number, and every rung's opening ends up feeling about the same relative to
   * where it was. Omitted (test fixtures) = 1, no ramp.
   */
  landingAliveMin?: number;
  /**
   * The most SPAWN POINTS (finite spawners — `SpawnerRuntime`, `stepSpawners`)
   * allowed ACTIVE at once on this rung. When more than this many points are in
   * trigger range, only the ones CLOSEST to the hero (and in clear line of
   * sight) arm; the rest wait dormant until an active wave drains and frees a
   * slot. Keeps a maze from lighting every spawner around the hero at once — the
   * pressure follows him instead of piling on. Climbs with the ladder: EASY 2,
   * MEDIUM 3, HARD 4, NIGHTMARE 5. Omitted = UNCAPPED (every eligible point arms,
   * as before) — JESUS leaves it off, and the test fixtures inherit whatever
   * they set.
   */
  activeSpawnerCap?: number;
  /**
   * SPAWN-POINT REFILL PACE. Multiplies the base post-kill respawn delay of every
   * finite spawn point on this rung (config `SPAWNERS.respawnDelayMs`, resolved
   * in create.ts): BELOW 1 the horde refills a thinned wave FASTER, so the harder
   * rungs are more relentless. Tapers down the ladder — EASY 1.6 (a long breather
   * after each kill), MEDIUM 1.0 (the baseline), then 0.8 / 0.6 / 0.45 — while the
   * per-map and boss-proximity factors shorten it further. Omitted (test
   * fixtures) = 1 (no change).
   */
  spawnerRespawnMult?: number;
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
   * How hard a menace stage lands on the CROWD: multiplies the lure that
   * swells the live horde (`MENACE.lurePerStage`). The gentle rungs turn a
   * rampage into a shrug; the hard rungs turn it into a wall.
   *
   * It no longer sizes the evolution STEP — a stage is one mob LEVEL on every
   * rung (`evolutionLevelBonus`), and what a difficulty controls is how many
   * stages it allows (`menaceStageCap`).
   */
  menaceEffectMult: number;
  /**
   * This rung's ALLOWANCE of evolution stages — the base of its PEAK. Both the
   * live meter and the permanent ratchet floor are clamped to that peak (see
   * `menaceStageCap`/`menaceCeiling` in menace.ts), so a gentle rung tops out
   * early no matter how thoroughly the horde is steamrolled: EASY allows 3,
   * MEDIUM 5, HARD 10, NIGHTMARE 100. Left
   * `undefined` on JESUS — that rung stays UNCAPPED, the horde evolving without
   * a roof for as long as the player keeps proving it too easy.
   *
   * The peak is this number PLUS the hero's LEVEL HEADROOM over the venue's
   * horde (`menaceLevelHeadroom`): a stage is one mob level now, so a hero who
   * has outgrown a pinned-level map may rampage the crowd back up to about his
   * own level — the allowance is what he gets on top of that, not instead of it.
   */
  menaceStageCap?: number;
  /**
   * A flat XP-GAIN multiplier for this rung, applied to EVERY grant (kills,
   * a scroll's doubled cut, scripted awards) at the one `grantXp` door. It
   * paces how far a
   * campaign clear levels the hero WITHOUT touching mob levels, counts, or the
   * cost curve — the lever for lifting a tier that lands short of its intended
   * finish (a big-span tier like NIGHTMARE, whose per-level cost outruns the
   * map XP). Omitted = 1 (no change). Distinct from the dev BALANCE › XP knob,
   * which scales all rungs together.
   */
  xpBonus?: number;
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
   * Multiplies the XP-SCROLL slice of the drop ladder (the `scrollDropShare`
   * knob in content/leveling.yaml) — double-XP windows thin out up the rungs,
   * so the harder fights lean on the kill grind instead of a scroll rain.
   * Whatever this trims off the slice simply doesn't drop (scrolls are the
   * ladder's tail, not the leftover). JESUS sets it to 0: no scrolls at all,
   * the climb is earned kill by kill.
   */
  scrollDropMult: number;
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
   * Multiplies the sprint pool's drain rate (STAMINA.drainPerSec) — how hard
   * this rung makes it to keep MOVING. Authored in `content/ladder.yaml`
   * (`staminaDrain`) beside the mob bands, not here: the climb is steep on
   * purpose, so that a build spending nothing on STAMINA runs dry on the high
   * rungs while one spending about a fifth of its points there rides
   * comfortably. See the duty-cycle note in the ladder file.
   */
  /**
   * The rung's MOB-HP multiplier (`content/ladder.yaml` `mobHp`) — the
   * ladder's own toughness STEP, multiplied into every mob-hp read so the
   * spawn scale, the menace reference healthbar, and ability scaling all move
   * together. 1 = the MEDIUM baseline.
   */
  mobHpMult: number;
  staminaDrainMult: number;
  /**
   * Seconds a full STANDSTILL breather takes to refill the BASE sprint pool on
   * this rung (`STAMINA.base`) — the refill half of the duty cycle, authored in
   * `content/ladder.yaml` (`staminaRefill`) and turned into a rate by
   * `staminaRegenPerSec`. The STAMINA stat quickens it from there
   * (`STAMINA.regenPerPoint`), so a deep pool never refills slower than a
   * shallow one.
   */
  staminaRefillSec: number;
  /**
   * Seconds of UNINTERRUPTED STANDSTILL a hero owes on this rung after running
   * the pool dry, before regen resumes at all (any movement re-arms the whole
   * window). Authored in `content/ladder.yaml` (`staminaEmptyLock`); together
   * with `staminaRefillSec` it decides what ONE dry-out actually costs — 6.5 s
   * on easy up to 14.5 s on JESUS.
   */
  staminaEmptyLockSec: number;
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
  /**
   * The bite a SAND STORM strike takes out of the hero, as a fraction of his
   * MAX hp (see stepSandstorms) — smaller than a rock's, because the storm's
   * real punishment is the KNOCKOUT it lands with it (2s prone). Scales up the
   * rung like the rock rain; the suit's plating soaks its share, no crit, no
   * dodge roll — a squall is dodged with the feet.
   */
  sandstormDamageFrac: number;
  /**
   * The bite an EMPLOYEE STAMPEDE trample takes out of the hero, as a fraction
   * of his MAX hp (see stepStampedes) — like the sand storm, the herd's real
   * punishment is the 2s KNOCKDOWN it lands with it. Scales up the rung; the
   * suit's plating soaks its share, no crit, no dodge roll — a herd is dodged
   * with the feet (a jump clears the whole wall).
   */
  stampedeDamageFrac: number;
  /**
   * How long a warning the EMPLOYEE STAMPEDE's approach-dust telegraph gives on
   * this rung — a multiplier on the base lead (config `STAMPEDES.telegraphMs`,
   * 1s). Above 1 the gentle rungs get a long look at which lane to clear before
   * the wall appears; below 1 the hard rungs get a blink. Ramps down the ladder:
   * EASY 1.5, MEDIUM 1.3, HARD 1.0, NIGHTMARE 0.7, JESUS 0.4 — the same lever
   * every hazard uses to make the top rungs less forgiving without touching the
   * blow itself (here it's the reaction window, not the bite).
   */
  stampedeTelegraphMult: number;
  /**
   * THE DRIVE'S OWN RUNG — how heavy the road is in the minigame between the
   * garage and GOODCO (`engine/game/drive/`), as multipliers on the mass of the
   * two things out on it.
   *
   * THE LADDER TURNS THE MASS AND NOTHING ELSE, on purpose. A drive's collision
   * is a real momentum sum rather than a table of penalties (`impact.ts`), so
   * the honest place to put a difficulty knob is the one number that is
   * genuinely a property of the ROAD — what the car has to shove out of the
   * way. Turn it and BOTH halves of the answer move together, because they are
   * the same sum: the car hands over more momentum (a body costs more speed)
   * and the crumple absorbs more energy (the car breaks sooner). Every RATIO
   * the model is built on survives untouched — square on the nose still costs
   * far more than clipped on the wing, damage still goes as the SQUARE of the
   * closing speed, and a struck body still LEAVES at very nearly the same
   * speed (its launch is `M/(M+m)` of the sweep, which barely moves), so the
   * gore reads identically on every rung.
   *
   * MEDIUM is the 1.0 baseline the road was tuned at (`DRIVE.coursePx`'s
   * measured table). The crowd's column climbs further than the traffic's
   * because a mass multiplier SATURATES against the car's own 1600 kg: an
   * infinitely heavy van would still only cost the wagon its own share of the
   * closing speed, so 4.5× the mass of a hatchback is about 1.75× the speed
   * loss, while 2.5× the mass of a person is about 2.3×.
   */
  drive: {
    /** Multiplies `DRIVE_UNITS.pedestrianMassKg` for this rung. */
    pedestrianMassMult: number;
    /** Multiplies `DRIVE_UNITS.trafficMassKg` for this rung. */
    trafficMassMult: number;
    /**
     * HOW MUCH OTHER TRAFFIC is out there — it DIVIDES `DRIVE.laneTraffic.gapPx`
     * (and multiplies the footway's own `DRIVE.pavementPerKPx`), so a higher
     * number leaves less road between one vehicle and the next in a lane.
     *
     * The one knob on this road that changes what is in front of the player
     * rather than what it weighs, and it is here because traffic is the only
     * hazard that can take a LANE away. On the gentle rungs the gap is half as
     * big again, so there is usually somewhere to put the wagon; on the hard
     * ones every lane is served on every screen and the gap in the crowd has to
     * be taken when it is offered.
     */
    trafficDensity: number;
    /**
     * HOW FAST THE WAGON IS ALLOWED TO GO on this rung, in the unit the dial
     * says out loud — 120 on EASY, climbing to the car's own 174
     * (`DRIVE.topSpeedMph`) at the top.
     *
     * SPEED IS THE DIFFICULTY, and that is the whole of why this is a rung
     * rather than a constant. Every hazard on this road is priced in closing
     * speed: the damage a hit does goes as its SQUARE, an oncoming lane arrives
     * at the sum of both speeds, and the gap in the crowd a driver can still
     * reach shrinks with every mile an hour. A player who cannot exceed 120 is
     * not being handicapped — he is being given a road whose every collision is
     * half the energy and whose every decision has half again as long to be
     * made in.
     *
     * IT IS A CEILING, NOT A SCALE. `DRIVE_UNITS.mPerPx` does not move, so a
     * world pixel is the same metre on every rung and 120 mph on EASY is 120
     * real miles an hour — the wagon simply stops accelerating sooner. The
     * dashboard is told the rung's own number too (`dials.ts`), so the
     * speedometer's last figure reads 120 and the needle still sweeps the whole
     * face rather than dying two thirds of the way round.
     */
    topSpeedMph: number;
  };
};

export const DIFFICULTY_DEFS: Record<Difficulty, DifficultyDef> = {
  easy: {
    id: "easy",
    index: 1,
    name: "EASY",
    tagline: "A GENTLE WARM-UP",
    color: "#7ef0c8",
    // Grandpa's, off the garage wall: a short-range SPREAD, so the kindest rung
    // teaches the AoE read from the opening knot without handing the player a
    // single-target wand (see WEAPON_DEFS.sawed_off_shotgun). It is slower and
    // hits far harder per pull than the cone-spray this replaced — same
    // sustained output, delivered in blows big enough that a point-blank blast
    // takes a body apart, which is what a shotgun is FOR.
    startingWeapon: "sawed_off_shotgun",
    // Four banked points — a broad head start, one in each combat stat.
    startingStats: { stamina: 1, strength: 1, dexterity: 1, intelligence: 1 },
    // The band comes with him: the one piece of jewellery he owns before the
    // ladder pays out any of its own (see `engagement_band` — +1 LUCK).
    startingGear: ["t_shirt", "jeans", "leather_boots", "engagement_band"],
    // EASY is a genuine WARM-UP: fewer bodies on screen AT ONCE than the "as
    // intended" MEDIUM baseline, so a first-time player holding a pointer is
    // never buried by the crowd. The onboarding bar is that the first level
    // almost never kills a new player — but the lever for that is `aliveMult`
    // (how thick the RING gets), not `mobCountMult` (how many bodies the map
    // HOLDS in total). Pulling the count down is what made a map feel empty
    // between fights; `aliveMult` alone keeps the ring survivable while the
    // player learns to steer. See the DENSITY LADDER note on `mobCountMult`.
    mobCountMult: 1.2,
    mobLevelOffset: -3,
    mobLevelMin: 1,
    mobLevelMax: 34,
    // THE CHEST THIS RUNG PAYS (see `DifficultyDef.cache`).
    // A lidded box off the top of her mother's wardrobe — the first thing to hand,
    // and the smallest. Two rows.
    cache: {
      name: "THE KEEPSAKE BOX",
      slots: 16,
      sprite: "keepsake_box",
      line: "THERE'S A BOX AGAINST THAT WALL NOW. FLEA MARKET, TWO DOLLARS. PUT IN IT WHAT YOU CAN'T CARRY.",
    },
    mobArmor: 0,
    aliveMult: 0.9,
    landingAliveMin: 0.75,
    // Only the two closest spawn points light at once — the gentlest crowd.
    activeSpawnerCap: 2,
    // A long breather after each kill before a point summons a replacement.
    spawnerRespawnMult: 1.6,
    // The gentlest rung all but parks the horde once a set piece is engaged:
    // 10% speed, so the player can walk straight through it to the boss.
    mobPursuitNearElite: 0.1,
    menaceMult: 0.05,
    menaceDecayMult: 1.5,
    menaceEffectMult: 0.5,
    menaceStageCap: 3,
    // Trimmed (2.5 → 2.2) with the leveling.yaml repace, back when the XP
    // faucet was a golden arrow paying a share of the BAR (self-scaling), so
    // the gentle lanes kept landing ~2 over the ladder however much the curve
    // rose — the last two levels of the trim live here (full clear → ~31, the
    // ladder's finish).
    xpBonus: 1.6,
    dropChanceBonus: 0,
    medkitDropMult: 1.05,
    armorDropMult: 1.05,
    powerupDropMult: 1.05,
    // The gentlest rung keeps the full scroll rain — the onboarding wants the
    // quick dings.
    scrollDropMult: 1,
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
    mobHpMult: ladderMobHp("easy"),
    staminaDrainMult: ladderStaminaDrain("easy"),
    staminaRefillSec: ladderStaminaRefill("easy"),
    staminaEmptyLockSec: ladderStaminaEmptyLock("easy"),
    // The hero slips a bigger share of incoming blows on the gentlest rung — the
    // second half of "almost never die on level one": fewer bodies (aliveMult)
    // AND more of their swings whiff.
    playerDodgeMult: 1.6,
    playerMissMult: 0.5,
    enemyDodgeMult: 0.5,
    asteroidDamageFrac: 0.2,
    sandstormDamageFrac: 0.1,
    stampedeDamageFrac: 0.1,
    stampedeTelegraphMult: 1.5,
    // THE ROAD IS MADE OF PAPER on the gentlest rung, and unashamedly so: a
    // body weighs half of what a body weighs, the other cars a third of a car.
    // Nothing about that is realistic and it is not trying to be — EASY is where
    // a player learns the wheel, and a wagon that can be driven flat out through
    // a crowd and still arrive is what makes the joke land before the road
    // starts asking for skill.
    //
    // HALF RATHER THAN THE QUARTER IT OPENED WITH, because a quarter was not a
    // gentle rung, it was a rung where the crowd had stopped being physics at
    // all: 20 kg is a bag of shopping, and a body met at the pace this leg is
    // driven at came off the speedometer at one mph in sixty. The player felt
    // nothing whatever, learnt nothing about what a person costs, and then read
    // a tally of seventy of them at the arrival. The step to MEDIUM stays the
    // largest on the ladder — the crowd is still HALF price here — but a hit is
    // now something that happened.
    drive: {
      pedestrianMassMult: 0.5,
      trafficMassMult: 0.35,
      // A SCREEN between the cars on his own side and TWO between the ones
      // coming at him (`DRIVE.laneTraffic`) — about two cars his way and one
      // against in shot at any moment.
      //
      // IT WENT UP, AND THE ROAD GOT KINDER, which is only a contradiction if
      // you read the number as "how much traffic". The rung used to be 0.6 with
      // both sides priced alike, and both sides priced alike is what made EASY
      // read as a hard rung: the far lanes close at the SUM of the two speeds,
      // so the same gap delivered them at better than twice the rate, and the
      // player's whole picture was oncoming cars he had no time to plan for.
      // The oncoming half is now HALF AS THICK as it was and the near half —
      // the one you can simply go round — carries the difference.
      trafficDensity: 0.85,
      // …and the kindest rung is the SLOWEST one. See the field's note: every
      // hazard on this road is priced in closing speed, so 120 halves the
      // energy of every collision and buys back half again as long to read the
      // crowd — which is a gentler road than any amount of lightening the
      // things on it.
      topSpeedMph: 120,
    },
  },
  medium: {
    id: "medium",
    index: 2,
    name: "MEDIUM",
    tagline: "THE FIGHT AS INTENDED",
    color: "#4da6ff",
    startingWeapon: "medieval_sword",
    startingStats: {},
    // The band comes with him: the one piece of jewellery he owns before the
    // ladder pays out any of its own (see `engagement_band` — +1 LUCK).
    startingGear: ["t_shirt", "jeans", "leather_boots", "engagement_band"],
    mobCountMult: 2,
    mobLevelOffset: -2,
    mobLevelMin: 2,
    mobLevelMax: 36,
    // THE CHEST THIS RUNG PAYS (see `DifficultyDef.cache`).
    // The chest proper, the one the family always meant when it said THE chest.
    cache: {
      name: "THE HEIRLOOM CHEST",
      slots: 24,
      sprite: "antique_chest",
      line: "THERE'S A CHEST AGAINST THAT WALL NOW. MY MOTHER'S. SHE KEPT HER LETTERS IN IT AND NOTHING ELSE, EVER.",
    },
    mobArmor: 0.02,
    aliveMult: 2,
    landingAliveMin: 0.6,
    activeSpawnerCap: 3,
    // The baseline refill pace the spawner delays are authored against.
    spawnerRespawnMult: 1.0,
    // Halved pursuit once a set piece is engaged — enough to break for the
    // boss, not enough to ignore the swarm entirely.
    mobPursuitNearElite: 0.5,
    menaceMult: 0.7,
    menaceDecayMult: 1,
    menaceEffectMult: 1,
    menaceStageCap: 5,
    // Every step up the ladder pays in drop VOLUME too (easy 0 → jesus 0.1);
    // medium's small step is what makes the first climb feel it.
    // Trimmed (2.5 → 2.2) with the leveling.yaml repace — see easy's note.
    xpBonus: 1.3,
    dropChanceBonus: 0.01,
    medkitDropMult: 1,
    armorDropMult: 1,
    powerupDropMult: 1,
    // The 1.0 baseline: the scroll slice fills the rest of the ladder exactly
    // as the old implicit remainder did.
    scrollDropMult: 1,
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
    mobHpMult: ladderMobHp("medium"),
    staminaDrainMult: ladderStaminaDrain("medium"),
    staminaRefillSec: ladderStaminaRefill("medium"),
    staminaEmptyLockSec: ladderStaminaEmptyLock("medium"),
    playerDodgeMult: 1,
    playerMissMult: 1,
    enemyDodgeMult: 1,
    asteroidDamageFrac: 0.3,
    sandstormDamageFrac: 0.15,
    stampedeDamageFrac: 0.15,
    stampedeTelegraphMult: 1.3,
    // THE ROAD AS IT WAS MEASURED — the 1.0 baseline `DRIVE.coursePx`'s table
    // was driven against. Every other rung is a multiple of this one.
    drive: {
      pedestrianMassMult: 1,
      trafficMassMult: 1,
      trafficDensity: 1,
      topSpeedMph: 135,
    },
  },
  hard: {
    id: "hard",
    index: 3,
    name: "HARD",
    tagline: "NO ROOM FOR MISTAKES",
    color: "#ffd75e",
    startingWeapon: "combat_knife",
    startingStats: {},
    // The band comes with him: the one piece of jewellery he owns before the
    // ladder pays out any of its own (see `engagement_band` — +1 LUCK).
    startingGear: ["t_shirt", "jeans", "leather_boots", "engagement_band"],
    mobCountMult: 2.75,
    mobLevelOffset: -1,
    mobLevelMin: 3,
    mobLevelMax: 38,
    // THE CHEST THIS RUNG PAYS (see `DifficultyDef.cache`).
    // Off the back of the same house: a travel trunk with somebody's initials
    // still stencilled on the lid.
    cache: {
      name: "THE STEAMER TRUNK",
      slots: 32,
      sprite: "steamer_trunk",
      line: "THAT TRUNK BY THE WALL CAME OVER WITH MY GRANDFATHER. EVERYTHING HE OWNED WENT IN IT, AND IT WASN'T FULL.",
    },
    mobArmor: 0.05,
    aliveMult: 2.75,
    landingAliveMin: 0.5,
    activeSpawnerCap: 4,
    // Refills a touch quicker than the baseline — less breathing room per kill.
    spawnerRespawnMult: 0.8,
    menaceMult: 1.5,
    menaceDecayMult: 0.85,
    menaceEffectMult: 1.15,
    menaceStageCap: 10,
    xpBonus: 1.15,
    dropChanceBonus: 0.03,
    medkitDropMult: 0.95,
    armorDropMult: 0.95,
    powerupDropMult: 0.95,
    // Scrolls start thinning: fewer doubled windows, more of the climb earned.
    scrollDropMult: 0.7,
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
    mobHpMult: ladderMobHp("hard"),
    staminaDrainMult: ladderStaminaDrain("hard"),
    staminaRefillSec: ladderStaminaRefill("hard"),
    staminaEmptyLockSec: ladderStaminaEmptyLock("hard"),
    playerDodgeMult: 0.9,
    playerMissMult: 1.1,
    enemyDodgeMult: 1.1,
    asteroidDamageFrac: 0.4,
    sandstormDamageFrac: 0.2,
    stampedeDamageFrac: 0.2,
    stampedeTelegraphMult: 1.0,
    // Half again as heavy as the baseline: the first rung on which holding the
    // throttle down through a crowd stops being a way of getting there sooner.
    drive: {
      pedestrianMassMult: 1.6,
      trafficMassMult: 2,
      trafficDensity: 1.15,
      topSpeedMph: 148,
    },
  },
  nightmare: {
    id: "nightmare",
    index: 4,
    name: "NIGHTMARE",
    tagline: "THEY NEVER STOP COMING",
    color: "#ff8c42",
    startingWeapon: "brass_knuckles",
    startingStats: {},
    // The band comes with him: the one piece of jewellery he owns before the
    // ladder pays out any of its own (see `engagement_band` — +1 LUCK).
    startingGear: ["t_shirt", "jeans", "leather_boots", "engagement_band"],
    mobCountMult: 3.6,
    mobLevelOffset: 0,
    mobLevelMin: 38,
    mobLevelMax: 56,
    // THE CHEST THIS RUNG PAYS (see `DifficultyDef.cache`).
    // Older than the house. It was packed for a wedding nobody alive attended and
    // has been packed for somebody ever since.
    cache: {
      name: "THE DOWRY CHEST",
      slots: 40,
      sprite: "dowry_chest",
      line: "THAT ONE CAME WITH A BRIDE, BEFORE THERE WAS A COUNTRY TO BRING IT TO. NOBODY HERE HAS EVER MANAGED TO GET RID OF IT.",
    },
    mobArmor: 0.1,
    aliveMult: 3.9,
    landingAliveMin: 0.42,
    activeSpawnerCap: 5,
    // "They never stop coming" — a thinned wave refills fast.
    spawnerRespawnMult: 0.6,
    menaceMult: 3.5,
    menaceDecayMult: 0.7,
    menaceEffectMult: 1.3,
    menaceStageCap: 100,
    // NIGHTMARE spans 15 levels (40→55) over the same five maps easy climbs 30+
    // cheap levels through — at these high levels each level's XP cost outruns a
    // map's kill XP, so a flat clear lands several levels short (which cascades:
    // an under-levelled hero kills slower, earns slower, and meets the next
    // map's authored band even further over his head). A per-kill XP bonus
    // closes the gap without inflating mob levels/counts off the hero curve —
    // sized so a full clear lands ~55 (leveling-curve.mjs --targets reads OK).
    xpBonus: 0.66,
    dropChanceBonus: 0.06,
    medkitDropMult: 0.9,
    armorDropMult: 0.9,
    powerupDropMult: 0.9,
    // Scrolls are scarce up here — the horde is the only real XP source.
    scrollDropMult: 0.4,
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
    mobHpMult: ladderMobHp("nightmare"),
    staminaDrainMult: ladderStaminaDrain("nightmare"),
    staminaRefillSec: ladderStaminaRefill("nightmare"),
    staminaEmptyLockSec: ladderStaminaEmptyLock("nightmare"),
    playerDodgeMult: 0.8,
    playerMissMult: 1.25,
    enemyDodgeMult: 1.25,
    asteroidDamageFrac: 0.5,
    sandstormDamageFrac: 0.28,
    stampedeDamageFrac: 0.3,
    stampedeTelegraphMult: 0.7,
    // The crowd is where the trip is lost now: a driver who does not thread
    // arrives on a wreck, and a driver who does arrives late.
    drive: {
      pedestrianMassMult: 2.3,
      trafficMassMult: 3.4,
      trafficDensity: 1.3,
      topSpeedMph: 161,
    },
  },
  jesus: {
    id: "jesus",
    index: 5,
    name: "JESUS CHRIST!",
    tagline: "ABANDON ALL HOPE",
    color: "#d83a3a",
    startingWeapon: "stick",
    startingStats: {},
    // The band comes with him: the one piece of jewellery he owns before the
    // ladder pays out any of its own (see `engagement_band` — +1 LUCK).
    startingGear: ["t_shirt", "jeans", "leather_boots", "engagement_band"],
    // The ladder's top step, four times what the rung used to field: the
    // "abandon all hope" horde is a wall of bodies, not a thin line of tough
    // ones. 1.8 × 4.
    mobCountMult: 7.2,
    mobLevelOffset: 2,
    mobLevelMin: 58,
    mobLevelMax: 999,
    // THE CHEST THIS RUNG PAYS (see `DifficultyDef.cache`) — and the top of the
    // ladder: eight columns by six rows, which is DIABLO II'S STASH exactly.
    // There is nothing further back in the house; this is the whole
    // inheritance, and the name says so.
    cache: {
      name: "THE INHERITANCE",
      slots: 48,
      sprite: "the_inheritance",
      line: "HIS GRANDFATHER SAID HE HAD THAT ONE OFF A KING. I NEVER BELIEVED A WORD OF IT. THEN I LOOKED AT THE LOCK.",
    },
    mobArmor: 0.15,
    aliveMult: 7.2,
    landingAliveMin: 0.35,
    // No `activeSpawnerCap`: JESUS lights every spawn point in range at once —
    // the "abandon all hope" horde has no proximity mercy.
    // The fastest refill on the ladder — a kill is replaced almost at once.
    spawnerRespawnMult: 0.45,
    menaceMult: 6.0,
    menaceDecayMult: 0.5,
    menaceEffectMult: 1.5,
    // No `menaceStageCap`: JESUS stays UNCAPPED — the horde evolves without a
    // roof, matching the "abandon all hope" promise.
    xpBonus: 0.38,
    dropChanceBonus: 0.1,
    // A step below nightmare, then the extra −10% squeeze: 0.855 × 0.9.
    medkitDropMult: 0.77,
    armorDropMult: 0.77,
    powerupDropMult: 0.77,
    // No scrolls at all on JESUS: every level is earned kill by kill.
    scrollDropMult: 0,
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
    mobHpMult: ladderMobHp("jesus"),
    staminaDrainMult: ladderStaminaDrain("jesus"),
    staminaRefillSec: ladderStaminaRefill("jesus"),
    staminaEmptyLockSec: ladderStaminaEmptyLock("jesus"),
    playerDodgeMult: 0.7,
    playerMissMult: 1.4,
    enemyDodgeMult: 1.4,
    asteroidDamageFrac: 0.75,
    sandstormDamageFrac: 0.4,
    stampedeDamageFrac: 0.4,
    stampedeTelegraphMult: 0.4,
    // The road hits back like a wall — three people to the tonne and every
    // other car a skip lorry. Holding the throttle down through the crowd ends
    // the leg, every time; the way to GOODCO is the gaps.
    drive: {
      pedestrianMassMult: 3,
      trafficMassMult: 5,
      trafficDensity: 1.5,
      // The whole dial, which nothing below this rung is trusted with.
      topSpeedMph: 174,
    },
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
 * same hero-level band; the only difference is how much help each gives (easy
 * the most, hard the least) and a touch of farm headroom — MEDIUM and HARD carry
 * XP caps two levels over EASY's (see `XP_CAP`), so those lanes can grind a level
 * or two before nightmare. Beating ANY one of them opens the gated tier
 * (nightmare).
 */
export const STARTING_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/**
 * Unlock graph for the difficulty ladder: a rung opens once ANY difficulty in
 * its prerequisite list is beaten. The three starting lanes have no prereqs
 * (always open); NIGHTMARE opens on any starting lane beaten; JESUS opens on
 * NIGHTMARE beaten. This replaces the old strict five-rung chain (each rung
 * needing the one before it). Consumed by the app's progression gate
 * (`isDifficultyUnlocked` in pwa `characters.ts`).
 */
export const DIFFICULTY_UNLOCK_PREREQS: Record<Difficulty, Difficulty[]> = {
  easy: [],
  medium: [],
  hard: [],
  nightmare: [...STARTING_DIFFICULTIES],
  jesus: ["nightmare"],
};

// Active registry the accessor reads (defaults to the shipped ladder;
// tests swap in fixtures via `registerDefs`). See engine/index.ts.
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
 * A spawn point's CONCURRENT-ALIVE CAP through a difficulty's `aliveMult` — how
 * many of one point's own members may stand on the field at once (see
 * `SPAWNERS.maxAlive`). Never rounds a point that may hold anyone down to zero,
 * so a gentle rung thins the crowd rather than switching a spawner off.
 *
 * Hellgates are NOT scaled through here: their cap is re-derived every tick from
 * the live rampage stage (`hellgateTuning`) and bounded by their own global
 * budget, so the rung's thickness is already priced into the meter.
 */
export function scaledAliveCap(cap: number, difficulty: Difficulty): number {
  if (cap <= 0) return 0;
  return Math.max(1, Math.round(cap * difficultyDef(difficulty).aliveMult));
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

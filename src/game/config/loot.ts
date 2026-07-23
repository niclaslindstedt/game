// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The loot economy: the drop ladder, the D2 rarity roll, make quality,
// named uniques' odds, the world-drop channel, and the mercy-drop ropes.

import { ITEM_QUALITY, ITEM_RARITY } from "../../generated/items.ts";
import type { Difficulty } from "../types/index.ts";

/**
 * UNIQUE items — hand-authored named drops (see `defs/uniques.ts`). Their
 * bonuses are fixed, but each drop rolls a small ±band on the BASE damage
 * (weapons) / armor so two copies differ and a better-rolled one is worth
 * chasing; the fixed bonuses are identical on every copy.
 */
export const UNIQUE = {
  /** Half-width of the base-stat roll: a ±10% band around the base value. */
  baseRollBand: 0.1,
  /**
   * Hard ceiling on any SCALING percentage bonus (`statPct` / `maxHpPct`) an
   * item can carry — clamped at mint (`mintUnique`), whatever the catalog
   * says. Scaling bonuses multiply the hero's own grown total, so even small
   * percentages compound into the strongest affixes in the game; 2% is the
   * most any one piece may pay. Deliberately EXCLUDES `damagePct` (a weapon's
   * flat +X% damage) and armor — those scale a single surface and stay
   * catalog-authored.
   */
  scalingPctCap: 0.02,
  /**
   * Boss unique drop chance, scaled by how close the boss's monster level is to
   * the item's ilvl: `dropChance × mlvl/ilvl`, capped at `dropChanceCap`. At the
   * item's home difficulty (mlvl ≈ ilvl) this lands at ~`dropChance`; a deeper
   * (over-ilvl) boss pays a little more, up to the cap. NOT guaranteed — boss
   * runs are the endgame.
   */
  dropChance: 0.05,
  dropChanceCap: 0.1,
  /** Default per-item `rarity` weight for a unique that doesn't set its own —
   * the relative odds it's the chosen named item once a rarity roll lands its
   * tier + slot (see `pickUniqueForDrop`). A flat default so the catalog works
   * un-annotated; hand-weight individual chase items DOWN from here. */
  defaultRarity: 100,
  /**
   * STATS DETERMINE RARITY (legendaries only): the selection weight in
   * `pickUniqueForDrop` falls off as a POWER LAW of the item's priced bonus
   * budget — `weight × (rarityBudgetRef / budget)^rarityBudgetExp` once the
   * budget exceeds the reference. Legendaries are deliberately authored
   * across a VAST power range (they're exempt from the unique budget cap —
   * power is paid for in ODDS instead): a reference-budget legendary keeps
   * its authored/default weight, twice the reference is 2^exp (16×) rarer,
   * five times is ~600× rarer — the god-rolls are astronomically rare by
   * construction. Mechanical, so authoring power IS authoring odds; an
   * explicit `rarity` still multiplies on top.
   */
  rarityBudgetRef: 40,
  rarityBudgetExp: 4,
} as const;

/**
 * WORLD-DROP uniques — level-locked named drops that any enemy on their home
 * level can drop (see `defs/uniques.ts` WORLD_UNIQUES, wired per level in
 * `LevelDef.loot.worldUniques`). Unlike boss uniques (which only a specific
 * boss drops), these rain from the whole roster, but at RANK-scaled odds so a
 * boss run is by far the efficient farm: a trash minion is a lottery ticket, an
 * elite ten times likelier, the boss forty. `minPlayerLevel` gates the whole
 * table shut until the hero out-levels a first campaign pass — PER RUNG, since a
 * later rung's relics sit behind a later, higher first-pass level. A full clear
 * of the critical path (one bottom lane → nightmare → jesus; see
 * `leveling-curve.mjs --by-level --clear-share 1`) leaves the hero at ~36 after a
 * bottom lane, ~53 after nightmare, and ~67 after jesus, so each gate sits a
 * couple levels under its rung's end — the relics can only be farmed by
 * RETURNING for boss runs once the difficulty is beaten.
 * Rolled per unique, per kill, on `maybeDropWorldUnique`.
 */
// Calibrated (with the folded rarity roll and the boss `uniquesByDifficulty`
// tables) so a JESUS farm run drops ≈ ONE named unique — see
// `scripts/drop-rate.mjs`. The relic-dense levels (the rift, and the bunker
// that relists the whole catalog) run a little hotter by design; a typical
// level lands near one. Trimmed from 0.00015: three unique channels stacked
// to ~9 uniques a bunker run, far past "one per run".
const WORLD_DROP_MINION_CHANCE = 0.00004;
// The explicit set-piece boost, as MULTIPLES of the minion base — the one
// place to retune "how much better a set piece is" (also live-scaled by the
// runtime BALANCE › UNIQUE DROPS knob). Elite ×100 → 0.4%, boss ×200 → 0.8%.
const WORLD_DROP_ELITE_MULT = 100;
const WORLD_DROP_BOSS_MULT = 200;

export const WORLD_DROP = {
  /**
   * Per-unique drop chance by the falling enemy's ROLE — the level-locked relic
   * channel, kept ALONGSIDE the folded rarity roll as the explicit set-piece
   * boost. A MINION is a lottery ticket (0.015%, still gated to return-farming);
   * ELITES and BOSSES are magnitudes better (×100 / ×200 the minion base) AND
   * drop during the normal campaign (see the role gate in `maybeDropWorldUnique`),
   * so a set-piece kill is a reliable relic source the first time through. Change
   * the base or the two multipliers above to move the whole channel at once.
   */
  chanceByRole: {
    minion: WORLD_DROP_MINION_CHANCE,
    elite: WORLD_DROP_MINION_CHANCE * WORLD_DROP_ELITE_MULT, // 1.5%
    boss: WORLD_DROP_MINION_CHANCE * WORLD_DROP_BOSS_MULT, //   3%
  },
  /** The MINION-only return-farm gate: trash relics stay shut until the hero
   * reaches this level ON THAT RUNG — sized a few levels above where a first
   * pass of the difficulty ends (bottom lane ~29, nightmare ~49, jesus 60). The
   * three bottom lanes are parallel entry points over the same level band, so
   * they share one gate. ELITES and BOSSES ignore this gate (they drop during
   * the campaign); it holds back only the minion lottery. */
  minPlayerLevel: {
    easy: 34,
    medium: 34,
    hard: 34,
    nightmare: 54,
    jesus: 67,
  } as Record<Difficulty, number>,
} as const;

/** Loot rules that hold on every level (pools and tier odds are per level). */
export const LOOT = {
  /**
   * STAGE 1 — the drop gate (D2's NoDrop, inverted): the base chance a regular
   * monster drops ANYTHING at all (LUCK adds to it). `1 − dropChance ≈ 91%` is
   * the NoDrop weight. THE one drop-rate lever — raise it for a richer rain,
   * lower it for a leaner one; the runtime BALANCE › DROP RATE knob scales it
   * live. Tuned for horde scale: hundreds of kills per run, a drop every ~11 of
   * them, the steady rain of upgrades that keeps the player ahead of the ramp.
   */
  dropChance: 0.09,
  /**
   * The share of drops that is a screen-nuke pickup — checked first, before
   * the ladder below, so it stays rare no matter how the rest is tuned.
   */
  nukeShare: 0.012,
  /** Of the remaining drops, the share that is equipment. */
  equipmentShare: 0.25,
  /** …the share that is a time-limited ability pickup (kept lean so the
   * powerup rain never buries the field — the dock only banks three). */
  abilityShare: 0.06,
  /**
   * …the share that is a medkit (banked on touch, spent on the player's call).
   * A generous slice: healing is meant to be a reliable resource the hero
   * finds often and spends deliberately, not a lucky drop he hoards. Paired
   * with the percentage-of-max heals (config MEDKIT), a found kit is always a
   * real top-up. The per-rung `medkitDropMult` and low-health MERCY boost still
   * thin or fatten this slice around the baseline.
   */
  medkitShare: 0.22,
  /**
   * …the share that is a weapon repair kit. A generous slice, like the medkit
   * one: a worn weapon that snaps strands the hero on the sidearm (or sends him
   * running to the merchant), so mending kits are meant to turn up often enough
   * to keep a good weapon alive through a run. Uniform across rungs (no
   * `repairDropMult`) — since medkits thin up the ladder but this doesn't, the
   * repair rain actually stands out MORE on the hard rungs, exactly where a
   * broken weapon hurts most. It sits below the drink/arrow bands on the drop
   * ladder, so widening it just eats the "nothing drops" tail — every other
   * resource's drop rate is untouched.
   */
  repairShare: 0.18,
  /**
   * …the share that is an ENERGY DRINK (resets the sprint pool on touch). Kept
   * lean — a drink is only worth anything to a winded hero, and the gentle
   * rungs rain them far harder through the stamina-empty MERCY DROP (see
   * `staminaDrinkChance`), so the baseline slice is just a chance for one to
   * turn up in the ordinary rain.
   */
  drinkShare: 0.05,
  /**
   * …the share that is a BLUE GATORADE (a MANA POTION — refills the spell pool
   * on the player's call). Sits beside the energy drink on the ladder and, like
   * it, is only worth anything to a caster who has actually spent mana, so the
   * baseline slice is lean; a low-mana MERCY DROP (see `manaEmptyChance`) rains
   * them harder when a spellcaster is genuinely tapped out.
   */
  manaShare: 0.05,
  /**
   * …the share that is a GOLDEN XP ARROW (grants a share of the level bar —
   * see LEVELING.arrowXpShare). Unlike the medkit/repair/drink slices, this
   * is the tail of the ladder rather than the leftover: whatever this slice
   * (thinned further by a difficulty's `arrowDropMult`) leaves unfilled simply
   * doesn't drop, so arrows are a rare prize rather than the ladder's filler.
   * At MEDIUM (mult 1) this lands ~one arrow per 75 kills
   * (`LOOT.dropChance × arrowShare`); harder rungs thin it toward zero and JESUS
   * (mult 0) drops none at all. A found level, not a steady drip.
   */
  arrowShare: 0.15,
  /**
   * Clearing every regular monster on a level is guaranteed to have dropped
   * at least this much equipment (a pity roll forces the tail end; boss
   * drops come on top of it).
   */
  minEquipmentPerLevel: 2,
  /** Tier-chance bonus on the trophy the last regular monster surrenders. */
  allClearTierBonus: 0.35,
  /**
   * The MONSTER LEVEL each tier unlocks at — a tier can never drop off a mob
   * below its gate, whatever the chances say. The one dial for "when does the
   * campaign start paying blues/yellows/golds": magic from mlvl 5, rare from
   * 10, unique from 15, legendary from 40. (Monster level = player level +
   * the difficulty's `mobLevelOffset`, so harder rungs reach each tier
   * earlier in the story.) TRASH is gated at 1 — it never rolls anyway (only
   * scripted drops mint it), the entry just keeps the tier table total.
   */
  // AUTHORED per tier as `unlockMlvl` in content/item_rarity.yaml — tweak it
  // there. (SET shares the unique gate; both are authored boss drops, so
  // `set` is absent from TIER_ROLL_ORDER and its gate only guards the
  // authored-drop paths that consult it.)
  tierUnlockMlvl: ITEM_RARITY.unlockMlvl,
  /**
   * BASE-LEVEL drop floor: a base whose `levelReq` is more than this many
   * levels under the killer's monster level is retired from the drop pool, so a
   * high mob stops dropping low-tier bases (a weak base with affixes on it is
   * still a weak item). Kept as a WINDOW, not a hard match, so a band of bases
   * still drops for variety; below it the whole eligible pool stands (the early
   * game, and as a fallback when nothing sits in the band). D2 area-level
   * flooring — the base scales with where you kill, the affixes with the ilvl.
   */
  dropLevelWindow: 15,
  /**
   * NAMED-ITEM drop floor (D2 area-level flooring for uniques/legendaries/
   * artifacts): a named item whose `ilvl` is more than this many levels under
   * the killer's LOOT LEVEL is retired from the `pickUniqueForDrop` pool, so a
   * cap-level (99) farm stops coughing up the campaign's low-ilvl relics —
   * "level-60 crap" — and pays out only near-level gear (~ilvl 85+ at level
   * 99). This is how a named drop's item level DRAGS UP as the hero levels: the
   * eligible band slides with `lootLevel`, so you always find gear around your
   * own level, and the low-tier uniques recede as you outgrow them. Kept as a
   * WINDOW so a band of ilvls stays live; if it would empty a slot's pool the
   * roll simply downgrades to a rare (never a dead drop). The equip CEILING
   * (base `levelReq ≤ lootLevel`) still holds on top. */
  namedIlvlWindow: 15,
  /**
   * STAGE 2 — the D2 RARITY ROLL. Each tier's chance is Diablo 2's shape:
   * a BASE chance at the tier's own qlvl (the `tierUnlockMlvl` gate) plus a
   * SLOPE that sweetens it the deeper OVER that gate the drop rolls — a
   * higher-level kill rolls rarer tiers more often (D2: `ilvl − qlvl` improves
   * rarity). MAGIC FIND then scales it (see `mfSaturation`). The difficulty's
   * `tierChanceBonus`, menace evolution, and per-enemy bonuses still add to the
   * base. Checked best-first in `rollTier`.
   *
   * Unlike the old ladder, unique/legendary are NON-ZERO: named items now fall
   * out of the rarity roll (the D2 way — `rollTier` lands the tier, then
   * `pickUniqueForDrop` chooses WHICH named item by its per-item `rarity`
   * weight). The separate boss/world channels still layer on top as the
   * explicit set-piece boost. The curve is deliberately D2-steep: rarer high
   * tiers, MF carrying the difference.
   */
  // AUTHORED per tier as `rollChance` in content/item_rarity.yaml — the
  // chase odds are calibrated with `node scripts/drop-rate.mjs`; retune in
  // the YAML, not by feel, and re-run the probe after any change.
  rarityBase: ITEM_RARITY.rarityBase,
  /** How much each mlvl OVER a tier's qlvl gate adds to its base chance (the
   * D2 `(ilvl−qlvl)/divisor` term, as a positive slope). Higher tiers climb
   * slower, so depth favors rares over legendaries. The chase tiers
   * (legendary/artifact) climb very slowly — the deep endgame reaches them,
   * but they never become common. AUTHORED per tier as `rollSlope` in
   * content/item_rarity.yaml. */
  raritySlope: ITEM_RARITY.raritySlope,
  /**
   * MAGIC FIND saturation ceiling per tier — the MOST that MF can multiply a
   * tier's rarity chance by, approached asymptotically (`1 + cap·mf/(cap+mf)`).
   * MAGIC is uncapped (linear in MF); the top tiers saturate LOWER, so stacking
   * LUCK/aura can't make legendaries common — D2's rule that MF is strong early
   * and gives diminishing returns on the best drops.
   */
  // AUTHORED per tier as `mfSaturation` in content/item_rarity.yaml.
  mfSaturation: ITEM_RARITY.mfSaturation,
  /** The EXPLICIT set-piece boost: an additive bonus to the named-tier rarity
   * BASE when the killer is an elite or a boss (RARE/UNIQUE mobs share the
   * elite bonus — see `rollTier`'s `mobRarity`), so those special fights are a
   * far better legendary/artifact farm than trash — a boss run is the efficient
   * chase, but it still takes a long grind. */
  // AUTHORED per tier as `eliteBonus` / `bossBonus` in
  // content/item_rarity.yaml.
  eliteRarityBonus: ITEM_RARITY.eliteRarityBonus,
  bossRarityBonus: ITEM_RARITY.bossRarityBonus,
  /**
   * The PLAIN-MINION named-tier PENALTY: a rank-and-file minion's rolled
   * chance at a NAMED tier (unique/legendary/artifact) is multiplied by this,
   * so trash CAN still cough up a named item but at a fraction of the odds a
   * rare/unique/elite/boss kill carries (which skip the penalty AND add the
   * set-piece bonus above). Combined with the fact that trash also runs a few
   * levels UNDER the horde (the spawn band, lower ilvl), farming regular mobs
   * for chase gear just doesn't pay — the special fights are the loot. The
   * everyday magic/rare rain is untouched (this hits named tiers only), so
   * ordinary kills stay rewarding. 0 would slam the door entirely; keep it a
   * sliver so a lucky trash drop is still possible. AUTHORED in
   * content/item_rarity.yaml.
   */
  minionNamedMult: ITEM_RARITY.minionNamedMult,
  /** Ceiling on any single tier's rolled chance — keeps deep-campaign magic
   * from reaching 100% so PLAIN whites (and their make-quality roll) still
   * drop. Applied after slope, difficulty, role, and Magic Find. AUTHORED in
   * content/item_rarity.yaml. */
  rarityChanceMax: ITEM_RARITY.rarityChanceMax,
  /**
   * How far below the killer's monster level a dropped item's LEVEL lands:
   * index i is the relative weight of dropping exactly i levels short, so
   * `[1, 2, 3, 4]` makes a −3 item four times likelier than a full-level one.
   * Longer/shorter arrays widen/narrow the band. Item level floors at 1.
   */
  ilvlDeltaWeights: [1, 2, 3, 4],
  /**
   * The same weights for the named tiers' RAW roll (unique/legendary/artifact
   * fold into a hand-authored item whose ilvl OVERRIDES this, so it is moot —
   * kept only so the raw roll has a value): 0–1 below the mob, equal odds.
   */
  ilvlDeltaWeightsRare: [1, 1],
  /**
   * ROLLED-tier UPWARD ilvl margin over the loot level — the D2 rule that the
   * rarer a find, the more its power punches above the mob that dropped it
   * (magic a hair over, rare a clear step over, and the hand-authored
   * unique/legendary/artifact tiers further still via their own ilvls). Index
   * `i` weights an offset of `base + i`, low end likeliest, so the margin tilts
   * toward its floor. MAGIC lands loot+0..2, RARE loot+3..5. (WHITE/regular
   * items still roll AT or just under loot via `ilvlDeltaWeights`, so the ladder
   * reads regular ≤ magic < rare < unique.)
   */
  ilvlMarginMagic: { base: 0, weights: [3, 2, 1] },
  ilvlMarginRare: { base: 3, weights: [3, 2, 1] },
  /**
   * The carry bag's floor — its size at zero STRENGTH. STRENGTH grows it from
   * here (`STATS.bagSlotsPerStr`), so the opening bag is deliberately tight
   * and a STR build is what earns the room to hoard (see `inventoryCapacity`).
   */
  baseInventorySize: 3,
  /**
   * Minimum gap between "bags are full" nudges. Loot the player can't pick up
   * stays on the ground, so `stepItems` re-hits the same overlap every frame he
   * stands on it — this throttles the `pickupBlocked` cue (the hero's thought,
   * the bag-button pulse) so it fires once, not once per tick.
   */
  bagFullHintCooldownMs: 2500,
} as const;

/**
 * MAKE QUALITY — the craftsmanship axis every PLAIN (regular-tier) weapon
 * and armor drop rolls at mint (see `rollEquipment`): BROKEN and CRUDE work
 * below the authored numbers, NORMAL at them, SUPERIOR and PERFECT above.
 *
 * Each quality is a RANGE, not a single number (D2's superior/low-quality
 * rule): a drop rolls a specific base-value multiplier inside its quality's
 * `ranges` band, stamped on the instance (`Equipment.qualityRoll`) and frozen
 * for life. The bands OVERLAP between adjacent qualities and climb with the
 * rank, so a good CRUDE can out-swing a poor NORMAL, yet a PERFECT always
 * clears a NORMAL — and two SUPERIOR copies of a base carry different damage.
 * `mults` is the MIDPOINT of each band: the representative value a legacy
 * instance (minted before the range roll) or a 0.5 roll reads, so the bands
 * are symmetric around it and the economy's centre of mass is unchanged.
 *
 * The roll's ODDS shift with the killer's MONSTER LEVEL — `weightsLow` are the
 * relative odds at mlvl 1, `weightsHigh` at `highMlvl`, lerped linearly
 * between, so the level-1 rank and file drop mostly shabby make and the deep
 * campaign pays out superior and perfect work. Craftsmanship and magic are
 * exclusive (the D2 rule): MAGIC-or-better finds, charms, and bags never roll
 * one — they are always normal make and carry no range roll.
 */
export const QUALITY = {
  // Every knob below is AUTHORED in content/item_quality.yaml — the one
  // place to tweak the make-quality axis (per-quality `mult`, `range`,
  // `weightLow`/`weightHigh`, and the `highMlvl` lerp anchor); the YAML
  // carries each knob's full documentation.
  mults: ITEM_QUALITY.mults,
  /**
   * The roll band each make quality drops within — a specific multiplier is
   * drawn uniformly inside it at mint (see `rollQualityMult`). Symmetric around
   * `mults` (the midpoint) and OVERLAPPING between neighbours, so make quality
   * reads as a soft, D2-style gradient rather than five fixed steps. Only
   * adjacent bands overlap: a PERFECT never rolls under a NORMAL's ceiling.
   */
  ranges: ITEM_QUALITY.ranges,
  /** Relative quality odds off a monster-level-1 kill… */
  weightsLow: ITEM_QUALITY.weightsLow,
  /** …and off a monster at/above `highMlvl`; lerped linearly between. */
  weightsHigh: ITEM_QUALITY.weightsHigh,
  /** The monster level at which the odds reach `weightsHigh`. */
  highMlvl: ITEM_QUALITY.highMlvl,
} as const;

/**
 * MERCY DROPS — the game throws a drowning player a rope, harder the gentler
 * the rung, and the fight eases without ever becoming un-losable. Four
 * independent signals feed it: a PACKED FIELD (crowd of on-screen mobs), LOW
 * HEALTH, a near-BROKEN WEAPON, and an EMPTY SPRINT POOL (stamina bone-dry).
 * The first three turn into a 0→1 "desperation" as they worsen — zero at
 * their `*Start` mark, one at their `*Full` mark, linear between (see
 * `desperationRamp`); the stamina rope instead ramps over TIME the pool sits
 * empty (see `staminaDrinkChance`). This namespace owns the RAMP SHAPES
 * (where help begins and maxes); each rung owns its STRENGTH via
 * `DifficultyDef.mercy` (`MercyTuning`), TAPERING geometrically down the
 * ladder (~×0.4 per rung: easy → medium → a whisper on hard → a ghost on
 * nightmare → absolute zero on JESUS). Tune the two together: shape here,
 * per-rung force on the ladder.
 */
export const MERCY = {
  /** On-screen minions before a packed field starts coughing up screen-nukes,
   * and where that per-kill chance tops out — the bomb-in-a-swarm rescue scales
   * linearly between them, capped by the rung's `mercy.crowdBombChanceMax`. */
  crowdBombThreshold: 20,
  crowdBombFull: 45,
  /** HP fraction below which life-saving gear (medkits, plated suits) starts
   * raining harder, and where the boost maxes — the lower the bar, the more of
   * the rung's `mercy.medkitBonus` / `mercy.armorBonus` applies. */
  lowHealthStart: 0.6,
  lowHealthFull: 0.15,
  /** Equipped-weapon durability fraction below which repair kits start dropping
   * more often, and where that boost maxes — scaled by the rung's
   * `mercy.repairBonus`. The unbreakable sidearm never triggers it. */
  lowDurabilityStart: 0.5,
  lowDurabilityFull: 0.1,
  /**
   * How long (ms) the sprint pool must sit BONE-DRY (exactly empty, not merely
   * low) before the stamina-drink drop reaches its full per-kill chance. The
   * boost ramps linearly from zero the instant stamina hits empty up to the
   * rung's `mercy.staminaDrinkChanceMax` at this mark, and resets the moment
   * any stamina returns — so a stranded hero is thrown an energy drink the
   * longer he stays winded, capped at 15% (easy) / 10% (medium). See
   * `staminaDrinkChance` and `GameState.staminaEmptyMs`.
   */
  staminaEmptyDrinkRampMs: 6000,
  /**
   * THE LOW-MANA ROPE — the blue-gatorade twin of the stamina bailout, but
   * keyed on the POOL FRACTION (mana has no bone-dry timer): a CASTER (a hero
   * with an INT-sized pool past `MANA.base`) whose mana sits at or below
   * `lowManaFraction` of the max has this flat per-kill chance to be thrown a
   * mana potion, so a tapped-out mage isn't stranded unable to cast. Gated by
   * the shared one-rope-at-a-time rule (`mercyRescueWaiting`). See
   * `manaDrinkChance`.
   */
  lowManaFraction: 0.15,
  lowManaDropChance: 0.06,
  /**
   * ONE ROPE AT A TIME — how near (world px) an un-collected rescue pickup
   * must lie for its mercy signal to hold fire. While the medkit, repair kit,
   * drink, screen-nuke, or plated suit a signal already threw is still waiting
   * within this radius, that signal drops nothing more (see
   * `mercyRescueWaiting`) — a hero who parks at low health is not buried under
   * medkits he never picks up. Matches `ENEMY_AI.nearRadius` (the "on screen"
   * yardstick) so a rescue counts as waiting exactly while the player can see
   * it; one left behind out of view stops suppressing, and the rope comes
   * again.
   */
  rescueRadius: 340,
  /**
   * THE ANGEL — how a mercy drop makes its entrance. Rather than blinking onto
   * the ground, a rescue rolled by a mercy path (the crowd-bomb and empty-sprint
   * bailouts, and the desperation-boosted medkit/repair) is flown down by a
   * guardian angel that swoops in from above, cradles the gift, and releases it
   * over the spot the mob died. `angelDeliverMs` is the WHOLE performance —
   * descent, release, and the short fall to the ground — kept under two seconds
   * so a drowning player's lifeline never dawdles. The pickup is uncollectable
   * (and magnet-proof) for exactly this long, then lands and behaves like any
   * drop. Only the renderer knows it is an "angel"; the engine just marks the
   * item's `deliverMs` and counts it down (see `stepItems`, `dropMinionLoot`).
   */
  angelDeliverMs: 1400,
} as const;

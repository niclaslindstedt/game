// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Physical mitigation on both sides of a blow: the horde's level-scaled
// armor, the hero's worn-armor reduction curve, and the armor materials.

import type { ArmorType, Difficulty, StatName } from "../types/index.ts";

/**
 * MOB ARMOR — the fraction of a PHYSICAL blow (melee/ranged) the horde shrugs
 * off (magic ignores it). It RISES STEADILY with the mob's level, like hp: a
 * LEVEL base that ramps linearly from ~0 at level 1 to `maxLevelReduction` (35%)
 * at `LEVELING.maxLevel`, PLUS the difficulty's flat bonus
 * (`DifficultyDef.mobArmor` — easy 0, medium 2%, hard 5%, nightmare 10%, jesus
 * 15%) stacked on top. The two are tuned so a JESUS mob at the cap lands at 50%
 * (35% level + 15% rung), with the bottom rungs spread below it (easy 35% …), so
 * the jump between rungs is felt and the armored endgame favours magic builds.
 * Realized in `mobArmorReduction`/`mobArmorMult` (loot.ts) off the mob's LEVEL
 * (so a difficulty's mob-level cap also caps its armor), clamped below full
 * immunity by `maxReduction`. A future ARMOR-PIERCING item stat subtracts here.
 */
export const MOB_ARMOR = {
  /** Physical reduction a mob at `LEVELING.maxLevel` reaches from level alone,
   * before any difficulty bonus — the top of the linear per-level ramp. Tuned
   * with jesus's +15% bonus to land the top rung at 50%. */
  maxLevelReduction: 0.35,
  /** Hard ceiling on the total reduction (level ramp + difficulty bonus + …),
   * so armor never fully negates a physical blow. */
  maxReduction: 0.9,
} as const;

/**
 * Armor — the D2/WoW-shaped physical mitigation. Every worn armor piece
 * (head/chest/legs/feet) carries flat armor points; the ACTIVE pieces sum
 * (a broken piece counts zero — see `isArmorBroken`), and the total turns
 * into a damage reduction AGAINST THE ATTACKER'S LEVEL:
 *
 *   reduction = armor / (armor + kBase + kPerLevel × attackerLevel)
 *
 * capped at `maxReduction` (the classic 75% wall). A full set of
 * level-appropriate armor lands around a third off every physical hit; the
 * same set decays as the horde levels past it, which is what keeps armor
 * drops interesting all campaign. `armorPerIlvl` is the drop-side growth:
 * a base's authored armor is its value AT ITS OWN levelReq, and a rolled
 * instance grows by this fraction per item level above that (so deep finds
 * of an old base stay wearable without out-arming native pools).
 */
export const ARMOR = {
  kBase: 40,
  kPerLevel: 12,
  // Damage reduction saturates through `armor/(armor+k)` toward this ceiling.
  // Raised to 0.90 (from 0.75): the top band is deliberately expensive — `k`
  // grows with the attacker's level, so reaching ~0.85–0.90 at the endgame
  // takes a LOT of armor (deep artifact stacking), while 0.85→0.90 is a further
  // 33% cut in damage taken. It never reaches 1.0.
  maxReduction: 0.9,
  armorPerIlvl: 0.06,
} as const;

/**
 * ARMOR MATERIALS — the D2/WoW material classes (see `ArmorType`), the axis
 * that turns the same slot into a light caster robe or a heavy bruiser plate.
 * A base's authored `armor` is its CLOTH-equivalent value (the slot curve the
 * item-forge prices); the material's `armorMult` scales the WORN value
 * (`armorValueOf`), so a mail chest protects far more than the cloth one of the
 * same slot/level. That extra plating is what lets a melee hero stand in the
 * onslaught the design wants (`mail`/`plate`), while a caster in `cloth` stays
 * fragile and kites.
 *
 * Each material also demands STRENGTH to WEAR it — `strReqFraction` is the share
 * of the hero's trainable points it wants in STR, exactly like a weapon's
 * `STAT_REQ.investFraction` (0.4). CLOTH asks nothing (any build wears it);
 * LEATHER a little; MAIL and PLATE a LOT, so heavy armor is a melee-only lane —
 * a caster or archer simply cannot heft it (see `statRequirement`). Worn `+STR`
 * gear (which mail/plate itself rolls, via `statWeights`) counts toward the
 * gate, so a bruiser stacking heavy armor naturally meets the next piece's req.
 *
 * `statWeights` biases which stat a rolled `+stat` affix picks (`rollAffix`):
 * CLOTH leans INTELLIGENCE (a mage's robe) but can still roll DEX/STR; LEATHER
 * leans DEXTERITY (a ranger's kit) and can roll STR; MAIL/PLATE lean STRENGTH
 * but still roll DEX/INT (a bruiser leans on those too). The weights are
 * relative — a bigger number just means that stat rolls more often.
 *
 * `minDifficulty` (PLATE only) gates the material to the hardest rungs: plate
 * bases are filtered out of the random drop pool below it (`rollEquipment`), so
 * the top armor tier is a NIGHTMARE-and-up chase.
 */
export const ARMOR_TYPES: Record<
  ArmorType,
  {
    /** Worn-armor multiplier over the base's cloth-equivalent authored value. */
    armorMult: number;
    /** Share of trainable points demanded in STRENGTH to wear it (0 = ungated,
     * mirrors weapon `STAT_REQ.investFraction`). */
    strReqFraction: number;
    /** Relative odds each stat is the one a rolled `+stat` affix grants. */
    statWeights: Record<StatName, number>;
    /** Lowest difficulty this material may randomly DROP on (index-compared in
     * `rollEquipment`); omitted = drops on every rung. */
    minDifficulty?: Difficulty;
  }
> = {
  cloth: {
    armorMult: 1,
    strReqFraction: 0,
    statWeights: {
      intelligence: 6,
      // CLOTH is the caster material — SPIRIT (mana/regen) leans here alongside
      // INT so a robe rolls the mage's support stat, second only to raw INT.
      spirit: 4,
      dexterity: 3,
      strength: 2,
      stamina: 2,
      speed: 2,
      luck: 1,
    },
  },
  leather: {
    armorMult: 1.15,
    strReqFraction: 0.25,
    statWeights: {
      dexterity: 6,
      strength: 3,
      intelligence: 2,
      stamina: 2,
      speed: 2,
      spirit: 1,
      luck: 1,
    },
  },
  mail: {
    armorMult: 1.6,
    strReqFraction: 0.6,
    statWeights: {
      strength: 6,
      dexterity: 2,
      intelligence: 2,
      stamina: 3,
      speed: 1,
      spirit: 1,
      luck: 1,
    },
  },
  plate: {
    armorMult: 2.2,
    strReqFraction: 0.85,
    statWeights: {
      strength: 7,
      dexterity: 2,
      intelligence: 2,
      stamina: 3,
      speed: 1,
      spirit: 1,
      luck: 0,
    },
    minDifficulty: "nightmare",
  },
} as const;

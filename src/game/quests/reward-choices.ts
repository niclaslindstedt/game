// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT AN ERRAND IS PAYING, DECIDED BEFORE THE PLAYER SAYS YES.
//
// An errand used to promise "AN ITEM" and roll it at the handover, which is two
// problems wearing one sentence. The player could not tell whether the job was
// worth doing — the only honest answer to "what do I get" was "something" — and
// the piece that arrived had no relationship to the build they were playing, so
// most quest rewards were vendor trash the moment they landed.
//
// So the gear is MINTED ONCE, when the conversation first opens, and shown in
// full: real bases, real tiers, real rolled affixes, drawn with the same item
// card the bag draws. Three rules hold it up.
//
// 1. **IT IS THE ORDINARY DROP PIPELINE, CALLED THREE TIMES.** Every piece is a
//    `rollEquipment` off the level's own pool, at the same tier and quality, so
//    a quest reward cannot drift from the loot economy the way a bespoke mint
//    would (see rewards.ts, which has said this since it was one item).
//
// 2. **THE THREE ARE ONE PER CLASS, AND THE GAME ALREADY HAD THE THREE.** A
//    weapon reward offers a MELEE, a RANGED and a MAGIC base (`WeaponClass`);
//    an armor reward offers MAIL, LEATHER and CLOTH — and those materials
//    already lean STRENGTH, DEXTERITY and INTELLIGENCE in their own
//    `statWeights` (config `ARMOR_TYPES`), so the class flavour of the affixes
//    falls out of picking the base and nothing here has to reach into the affix
//    roller. PLATE is deliberately not a lane: it is gated to NIGHTMARE and up,
//    so a lane built on it would be empty for most of the campaign.
//
// 3. **SOMETHING EVERYONE WOULD WANT IS OFFERED ALONE.** A charm or a bag has
//    no class lane — no material, no weapon class, and its affixes roll an even
//    spread — so there is no second version of it to want instead. Three copies
//    of one neutral piece is a choice in the shape of a menu with one dish.
//
// The pick itself lives on the errand (`QuestProgress.rewardPick`) rather than
// here, because it has to survive walking away from the conversation.

import {
  eligibleBases,
  lootLevelFor,
  rollEquipment,
} from "../items/rolling.ts";
import { markIdentified } from "../items/identify.ts";
import { armorTypeOf } from "../items/durability.ts";
import { gearDef, isWeaponDef, weaponDef } from "../defs/equipment.ts";
import { questDef } from "../defs/quests.ts";
import type { ArmorType, Equipment, GameState } from "../types/index.ts";

/**
 * The armor materials that stand for the three build lanes, in the order the
 * offer lists them. Their `statWeights` are what make the affixes lean, so this
 * list IS the class flavour — see rule 2 above for why plate is not here.
 */
const LANE_MATERIALS: readonly ArmorType[] = ["mail", "leather", "cloth"];

/** The three weapon classes, in the same order (melee ≈ STR, ranged ≈ DEX,
 * magic ≈ INT), so a weapon offer and an armor offer read the same way. */
const LANE_WEAPON_CLASSES = ["melee", "ranged", "magic"] as const;

/**
 * The pieces this errand is paying, minting them the first time it is asked.
 * Every later caller — the offer, the quest log, the handover — gets the same
 * array back, which is what makes the promise a promise.
 *
 * Returns an empty array for an errand that pays no rolled gear at all (coins,
 * XP, a named relic and a powerup are not choices — they are simply handed
 * over, so there is nothing to pick between).
 */
export function questRewardChoices(
  state: GameState,
  questId: string,
): Equipment[] {
  const cached = state.questRewards[questId];
  if (cached) return cached;
  const minted = mintChoices(state, questId);
  state.questRewards[questId] = minted;
  return minted;
}

/** The piece this errand will actually hand over — the player's pick, or the
 * top row when they never touched it. Null when the errand pays no gear. */
export function pickedQuestReward(
  state: GameState,
  questId: string,
): Equipment | null {
  const choices = questRewardChoices(state, questId);
  if (choices.length === 0) return null;
  const at = state.quests[questId]?.rewardPick ?? 0;
  return choices[Math.min(Math.max(0, at), choices.length - 1)] ?? null;
}

/**
 * TAKE THAT ONE. The app calls it for a tap on a reward row; it is a plain
 * bookkeeping verb, so it can be pressed at the offer, walked away from, and
 * pressed again at the handover. Returns false for an index that is not on the
 * table, so a stray tap is ignored rather than paying out something else.
 */
export function chooseQuestReward(state: GameState, index: number): boolean {
  const offer = state.questOffer;
  if (!offer?.questId) return false;
  const choices = questRewardChoices(state, offer.questId);
  if (index < 0 || index >= choices.length) return false;
  // The errand may not be accepted yet — the whole point is choosing BEFORE
  // saying yes — so the pick is parked on the offer's own progress row if there
  // is one, and re-applied by `acceptQuest` otherwise.
  const progress = state.quests[offer.questId];
  if (progress) progress.rewardPick = index;
  offer.rewardPick = index;
  return true;
}

/** Mint the choices. Called exactly once per errand per run. */
function mintChoices(state: GameState, questId: string): Equipment[] {
  const loot = questDef(questId).reward?.loot;
  if (!loot || loot.count <= 0) return [];

  // THE ANCHOR ROLL decides what kind of thing this errand pays and how good it
  // is — a real drop off the level's own pool, priced against the hero who did
  // the work exactly as the old single-item payout was. The lane copies below
  // are the same roll wearing a different base.
  const slot =
    loot.slot === "weapon" || loot.slot === "gear" ? loot.slot : undefined;
  // Identified from the moment they exist: the whole point of a reward CHOICE
  // is reading the stats before saying yes, so a veiled offer would be a lie.
  const anchor = markIdentified(
    rollEquipment(state, state.players[0], {
      ...(slot ? { slot } : {}),
      ...(loot.tierBonus ? { tierBonus: loot.tierBonus } : {}),
      mlvl: state.players[0].level,
    }),
  );

  const lanes = laneBases(state, anchor);
  // Nothing to choose between: a neutral piece (rule 3), or a pool too thin to
  // offer a second lane. Either way the anchor stands alone rather than being
  // padded out with copies of itself.
  if (lanes.length < 2) return [anchor];

  // Same tier and same make quality across the row, so the decision is about
  // the BUILD and never about which row happened to roll better.
  return lanes.map((defId) =>
    defId === anchor.defId
      ? anchor
      : markIdentified(
          rollEquipment(state, state.players[0], {
            defId,
            tier: anchor.tier,
            quality: anchor.quality,
            mlvl: state.players[0].level,
          }),
        ),
  );
}

/**
 * One base per class lane, in lane order — or fewer than two when this piece
 * has no lanes to offer. The anchor's own base is kept in its lane so the row
 * the ordinary pipeline picked is genuinely on the table.
 */
function laneBases(state: GameState, anchor: Equipment): string[] {
  const lootLevel = lootLevelFor(state, state.players[0].level);
  if (isWeaponDef(anchor.defId)) {
    const pool = eligibleBases(state, "weapon", lootLevel);
    return LANE_WEAPON_CLASSES.map((weaponClass) => {
      if (weaponDef(anchor.defId).class === weaponClass) return anchor.defId;
      return bestOf(pool.filter((id) => weaponDef(id).class === weaponClass));
    }).filter((id): id is string => id !== null);
  }

  // A charm or a bag has no armor and therefore no material: rule 3.
  if (gearDef(anchor.defId).armor === undefined) return [];

  const pool = eligibleBases(state, "gear", lootLevel).filter(
    (id) => gearDef(id).armor !== undefined,
  );
  const anchorSlot = gearDef(anchor.defId).slot;
  return LANE_MATERIALS.map((material) => {
    if (armorTypeOf(anchor.defId) === material) return anchor.defId;
    const inLane = pool.filter((id) => armorTypeOf(id) === material);
    // Prefer the anchor's own BODY SLOT so the row is a like-for-like class
    // choice (three chestpieces) rather than a shopping list; fall back to any
    // piece of the material when the lane has nothing for that slot.
    const sameSlot = inLane.filter((id) => gearDef(id).slot === anchorSlot);
    return bestOf(sameSlot.length > 0 ? sameSlot : inLane);
  }).filter((id): id is string => id !== null);
}

/**
 * The deepest base in a lane — highest level requirement, ties broken by id so
 * the pick is stable. Deliberately NOT a random draw: this runs once and is
 * then frozen for the run, so an rng draw here would spend one of the seeded
 * loot stream's numbers on a decision the player can see but never re-roll,
 * and two runs of the same seed would stop agreeing about what the errand pays.
 */
function bestOf(ids: readonly string[]): string | null {
  if (ids.length === 0) return null;
  return [...ids].sort((a, b) => {
    const byReq = baseReq(b) - baseReq(a);
    return byReq !== 0 ? byReq : a.localeCompare(b);
  })[0] as string;
}

function baseReq(id: string): number {
  return (isWeaponDef(id) ? weaponDef(id) : gearDef(id)).levelReq ?? 0;
}

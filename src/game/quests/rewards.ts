// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT AN ERRAND PAYS. One function, called once, at the handover.
//
// Every payout rides machinery the game already had — `grantXp`, the purse,
// `rollEquipment`, `mintUnique`, the loot TOSS — for the same reason a boss's
// drop does: a quest reward that minted items down its own path would drift
// from the drop pipeline (its tier ladder, its level requirements, its
// affixes) the first time either changed. A quest is a second CALLER of the
// loot system, never a second loot system.
//
// The one thing that is quest-specific is the XP, and it is specific in order
// to be GENERAL: `xpShare` is a fraction of the hero's own level bar, so the
// same authored 0.3 is a fair payout at level 4 on easy and at level 71 on
// JESUS. See the note at the head of defs/quests.ts.

import type { Vec2 } from "@game/lib/vec.ts";

import { canBankAbility } from "../abilities.ts";
import type { QuestReward } from "../defs/quests.ts";
import { xpToLevelUp } from "../leveling.ts";
import { grantXp } from "../loot.ts";
import {
  addToInventory,
  dropItem,
  grantCleanSlate,
  mintUnique,
  rollEquipment,
} from "../items/index.ts";
import type { Equipment, GameState } from "../types/index.ts";

/** What a payout actually handed over, so the app can list the haul. */
export type QuestPayout = {
  xp: number;
  coins: number;
  items: Equipment[];
  /** CLEAN SLATES handed over — the respec charge (see `Player.cleanSlates`). */
  cleanSlates: number;
};

/**
 * The XP an errand's `xpShare` is worth to THIS hero right now — the share of
 * the bar he is currently standing on. Exported because the offer modal quotes
 * it before the player accepts, and quoting a different number than the
 * handover pays is how a reward stops being trusted.
 */
export function questXpReward(state: GameState, reward?: QuestReward): number {
  if (!reward?.xpShare) return 0;
  return Math.max(
    1,
    Math.round(
      xpToLevelUp(state.players[0].level, state.difficulty) * reward.xpShare,
    ),
  );
}

/**
 * Pay an errand out at `at` (the giver's feet — the loot lands where the
 * conversation happened, not where the hero was standing when he tapped).
 *
 * Bag-full is not an error: a piece that will not fit is THROWN DOWN through
 * the ordinary toss, so a reward can never evaporate because the player was
 * carrying junk. That is the same mercy a boss's drop pays.
 */
export function payQuestReward(
  state: GameState,
  reward: QuestReward | undefined,
  at: Vec2,
): QuestPayout {
  const payout: QuestPayout = { xp: 0, coins: 0, items: [], cleanSlates: 0 };
  if (!reward) return payout;

  const xp = questXpReward(state, reward);
  if (xp > 0) {
    // Through the ordinary grant, so the difficulty's xpBonus, the BALANCE
    // knob and the level-up celebration all behave exactly as on a kill.
    grantXp(state, xp);
    payout.xp = xp;
  }

  if (reward.coins) {
    state.players[0].coins += reward.coins;
    payout.coins = reward.coins;
  }

  // Named relics are handed over WHOLE — a quest reward the author picked is
  // the one payout in the game that is not a roll.
  for (const id of reward.uniques ?? []) {
    payout.items.push(handOver(state, mintUnique(state, id), at));
  }

  if (reward.loot) {
    for (let i = 0; i < reward.loot.count; i++) {
      const equipment = rollEquipment(state, {
        ...(reward.loot.slot === "weapon" || reward.loot.slot === "gear"
          ? { slot: reward.loot.slot }
          : {}),
        ...(reward.loot.tierBonus ? { tierBonus: reward.loot.tierBonus } : {}),
        // Priced against the hero who did the work, exactly as the stall is.
        mlvl: state.players[0].level,
      });
      payout.items.push(handOver(state, equipment, at));
    }
  }

  // A CLEAN SLATE goes on the hero himself rather than into the bag — see
  // `Player.cleanSlates` for why a thing that must never be lost does not live
  // in a container the player empties.
  if (reward.cleanSlates) {
    grantCleanSlate(state, reward.cleanSlates);
    payout.cleanSlates = reward.cleanSlates;
  }

  // A powerup goes straight to the dock, and is simply refused at the carry
  // cap — there is nowhere else to put one, and dropping it on the floor
  // beside a full dock would be a pickup the player cannot take either.
  for (const id of reward.abilities ?? []) {
    if (canBankAbility(state, id)) state.players[0].heldAbilities.push(id);
  }

  return payout;
}

/** Into the bag if it fits; onto the ground (thrown, like any drop) if not. */
function handOver(state: GameState, equipment: Equipment, at: Vec2): Equipment {
  if (!addToInventory(state, equipment)) {
    dropItem(
      state,
      { id: state.nextId++, kind: "equipment", pos: { ...at }, equipment },
      at,
    );
  }
  return equipment;
}

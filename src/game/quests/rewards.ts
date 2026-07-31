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
import { pickedQuestReward } from "./reward-choices.ts";
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
  /** The errand being paid — how the decided gear row is found. Omitted only by
   * a caller that has no errand (there is none today; the parameter is optional
   * so the signature stays compatible with a payout that carries no loot). */
  questId?: string,
): QuestPayout {
  const payout: QuestPayout = { xp: 0, coins: 0, items: [], cleanSlates: 0 };
  if (!reward) return payout;

  const xp = questXpReward(state, reward);
  if (xp > 0) {
    // Through the ordinary grant, so the difficulty's xpBonus, the BALANCE
    // knob and the level-up celebration all behave exactly as on a kill. NOT
    // through `shareXp`: an errand is paid to the person who ran it, and a
    // handover split with whoever happened to be standing nearby would be a
    // gift from the player who did the work to one who did not.
    //
    // `state.players[0]` is an UN-MIGRATED SEAT, spelled out rather than hidden
    // so it stays greppable (plan §3.7): the command channel carries no seat
    // yet, so a joiner handing in an errand pays the host's bar. It is fixed
    // where that list is fixed, not here.
    grantXp(state, state.players[0], xp);
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

  // THE GEAR WAS DECIDED BEFORE THE PLAYER SAID YES, and this hands over the
  // row they picked (see reward-choices.ts). Nothing is rolled here any more:
  // rolling at the handover is exactly what made the offer's promise a lie —
  // it showed one item and paid another.
  //
  // `count` above 1 still pays several pieces, and the extras come off the SAME
  // decided row rather than opening a second choice: a `count: 3` errand hands
  // over three of the piece that was chosen.
  if (questId && reward.loot) {
    const chosen = pickedQuestReward(state, questId);
    if (chosen) {
      payout.items.push(handOver(state, chosen, at));
      for (let i = 1; i < reward.loot.count; i++) {
        payout.items.push(
          handOver(
            state,
            rollEquipment(state, state.players[0], {
              defId: chosen.defId,
              tier: chosen.tier,
              quality: chosen.quality,
              mlvl: state.players[0].level,
            }),
            at,
          ),
        );
      }
    }
  }

  // A CLEAN SLATE goes on the hero himself rather than into the bag — see
  // `Player.cleanSlates` for why a thing that must never be lost does not live
  // in a container the player empties.
  if (reward.cleanSlates) {
    grantCleanSlate(state, state.players[0], reward.cleanSlates);
    payout.cleanSlates = reward.cleanSlates;
  }

  // A powerup goes straight to the dock, and is simply refused at the carry
  // cap — there is nowhere else to put one, and dropping it on the floor
  // beside a full dock would be a pickup the player cannot take either.
  for (const id of reward.abilities ?? []) {
    if (canBankAbility(state, state.players[0], id))
      state.players[0].heldAbilities.push(id);
  }

  return payout;
}

/** Into the bag if it fits; onto the ground (thrown, like any drop) if not. */
function handOver(state: GameState, equipment: Equipment, at: Vec2): Equipment {
  if (!addToInventory(state, state.players[0], equipment)) {
    dropItem(
      state,
      { id: state.nextId++, kind: "equipment", pos: { ...at }, equipment },
      at,
    );
  }
  return equipment;
}

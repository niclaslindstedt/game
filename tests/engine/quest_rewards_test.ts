// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT AN ERRAND PAYS, AND WHEN IT DECIDES.
//
// The rules here are the ones that are SILENT when they break. A reward that
// re-rolls between the offer and the handover still pays something, so nothing
// throws and no other test notices — it just quietly stops being the item the
// player was shown, which is the whole feature. Same for a pick that is not
// carried from the offer onto the accepted errand: the payout is still a real
// item, just not the one that was chosen.

import { beforeEach, describe, expect, it } from "vitest";

import {
  acceptQuest,
  chooseQuestReward,
  closeQuestDialogue,
  pickedQuestReward,
  questRewardChoices,
  registerDefs,
  step,
  talkToQuestGiver,
  turnInQuest,
  type GameState,
  type QuestDef,
  type QuestGiverDef,
} from "@game/core";

import { DT, idle, startGame } from "./helpers.ts";

const GIVER_AT = { x: 400, y: 1320 };

const FIX_GIVERS: Record<string, QuestGiverDef> = {
  reward_giver: {
    id: "reward_giver",
    level: "test_level",
    name: "REWARD GIVER",
    sprite: "test_giver",
    at: GIVER_AT,
    lore: "A synthetic fixture civilian who exists to pay fixture rewards.",
  },
};

/** One errand, no objectives, so it completes the moment it is taken and the
 * handover is one call away. */
const FIX_QUESTS: Record<string, QuestDef> = {
  test_paid: {
    id: "test_paid",
    level: "test_level",
    giver: "reward_giver",
    name: "TEST PAID",
    lore: "A synthetic fixture errand that pays gear.",
    offer: [["TAKE THIS."]],
    complete: [["HERE."]],
    objectives: [],
    reward: { coins: 5, loot: { count: 1 } },
  },
};

function install(): void {
  registerDefs({ quests: FIX_QUESTS, questGivers: FIX_GIVERS });
}

function run(): GameState {
  install();
  const state = startGame();
  state.players[0].pos = { x: GIVER_AT.x - 20, y: GIVER_AT.y };
  // Walk into reach so the giver is MET; the conversation still needs a tap.
  for (let i = 0; i < 20 && state.phase === "playing"; i++) {
    step(state, idle, DT);
  }
  return state;
}

/** Open the giver's conversation (they have exactly one errand, so the pick
 * list is skipped and the ask opens directly). */
function talk(state: GameState): void {
  talkToQuestGiver(state, "reward_giver");
}

describe("a quest's reward gear", () => {
  beforeEach(() => install());

  it("is minted when the conversation opens, not when it is handed over", () => {
    const state = run();
    expect(state.questRewards.test_paid).toBeUndefined();
    talk(state);
    const shown = state.questRewards.test_paid;
    expect(shown).toBeDefined();
    expect(shown!.length).toBeGreaterThan(0);
  });

  it("is the SAME gear every time it is asked for", () => {
    const state = run();
    talk(state);
    const first = questRewardChoices(state, "test_paid");
    // Walk away and come back: the promise has to survive leaving the box.
    closeQuestDialogue(state);
    talk(state);
    const second = questRewardChoices(state, "test_paid");
    expect(second).toBe(first);
    expect(second.map((i) => i.id)).toEqual(first.map((i) => i.id));
  });

  it("hands over exactly the piece that was shown", () => {
    const state = run();
    talk(state);
    const shown = questRewardChoices(state, "test_paid");
    const chosen = shown[shown.length - 1]!;
    expect(chooseQuestReward(state, shown.length - 1)).toBe(true);
    acceptQuest(state);
    // No objectives, so it is complete at once — talk again to hand it in.
    if (state.phase === "quest") closeQuestDialogue(state);
    talk(state);
    expect(state.questOffer?.kind).toBe("complete");
    const payout = turnInQuest(state);
    expect(payout).not.toBeNull();
    expect(payout!.items.map((i) => i.id)).toContain(chosen.id);
  });

  it("carries a pick made at the OFFER onto the accepted errand", () => {
    const state = run();
    talk(state);
    const shown = questRewardChoices(state, "test_paid");
    if (shown.length < 2) return; // a neutral piece has nothing to pick
    // Chosen BEFORE accepting, when there is no log row to store it on.
    expect(chooseQuestReward(state, 1)).toBe(true);
    acceptQuest(state);
    expect(state.quests.test_paid?.rewardPick).toBe(1);
    expect(pickedQuestReward(state, "test_paid")?.id).toBe(shown[1]!.id);
  });

  it("refuses a row that is not on the table", () => {
    const state = run();
    talk(state);
    const shown = questRewardChoices(state, "test_paid");
    expect(chooseQuestReward(state, -1)).toBe(false);
    expect(chooseQuestReward(state, shown.length)).toBe(false);
    // ...and an untouched errand still pays the top row rather than nothing.
    expect(pickedQuestReward(state, "test_paid")?.id).toBe(shown[0]!.id);
  });

  it("offers one row per class, or exactly one for a neutral piece", () => {
    const state = run();
    talk(state);
    const shown = questRewardChoices(state, "test_paid");
    // Never a padded-out list: it is a real choice or a single piece.
    expect(shown.length === 1 || shown.length === 3).toBe(true);
    // Every row is a DIFFERENT base — three copies of one item is not a choice.
    expect(new Set(shown.map((i) => i.defId)).size).toBe(shown.length);
    // ...and they are comparable: same tier, so the decision is about the build.
    expect(new Set(shown.map((i) => i.tier)).size).toBe(1);
  });
});

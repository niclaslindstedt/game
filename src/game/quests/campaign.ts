// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ERRANDS THAT BELONG TO THE HERO, NOT TO THE RUN — banking a campaign
// chain's progress out of a run and seeding it back into the next one.
//
// An ordinary quest is a run's business (see the header of ./index.ts, rule
// 4): the log dies with the level and a fresh visit offers everything again.
// That is right for pacing one map and wrong for a chain meant to be carried
// across the whole campaign, which is what `QuestDef.campaign` marks.
//
// THE SHAPE AND THE MERGE LIVE NEXT DOOR in ./campaign-save.ts, a leaf whose
// only import is a type — because the app's ROSTER stores this record and the
// roster is on the startup path (the 200 KB budget). What is left here is the
// half that genuinely needs the CATALOG: deciding which errands are campaign
// errands at all.
//
// TWO RULES, and both are about what happens when a hero dies, retries, or
// plays the maps out of order.
//
// 1. **ONLY THE CAMPAIGN ENTRIES TRAVEL.** `bankCampaignQuests` filters on the
//    DEF, not on the log, so a run quest's progress can never leak into the
//    save even if some future map re-uses an id. What the hero carries is
//    exactly what a campaign errand recorded.
// 2. **PER DIFFICULTY, LIKE EVERY OTHER PIECE OF CAMPAIGN PROGRESS** — the app
//    keys the stored record by rung (see characters.ts). Clears, merchants met
//    and story beats are all keyed that way, because a fresh rung is a fresh
//    campaign that tells its story again; a chain is no different.
//
// The FLAGS travel by the same rules, because half of what makes a chain feel
// long is that something you were told two venues ago still counts.

import { hasQuest, questDef } from "../defs/quests.ts";
import type { GameState, QuestProgress } from "../types/index.ts";
import { type CampaignQuestSave } from "./campaign-save.ts";

export * from "./campaign-save.ts";

/**
 * Pull the campaign half of a run's quest log out for banking. Run errands are
 * left behind, which is the whole point of the filter.
 */
export function bankCampaignQuests(state: GameState): CampaignQuestSave {
  const quests: Record<string, QuestProgress> = {};
  for (const [id, progress] of Object.entries(state.quests)) {
    if (!hasQuest(id) || !questDef(id).campaign) continue;
    quests[id] = {
      ...progress,
      counts: [...progress.counts],
      dryKills: [...progress.dryKills],
    };
  }
  // Every flag travels, not just the ones a campaign errand names. A flag is a
  // fact the hero learned, and filtering them by which errand happens to read
  // one today would quietly break the first conversation branch that reads an
  // older flag — a failure with no error and a two-venue delay on noticing it.
  return { quests, flags: { ...state.questFlags } };
}

/**
 * Seed a fresh run's log with what the hero carries. Called at run setup before
 * anything reads the log, so a chain's gate (`requires`), a giver's head mark
 * and the tracker are all correct on the first frame.
 *
 * A campaign errand banked as `complete` arrives complete: the hero did the
 * work, and having to redo it because he changed maps to find the person who
 * asked would be the feature contradicting itself.
 */
export function seedCampaignQuests(
  state: GameState,
  save: CampaignQuestSave | undefined,
): void {
  if (!save) return;
  for (const [id, progress] of Object.entries(save.quests ?? {})) {
    if (!hasQuest(id) || !questDef(id).campaign) continue;
    state.quests[id] = {
      ...progress,
      counts: [...progress.counts],
      dryKills: [...progress.dryKills],
    };
  }
  for (const [flag, set] of Object.entries(save.flags ?? {})) {
    if (set) state.questFlags[flag] = true;
  }
}

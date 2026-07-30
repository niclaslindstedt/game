// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAMPAIGN CHAIN'S CARRY — the shape a hero stores between runs, and the
// one rule for folding a run's progress into it.
//
// THIS IS A LEAF ON PURPOSE, and the reason is the 170 KB critical-path budget
// (see the engine's two entry points in AGENTS.md). The app's ROSTER stores
// this record and merges it on every save, and the roster is on the startup
// path — so it may reach `@game/menu` and nothing heavier. Everything here
// imports a single TYPE, which is what lets `@game/menu` re-export it without
// dragging the quest catalog, let alone the run pipeline, onto the title
// screen. The half that genuinely needs the catalog — deciding which errands
// are campaign errands at all — lives in ./campaign.ts and is run-side only.

import type { QuestProgress } from "../types/index.ts";

/**
 * What a hero carries between runs: the campaign errands' log and the flags
 * their conversations set. Plain JSON — the app stores it on the character and
 * the cloud merge moves it as an opaque part of that record.
 */
export type CampaignQuestSave = {
  quests: Record<string, QuestProgress>;
  flags: Record<string, boolean>;
};

/** An empty carry — a hero who has never taken a campaign errand. */
export function emptyCampaignQuests(): CampaignQuestSave {
  return { quests: {}, flags: {} };
}

/**
 * Fold a run's banking into what the hero already carried, keeping the FURTHER
 * reading of each errand. Flags are a union — a fact learned is never unlearned.
 *
 * PROGRESS ONLY EVER CLIMBS, and that is the whole rule. A run abandoned
 * halfway, a death, or a level replayed from a checkpoint that predates the
 * pickup can never walk the chain backwards; the alternative is the worst bug
 * this feature could have — hours of work undone by quitting to the menu at the
 * wrong moment, with nothing on screen to say it happened.
 */
export function mergeCampaignQuests(
  carried: CampaignQuestSave | undefined,
  banked: CampaignQuestSave,
): CampaignQuestSave {
  const out = carried
    ? { quests: { ...carried.quests }, flags: { ...carried.flags } }
    : emptyCampaignQuests();
  for (const [id, progress] of Object.entries(banked.quests)) {
    const existing = out.quests[id];
    out.quests[id] =
      !existing || questRank(progress) >= questRank(existing)
        ? progress
        : existing;
  }
  for (const [flag, set] of Object.entries(banked.flags)) {
    if (set) out.flags[flag] = true;
  }
  return out;
}

/**
 * HOW FAR ALONG an errand's reading is, for the keep-the-further merge. The
 * status leads, because a turned-in errand outranks any tally; within one
 * status the deeper tally wins, so a run that got three of five pieces beats
 * one that got two.
 *
 * `declined` deliberately ranks BELOW `offered`: a decline is the absence of
 * progress, and a player who said no on one visit must not have that saved over
 * a run where they took the job.
 */
const STATUS_RANK: Record<string, number> = {
  declined: 0,
  offered: 1,
  failed: 2,
  active: 3,
  complete: 4,
  turnedIn: 5,
};

function questRank(progress: QuestProgress): number {
  const status = (STATUS_RANK[progress.status] ?? 0) * 1e6;
  const tally = progress.counts.reduce((sum, n) => sum + n, 0);
  return status + tally;
}

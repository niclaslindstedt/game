// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAMPAIGN CHAIN — errands that belong to the hero rather than to the run,
// and the CLEAN SLATE the longest of them pays.
//
// The merge is what these mostly guard, because its failure mode is the worst
// one this feature could have: progress walking BACKWARDS when a player quits
// to the menu at the wrong moment, silently, after hours of work. So the
// keep-the-further rule is pinned from both directions, including the case a
// naive "newest wins" merge gets wrong.

import { describe, expect, it } from "vitest";

import {
  emptyCampaignQuests,
  mergeCampaignQuests,
  objectiveNeed,
  spendCleanSlate,
  type CampaignQuestSave,
  type QuestProgress,
} from "@game/core";

import { startGame } from "./helpers.ts";

const progress = (
  id: string,
  status: QuestProgress["status"],
  counts: number[] = [0],
): QuestProgress => ({
  id,
  status,
  counts,
  dryKills: counts.map(() => 0),
  acceptedAtMs: 0,
});

const save = (
  quests: Record<string, QuestProgress>,
  flags: Record<string, boolean> = {},
): CampaignQuestSave => ({ quests, flags });

describe("mergeCampaignQuests", () => {
  it("keeps the FURTHER reading, whichever side it arrives on", () => {
    const ahead = save({ q: progress("q", "turnedIn") });
    const behind = save({ q: progress("q", "active", [2]) });

    // A stale run banked after a finished one must not undo it — the whole
    // point of the rule.
    expect(mergeCampaignQuests(ahead, behind).quests.q?.status).toBe(
      "turnedIn",
    );
    // And the ordinary direction still advances.
    expect(mergeCampaignQuests(behind, ahead).quests.q?.status).toBe(
      "turnedIn",
    );
  });

  it("prefers the deeper tally within one status", () => {
    const three = save({ q: progress("q", "active", [3]) });
    const one = save({ q: progress("q", "active", [1]) });
    expect(mergeCampaignQuests(three, one).quests.q?.counts).toEqual([3]);
    expect(mergeCampaignQuests(one, three).quests.q?.counts).toEqual([3]);
  });

  it("never lets a DECLINE overwrite a run that took the job", () => {
    // The case a naive newest-wins merge gets wrong: saying no on a later
    // visit is the ABSENCE of progress, not progress.
    const took = save({ q: progress("q", "active", [2]) });
    const declined = save({ q: progress("q", "declined") });
    expect(mergeCampaignQuests(took, declined).quests.q?.status).toBe("active");
  });

  it("unions the flags — a fact learned is never unlearned", () => {
    const a = save({}, { told: true });
    const b = save({}, { seen: true });
    expect(mergeCampaignQuests(a, b).flags).toEqual({ told: true, seen: true });
  });

  it("takes an absent carry as an empty one", () => {
    const banked = save({ q: progress("q", "active") }, { f: true });
    expect(mergeCampaignQuests(undefined, banked)).toEqual(banked);
    expect(emptyCampaignQuests()).toEqual({ quests: {}, flags: {} });
  });
});

describe("objectiveNeed", () => {
  it("reads a level gate's target as its need, so the tracker can say 96/99", () => {
    // The count IS the hero's level (see the engine's poll), so `need` has to
    // be the target for the shared `count/need` wording to print the climb.
    expect(objectiveNeed({ kind: "reachLevel", level: 99 })).toBe(99);
  });

  it("treats the one-shot conditions as a single thing", () => {
    expect(
      objectiveNeed({
        kind: "visit",
        level: "test_level",
        at: { x: 0, y: 0 },
        name: "SOMEWHERE",
      }),
    ).toBe(1);
    expect(objectiveNeed({ kind: "flag", flag: "f", name: "N" })).toBe(1);
    expect(objectiveNeed({ kind: "sell", item: "i" })).toBe(1);
  });
});

describe("spendCleanSlate", () => {
  it("spends a charge and opens the respec", () => {
    const state = startGame();
    state.players[0].cleanSlates = 1;
    state.players[0].stats.strength = 4;

    expect(spendCleanSlate(state, state.players[0])).toBe(true);
    expect(state.players[0].cleanSlates).toBe(0);
    expect(state.players[0].screen).toBe("respec");
    // It is the SAME respec a level jump ran: the build is refunded into a
    // pool that has to be re-placed before play resumes.
    expect(state.players[0].pendingStatPoints).toBeGreaterThanOrEqual(4);
    expect(state.players[0].stats.strength).toBe(0);
    expect(state.events.some((e) => e.type === "cleanSlateUsed")).toBe(true);
  });

  it("refuses when the hero carries none, leaving the run alone", () => {
    const state = startGame();
    expect(spendCleanSlate(state, state.players[0])).toBe(false);
    expect(state.phase).toBe("playing");
  });

  it("refuses from a phase nobody could see the chooser in", () => {
    const state = startGame();
    state.players[0].cleanSlates = 1;
    state.phase = "dying";
    expect(spendCleanSlate(state, state.players[0])).toBe(false);
    // The charge is NOT spent — a refusal that ate it would be the worst
    // possible bug on the rarest reward in the game.
    expect(state.players[0].cleanSlates).toBe(1);
  });
});

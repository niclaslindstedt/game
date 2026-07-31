// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE QUEST RULES, on synthetic content.
//
// Everything here runs against fixture quests registered over the engine's own
// `registerDefs` hook — the same seam a MOD's quests arrive through — so this
// suite is simultaneously the engine's proof and the proof that a mod can ship
// an errand. Deleting the shipped campaign leaves it green.
//
// The rules worth pinning are the ones that are SILENT when they break: a
// chain gate that never opens, a tally that counts the wrong kill, a `?` that
// does not appear, an escort quest that cannot fail. None of those throw; they
// just quietly make a quest impossible.

import { beforeEach, describe, expect, it } from "vitest";

import {
  acceptQuest,
  advanceQuestDialogue,
  closeQuestDialogue,
  closeQuestLog,
  createGame,
  declineQuest,
  dismissIntro,
  giverMark,
  giverTopics,
  killEnemy,
  openQuestLog,
  pauseGame,
  pickQuestTopic,
  QUESTS,
  questXpReward,
  registerDefs,
  repelFromQuestGivers,
  skipCutscene,
  step,
  talkToQuestGiver,
  trackedQuests,
  turnInQuest,
  type GameState,
  type QuestDef,
  type QuestGiverDef,
} from "@game/core";

import { DT, idle, makeEnemy, startGame } from "./helpers.ts";

// The fixture level's own spawn, so a giver can be placed a few steps from the
// hero and reached by walking rather than by teleporting him.
const GIVER_AT = { x: 400, y: 1320 };

const FIX_GIVERS: Record<string, QuestGiverDef> = {
  test_giver: {
    id: "test_giver",
    level: "test_level",
    name: "TEST GIVER",
    sprite: "test_giver",
    at: GIVER_AT,
    lore: "A synthetic fixture civilian who exists to hand out fixture errands.",
  },
};

const FIX_QUESTS: Record<string, QuestDef> = {
  // A plain KILL errand, and the head of a two-link chain.
  test_cull: {
    id: "test_cull",
    level: "test_level",
    giver: "test_giver",
    name: "TEST CULL",
    lore: "A synthetic fixture errand.",
    offer: [["THIN THEM OUT."], ["THREE WILL DO."]],
    incomplete: ["NOT YET."],
    complete: [["THAT'S THREE."]],
    objectives: [{ kind: "kill", enemy: "test_minion", count: 3 }],
    reward: { xpShare: 0.25, coins: 50 },
  },
  // The chain's second link — offered only once the first is HANDED IN.
  test_cull_2: {
    id: "test_cull_2",
    level: "test_level",
    giver: "test_giver",
    name: "TEST CULL TWO",
    lore: "A synthetic fixture errand.",
    requires: ["test_cull"],
    offer: [["AGAIN."]],
    complete: [["DONE."]],
    objectives: [{ kind: "killNamed", enemy: "test_boss" }],
    reward: { coins: 10 },
  },
  // A FETCH errand whose piece drops off a breed and also lies on the floor.
  test_fetch: {
    id: "test_fetch",
    level: "test_level",
    giver: "test_giver",
    name: "TEST FETCH",
    lore: "A synthetic fixture errand.",
    offer: [["BRING ME TWO."]],
    complete: [["BOTH. GOOD."]],
    objectives: [{ kind: "collect", item: "test_token", count: 2 }],
    items: [
      {
        id: "test_token",
        name: "TEST TOKEN",
        icon: "test_token",
        dropFrom: ["test_minion"],
        dropChance: 1,
        at: [{ x: 420, y: 1320 }],
      },
    ],
    reward: { coins: 5 },
  },
  // An ESCORT errand — the only kind that can FAIL.
  test_walk: {
    id: "test_walk",
    level: "test_level",
    giver: "test_giver",
    name: "TEST WALK",
    lore: "A synthetic fixture errand.",
    offer: [["WALK THEM OVER."]],
    complete: [["THEY MADE IT."]],
    objectives: [
      { kind: "escort", escort: "test_ward", to: { x: 700, y: 1320 } },
    ],
    escorts: [
      {
        id: "test_ward",
        name: "TEST WARD",
        sprite: "test_ward",
        at: { x: 420, y: 1320 },
        hp: 30,
      },
    ],
    reward: { coins: 5 },
  },
};

function installQuests(): void {
  registerDefs({ quests: FIX_QUESTS, questGivers: FIX_GIVERS });
}

/** A run with the fixture errands installed and the hero next to the giver. */
function questRun(): GameState {
  installQuests();
  const state = startGame();
  state.players[0].pos = { x: GIVER_AT.x - 20, y: GIVER_AT.y };
  return state;
}

/** Step until the giver's conversation opens itself (or give up). */
function walkUp(state: GameState, ticks = 20): void {
  for (let i = 0; i < ticks && state.phase === "playing"; i++) {
    step(state, idle, DT);
  }
}

/**
 * Turn down whatever is on offer until `questId` is on the table. Bounded:
 * a giver holds a handful of errands and a tap cycles them, so a loop that
 * cannot find one has found a bug rather than a slow path.
 */
function offerUntil(state: GameState, questId: string): void {
  for (let i = 0; i < 8; i++) {
    if (state.questOffer?.questId === questId) return;
    if (!state.questOffer) {
      if (!talkToQuestGiver(state, "test_giver")) break;
      continue;
    }
    // A giver with several errands opens on the PICK LIST — choose the one
    // this test is after rather than declining through the slate.
    if (state.questOffer.kind === "list") {
      if (pickQuestTopic(state, questId)) return;
      break;
    }
    declineQuest(state);
  }
  throw new Error(`never offered "${questId}"`);
}

/**
 * Take whatever errand is on the table and step back OUT to the field.
 * Accepting drops back to the giver's slate by design (so a second errand is
 * one tap away), which is exactly what a test that wants to go and fight has
 * to leave.
 */
function takeAndLeave(state: GameState): void {
  take(state);
  if (state.phase === "quest") closeQuestDialogue(state);
}

/** Take the errand `id`, whichever conversation is currently open. */
function take(state: GameState): void {
  if (state.questOffer?.kind === "list") {
    const first = giverTopics(state, state.questOffer.giverId)[0];
    if (first) pickQuestTopic(state, first.questId);
  }
  while (state.questOffer && state.questOffer.kind === "offer") {
    const before = state.questOffer.page;
    advanceQuestDialogue(state);
    if (state.questOffer && state.questOffer.page === before) break;
  }
  acceptQuest(state);
}

/** Kill `n` fixture minions outright, as the horde would be felled. */
function cull(state: GameState, n: number, defId = "test_minion"): void {
  for (let i = 0; i < n; i++) {
    const enemy = makeEnemy({ pos: { x: 500, y: 1320 } }, defId);
    state.enemies.push(enemy);
    killEnemy(state, enemy, enemy.maxHp, false);
  }
}

describe("quest givers", () => {
  beforeEach(() => installQuests());

  it("stand where they are authored and are met by walking up", () => {
    const state = questRun();
    const giver = state.questGivers.find((g) => g.id === "test_giver");
    expect(giver).toBeDefined();
    expect(giver!.pos).toEqual(GIVER_AT);
    expect(giver!.discovered).toBe(false);

    walkUp(state);
    expect(giver!.discovered).toBe(true);
    // Meeting somebody pins them, so the walk BACK is navigable.
    expect(
      state.mapMarkers.some(
        (m) => m.kind === "questGiver" && m.defId === "test_giver",
      ),
    ).toBe(true);
  });

  it("open the whole slate at once, then fall silent", () => {
    const state = questRun();
    walkUp(state);
    // Somebody with three errands opens on the PICK LIST rather than handing
    // them over one at a time: the alternative makes a giver's second quest
    // reachable only by refusing the first, which reads as the game losing
    // track of what it already offered.
    expect(state.phase).toBe("quest");
    expect(state.questOffer?.kind).toBe("list");
    // `test_cull_2` is chain-gated behind `test_cull`, so it is not among them.
    expect(giverTopics(state, "test_giver").map((t) => t.questId)).toEqual([
      "test_cull",
      "test_fetch",
      "test_walk",
    ]);

    closeQuestDialogue(state);
    // The greeting happens ONCE: standing there does not re-open it.
    walkUp(state, 60);
    expect(state.phase).toBe("playing");

    // ...but the giver keeps their `!`, and a deliberate tap re-opens the
    // slate: a player who walked away at level 3 may want the job at level 9.
    expect(giverMark(state, "test_giver")).toBe("offer");
    expect(talkToQuestGiver(state, "test_giver")).toBe(true);
    expect(state.questOffer?.kind).toBe("list");
  });

  it("skip the list entirely when there is only one thing to say", () => {
    const state = questRun();
    // Take two of the three, leaving one offer — a menu of one is a menu
    // nobody wants, so the last one opens as the ask itself.
    walkUp(state);
    take(state);
    if (state.questOffer?.kind === "list") take(state);
    closeQuestDialogue(state);
    registerDefs({
      quests: { test_walk: FIX_QUESTS.test_walk! },
      questGivers: FIX_GIVERS,
    });
    expect(talkToQuestGiver(state, "test_giver")).toBe(true);
    expect(state.questOffer?.kind).toBe("offer");
    expect(state.questOffer?.questId).toBe("test_walk");
    installQuests();
  });

  it("come back to the slate after each errand, not out to the field", () => {
    const state = questRun();
    walkUp(state);
    expect(state.questOffer?.kind).toBe("list");
    // Picking one, then backing out of it, returns to the list — so taking
    // three errands off one person costs one walk-up rather than three.
    expect(pickQuestTopic(state, "test_fetch")).toBe(true);
    expect(state.questOffer?.questId).toBe("test_fetch");
    declineQuest(state);
    expect(state.phase).toBe("quest");
    expect(state.questOffer?.kind).toBe("list");

    // And accepting does the same, so the next one is one tap away.
    expect(pickQuestTopic(state, "test_cull")).toBe(true);
    take(state);
    expect(state.phase).toBe("quest");
    expect(state.questOffer?.kind).toBe("list");
    closeQuestDialogue(state);
    expect(state.phase).toBe("playing");
  });

  it("hold the run frozen while the conversation is up", () => {
    const state = questRun();
    walkUp(state);
    expect(state.phase).toBe("quest");
    const at = { ...state.players[0].pos };
    // A frozen phase is not stepped at all, so nothing in the world moves.
    for (let i = 0; i < 30; i++) step(state, idle, DT);
    expect(state.players[0].pos).toEqual(at);
  });

  it("ward the horde off, so the conversation is always reachable", () => {
    const state = questRun();
    const pos = { x: GIVER_AT.x + 4, y: GIVER_AT.y };
    repelFromQuestGivers(state, pos);
    const distance = Math.hypot(pos.x - GIVER_AT.x, pos.y - GIVER_AT.y);
    expect(distance).toBeCloseTo(QUESTS.repelRadius, 5);
  });
});

describe("a kill errand", () => {
  beforeEach(() => installQuests());

  it("counts kills of its breed and nothing else", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);
    expect(state.quests.test_cull?.status).toBe("active");

    // A different breed is not the errand's business.
    cull(state, 5, "test_fodder");
    expect(state.quests.test_cull?.counts[0]).toBe(0);

    cull(state, 2);
    expect(state.quests.test_cull?.counts[0]).toBe(2);
    expect(state.quests.test_cull?.status).toBe("active");

    cull(state, 1);
    expect(state.quests.test_cull?.counts[0]).toBe(3);
    expect(state.quests.test_cull?.status).toBe("complete");
  });

  it("caps its tally rather than counting past the ask", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);
    cull(state, 10);
    expect(state.quests.test_cull?.counts[0]).toBe(3);
  });

  it("moves the giver's mark to ? the moment it completes", () => {
    const state = questRun();
    walkUp(state);
    expect(giverMark(state, "test_giver")).toBe("offer");
    takeAndLeave(state);
    // Still `!`: this giver holds two MORE errands, and unstarted work
    // outranks work in progress — a player who cannot see there is another
    // job here will never come back for it.
    expect(giverMark(state, "test_giver")).toBe("offer");
    cull(state, 3);
    // A finished errand outranks everything: the `?` is the walk back, and it
    // is the one mark that must never be hidden behind another.
    expect(giverMark(state, "test_giver")).toBe("turnIn");
  });

  it("shows the grey ? only while nothing else is on offer", () => {
    const state = questRun();
    walkUp(state);
    // Take everything this giver has — each accept drops back to the slate, so
    // the whole set comes off one conversation.
    for (let i = 0; i < 4 && state.phase === "quest"; i++) take(state);
    expect(giverMark(state, "test_giver")).toBe("progress");
  });
});

describe("the handover", () => {
  beforeEach(() => installQuests());

  it("pays exactly what the offer quoted", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);
    cull(state, 3);

    const quoted = questXpReward(state, FIX_QUESTS.test_cull!.reward);
    const xpBefore = state.stats.xpGained;
    const coinsBefore = state.players[0].coins;

    expect(talkToQuestGiver(state, "test_giver")).toBe(true);
    // Finished work sorts to the top of the slate (`giverTopics`), so it is
    // the first row — the hero walked back for the reward, not for a new job.
    if (state.questOffer?.kind === "list") {
      expect(giverTopics(state, "test_giver")[0]).toMatchObject({
        questId: "test_cull",
        kind: "complete",
      });
      pickQuestTopic(state, "test_cull");
    }
    expect(state.questOffer?.kind).toBe("complete");
    const payout = turnInQuest(state);

    expect(payout).not.toBeNull();
    expect(payout!.coins).toBe(50);
    expect(state.players[0].coins).toBe(coinsBefore + 50);
    // The grant runs through `grantXp`, so the banked figure is the quoted one
    // scaled by the run's own xp knobs — never more than it, never zero.
    expect(state.stats.xpGained).toBeGreaterThan(xpBefore);
    expect(payout!.xp).toBe(quoted);
    expect(state.quests.test_cull?.status).toBe("turnedIn");
    // Handing one in drops back to the SLATE (this giver still has errands on
    // it), not out to the field — the same "one walk-up, several errands"
    // rule accepting follows.
    expect(state.phase).toBe("quest");
    expect(state.questOffer?.kind).toBe("list");
    closeQuestDialogue(state);
    expect(state.phase).toBe("playing");
  });

  it("unlocks the chain's next link, and not before", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);

    // The second link is gated on the first being HANDED IN, not finished.
    cull(state, 3);
    expect(talkToQuestGiver(state, "test_giver")).toBe(true);
    if (state.questOffer?.kind === "list") pickQuestTopic(state, "test_cull");
    expect(state.questOffer?.questId).toBe("test_cull");

    turnInQuest(state);
    expect(giverMark(state, "test_giver")).toBe("offer");
    // The chain's next link is now on the slate, and was not a moment ago.
    if (state.questOffer?.kind !== "list") {
      closeQuestDialogue(state);
      expect(talkToQuestGiver(state, "test_giver")).toBe(true);
    }
    expect(
      giverTopics(state, "test_giver").some(
        (t) => t.questId === "test_cull_2" && t.kind === "offer",
      ),
    ).toBe(true);
  });
});

describe("a fetch errand", () => {
  beforeEach(() => installQuests());

  it("lays its placed pieces out only once it is accepted", () => {
    const state = questRun();
    walkUp(state);
    // Decline the first two so the fetch is what gets offered.
    declineQuest(state);
    expect(state.items.some((i) => i.kind === "quest")).toBe(false);

    // A tap cycles the giver's other errands rather than re-offering the one
    // that was just refused, so the fetch comes up.
    offerUntil(state, "test_fetch");
    expect(state.questOffer?.questId).toBe("test_fetch");
    take(state);

    const placed = state.items.filter((i) => i.kind === "quest");
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ questId: "test_fetch" });
  });

  it("drops its piece off the breeds that carry it", () => {
    const state = questRun();
    walkUp(state);
    offerUntil(state, "test_fetch");
    takeAndLeave(state);
    const before = state.items.filter((i) => i.kind === "quest").length;
    cull(state, 1);
    const after = state.items.filter((i) => i.kind === "quest").length;
    // dropChance 1 — one kill, one piece.
    expect(after).toBe(before + 1);
  });

  it("stops dropping once the ask is met", () => {
    const state = questRun();
    walkUp(state);
    offerUntil(state, "test_fetch");
    takeAndLeave(state);
    const progress = state.quests.test_fetch!;
    progress.counts[0] = 2;
    const before = state.items.filter((i) => i.kind === "quest").length;
    cull(state, 4);
    expect(state.items.filter((i) => i.kind === "quest").length).toBe(before);
  });
});

describe("an escort errand", () => {
  beforeEach(() => installQuests());

  function takeWalk(state: GameState): void {
    walkUp(state);
    offerUntil(state, "test_walk");
    takeAndLeave(state);
  }

  it("puts a body on the field at its authored spot", () => {
    const state = questRun();
    takeWalk(state);
    expect(state.escorts).toHaveLength(1);
    expect(state.escorts[0]).toMatchObject({
      questId: "test_walk",
      pos: { x: 420, y: 1320 },
      hp: 30,
    });
  });

  it("completes when the ESCORT reaches the spot, not the hero", () => {
    const state = questRun();
    takeWalk(state);
    const escort = state.escorts[0]!;
    // The hero standing on the destination alone delivers nobody.
    state.players[0].pos = { x: 700, y: 1320 };
    step(state, idle, DT);
    expect(state.quests.test_walk?.status).toBe("active");

    // Put the escort there and the objective lands on the next tick.
    escort.pos = { x: 700, y: 1320 };
    step(state, idle, DT);
    expect(escort.arrived).toBe(true);
    expect(state.quests.test_walk?.status).toBe("complete");
  });

  it("fails the errand when the escort falls, and clears the body", () => {
    const state = questRun();
    takeWalk(state);
    const escort = state.escorts[0]!;
    // Staged well clear of the GIVER: their ward would shove the biting mob out
    // to its rim and the escort would walk away from it — which is the ward
    // working, not the bite failing.
    escort.pos = { x: 1200, y: 1320 };
    state.players[0].pos = { x: 1200, y: 1320 };
    escort.hp = 1;
    escort.hitCooldownMs = 0;
    // A mob in contact reach bites on the escort's own cadence.
    state.enemies.push(
      makeEnemy({ pos: { x: escort.pos.x + 2, y: escort.pos.y } }),
    );
    for (let i = 0; i < 10 && state.escorts.length > 0; i++) {
      step(state, idle, DT);
    }
    expect(state.quests.test_walk?.status).toBe("failed");
    expect(state.escorts).toHaveLength(0);
  });

  it("stops walking once the hero has left it behind", () => {
    const state = questRun();
    takeWalk(state);
    const escort = state.escorts[0]!;
    state.players[0].pos = {
      x: escort.pos.x + QUESTS.escortLeashDistance + 100,
      y: escort.pos.y,
    };
    const at = { ...escort.pos };
    for (let i = 0; i < 20; i++) step(state, idle, DT);
    expect(escort.waiting).toBe(true);
    expect(escort.pos).toEqual(at);
  });
});

describe("the quest log", () => {
  beforeEach(() => installQuests());

  it("lists nothing until something is taken on", () => {
    const state = questRun();
    expect(trackedQuests(state)).toHaveLength(0);
    walkUp(state);
    // An OFFERED-but-untaken errand is not "tracked" — the tracker shows work,
    // and a quest nobody accepted is not work.
    expect(trackedQuests(state)).toHaveLength(0);
    take(state);
    expect(trackedQuests(state).map((q) => q.id)).toEqual(["test_cull"]);
  });

  it("keeps a handed-in errand on the list", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);
    cull(state, 3);
    talkToQuestGiver(state, "test_giver");
    if (state.questOffer?.kind === "list") pickQuestTopic(state, "test_cull");
    turnInQuest(state);
    expect(trackedQuests(state).map((q) => q.id)).toContain("test_cull");
  });
});

describe("the quest log screen", () => {
  beforeEach(() => installQuests());

  it("openQuestLog freezes the run and closeQuestLog resumes it", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);
    openQuestLog(state);
    expect(state.phase).toBe("questLog");
    const before = state.stats.timeMs;
    for (let i = 0; i < 20; i++) step(state, idle, DT);
    expect(state.stats.timeMs).toBe(before); // frozen like the map
    closeQuestLog(state);
    expect(state.phase).toBe("playing");
  });

  it("only opens mid-run, and closing yields to a pending level-up", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);
    pauseGame(state);
    openQuestLog(state); // not playing: a no-op
    expect(state.phase).toBe("paused");
    state.phase = "playing";
    openQuestLog(state);
    state.players[0].pendingStatPoints = 1;
    closeQuestLog(state);
    expect(state.phase).toBe("levelup");
  });
});

describe("the progress announcement", () => {
  beforeEach(() => installQuests());

  // The HUD's centre flash is drawn off `questProgress` and nothing else, so
  // EVERY kind of progress has to emit one — a flash that only fired for kills
  // would leave a fetch piece or a delivered escort silently unremarked.
  it("emits a countable questProgress for a kill off the list", () => {
    const state = questRun();
    walkUp(state);
    takeAndLeave(state);
    cull(state, 1);
    expect(
      state.events.filter((e) => e.type === "questProgress"),
    ).toMatchObject([{ questId: "test_cull", index: 0, count: 1, need: 3 }]);
  });

  it("emits one for a fetch piece walked over", () => {
    const state = questRun();
    walkUp(state);
    offerUntil(state, "test_fetch");
    takeAndLeave(state);
    // The placed piece lies a step away; walk onto it.
    const piece = state.items.find((i) => i.kind === "quest");
    expect(piece).toBeDefined();
    state.players[0].pos = { ...piece!.pos };
    for (let i = 0; i < 20 && !state.events.some(isProgress); i++) {
      step(state, idle, DT);
    }
    expect(state.events.filter(isProgress)).toMatchObject([
      { questId: "test_fetch", index: 0, count: 1, need: 2 },
    ]);
  });
});

/** This tick carried an errand's tally forward. */
function isProgress(event: GameState["events"][number]): boolean {
  return event.type === "questProgress";
}

describe("a run with no errands", () => {
  it("carries an empty quest system without any special case", () => {
    // The shipped game may ship no quests at all, and a mod-less sequel
    // certainly will — nothing downstream may assume there is a giver.
    registerDefs({ quests: {}, questGivers: {} });
    const state = createGame(1, "test_level");
    skipCutscene(state);
    dismissIntro(state);
    expect(state.questGivers).toEqual([]);
    expect(state.escorts).toEqual([]);
    expect(state.questOffer).toBeNull();
    for (let i = 0; i < 30; i++) step(state, idle, DT);
    expect(state.phase).toBe("playing");
    closeQuestDialogue(state); // a no-op, and must not throw
    expect(state.phase).toBe("playing");
    installQuests();
  });
});

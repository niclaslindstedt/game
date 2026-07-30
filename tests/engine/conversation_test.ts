// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NEUTRAL MOBS AND CONVERSATION TREES — the two halves of a talk the player
// steers, on synthetic fixtures so a sequel that deletes every shipped id
// leaves these green.
//
// The assertions concentrate on the four things that are invisible when they
// break: a bystander that can be killed by a stray swing (which dead-ends a
// chain with no error), a filtered choice list indexed by the wrong number
// (which picks a different branch than the player tapped), a provoke that
// leaves the body inert, and a re-entry that greets you from the top after you
// have already been told something.

import { beforeEach, describe, expect, it } from "vitest";

import {
  advanceTalk,
  hitEnemy,
  inertEnemy,
  isNeutral,
  pickTalkChoice,
  provokeEnemy,
  registerDefs,
  setQuestFlag,
  talkChoices,
  talkNode,
  talkToEnemy,
  type ConversationDef,
  type EnemyDef,
  type GameState,
} from "@game/core";

import { startGame } from "./helpers.ts";
import { FIX_ENEMIES } from "./fixtures.ts";

const BYSTANDER: EnemyDef = {
  id: "test_bystander",
  name: "TEST BYSTANDER",
  lore: "A synthetic person who is not fighting anybody.",
  role: "minion",
  sprite: "test_bystander",
  disposition: "neutral",
  conversation: "test_talk",
  hp: 100,
  speed: 10,
  radius: 8,
  contactDamage: 10,
  critChance: 0,
  contactCooldownMs: 700,
  ai: { aggroRadius: 300 },
};

const TALK: ConversationDef = {
  id: "test_talk",
  start: "greet",
  reentry: [{ requires: ["told"], node: "again" }],
  nodes: [
    {
      id: "greet",
      say: ["HELLO."],
      choices: [
        { text: "TELL ME.", sets: ["told"], goto: "answer" },
        { text: "SECRET.", requires: ["told"], goto: "answer" },
        { text: "SWING AT ME.", provoke: true },
      ],
    },
    { id: "answer", say: ["ALL RIGHT."] },
    { id: "again", say: ["YOU ALREADY KNOW."] },
  ],
};

/** A run with one bystander standing on the hero's own spot. */
function withBystander(): { state: GameState; id: number } {
  const state = startGame();
  const enemy = {
    id: state.nextId++,
    defId: BYSTANDER.id,
    pos: { ...state.player.pos },
    home: { ...state.player.pos },
    hp: 100,
    maxHp: 100,
    mlvl: 1,
    speed: 10,
    contactCooldownMs: 0,
  };
  state.enemies.push(enemy);
  return { state, id: enemy.id };
}

beforeEach(() => {
  registerDefs({
    enemies: { ...FIX_ENEMIES, [BYSTANDER.id]: BYSTANDER },
    conversations: { [TALK.id]: TALK },
  });
});

describe("a neutral mob", () => {
  it("is inert — a stray swing cannot delete a quest's speaker", () => {
    const { state, id } = withBystander();
    const enemy = state.enemies.find((e) => e.id === id)!;

    expect(isNeutral(BYSTANDER, enemy)).toBe(true);
    expect(inertEnemy(enemy)).toBe(true);

    // Straight through the ONE funnel every damage path in the game flows
    // through. Nothing else needs asserting: if this refuses, the forty gates
    // upstream of it are belt and braces.
    hitEnemy(state, enemy, 9999);
    expect(enemy.hp).toBe(100);
    expect(state.enemies).toContain(enemy);
  });

  it("becomes an ordinary monster the moment it is provoked", () => {
    const { state, id } = withBystander();
    const enemy = state.enemies.find((e) => e.id === id)!;

    expect(provokeEnemy(state, enemy)).toBe(true);
    expect(enemy.hostile).toBe(true);
    expect(enemy.awake).toBe(true);
    expect(inertEnemy(enemy)).toBe(false);
    expect(state.events.some((e) => e.type === "enemyProvoked")).toBe(true);

    hitEnemy(state, enemy, 40);
    expect(enemy.hp).toBe(60);

    // Idempotent: a second provoke (a repeated tap on the branch) is a no-op
    // rather than a second event the app would sell twice.
    expect(provokeEnemy(state, enemy)).toBe(false);
  });
});

describe("a conversation", () => {
  it("opens on its start node and hides choices the run has not earned", () => {
    const { state, id } = withBystander();
    expect(talkToEnemy(state, id)).toBe(true);
    expect(state.phase).toBe("talk");
    expect(talkNode(state)?.id).toBe("greet");

    // THE GATED ROW IS ABSENT, NOT GREYED — a locked sentence is a spoiler
    // printed in the shape of a locked door.
    const choices = talkChoices(state);
    expect(choices.map((c) => c.text)).toEqual(["TELL ME.", "SWING AT ME."]);
  });

  it("indexes the FILTERED list, so a gate cannot shift which branch is taken", () => {
    const { state, id } = withBystander();
    talkToEnemy(state, id);

    // Index 1 of the filtered list is SWING AT ME; index 1 of the AUTHORED
    // list is the gated SECRET row. Picking 1 must provoke — anything else
    // means the app and the engine disagree about what the player tapped.
    expect(pickTalkChoice(state, 1)).toBe(true);
    const enemy = state.enemies.find((e) => e.id === id)!;
    expect(enemy.hostile).toBe(true);
    // Provoking closes the talk: there is nobody left to speak to.
    expect(state.talk).toBeNull();
    expect(state.phase).toBe("playing");
  });

  it("sets a flag, walks to the node, and re-enters there next time", () => {
    const { state, id } = withBystander();
    talkToEnemy(state, id);
    expect(pickTalkChoice(state, 0)).toBe(true);

    expect(state.questFlags.told).toBe(true);
    expect(talkNode(state)?.id).toBe("answer");
    expect(state.events.some((e) => e.type === "questFlagSet")).toBe(true);

    // A node with no choices is a plain reply — tapping it closes the talk.
    advanceTalk(state);
    expect(state.talk).toBeNull();

    // RE-ENTRY: the flag has been earned, so the second walk-up does not
    // greet from the top. A person who has told you something does not tell
    // you again from the start.
    expect(talkToEnemy(state, id)).toBe(true);
    expect(talkNode(state)?.id).toBe("again");
  });

  it("emits one flag event however many branches claim to set it", () => {
    const state = startGame();
    expect(setQuestFlag(state, "once")).toBe(true);
    expect(setQuestFlag(state, "once")).toBe(false);
    expect(state.events.filter((e) => e.type === "questFlagSet").length).toBe(
      1,
    );
  });
});

describe("a fresh run", () => {
  it("starts with no talk open and no flags set", () => {
    const state = startGame();
    expect(state.talk).toBeNull();
    expect(state.questFlags).toEqual({});
  });
});

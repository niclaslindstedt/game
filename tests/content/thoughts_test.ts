// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pinned inner monologues: a story beat pinned to a kill or a sighting rather
// than a speaker. The first INTERN the hero SEES at SpaceZ HQ stops the run
// for his read on a building fully staffed at midnight (a sight pin — no blow
// struck); the first wisp and the first OPTIMUSK he DOWNS on the moon do the
// same for the haunting and for the night-shift robots that followed the
// trail up here — each exactly once, each only on its level.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  dialogueContent,
  step,
  thoughtDef,
  type GameEvent,
  type GameState,
} from "@game/core";

import { clearStage, DT, idle, makeEnemy, startGame } from "../helpers.ts";

/** Drop a point-blank, one-hit-from-death mob of `defId` on the player. */
function placeDying(state: GameState, defId: string) {
  const mob = makeEnemy(
    { pos: { ...state.player.pos }, hp: 1, maxHp: 10, speed: 0 },
    defId,
  );
  state.enemies.push(mob);
  return mob;
}

/** Auto-fire until `enemyId` is dead, gathering every event emitted. */
function killAndCollect(state: GameState, enemyId: number): GameEvent[] {
  const collected: GameEvent[] = [];
  for (let i = 0; i < 120; i++) {
    step(state, idle, DT);
    collected.push(...state.events);
    if (!state.enemies.some((e) => e.id === enemyId)) break;
  }
  return collected;
}

describe("first-kill thoughts", () => {
  it("opens the hero's monologue on the first moon OPTIMUSK kill", () => {
    const state = startGame(); // the moon
    clearStage(state);
    const bot = placeDying(state, "optimusk");

    killAndCollect(state, bot.id);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "moon_optimusk",
    });
    // Spoken in the hero's own voice, with his portrait — not a mob talking.
    const content = dialogueContent(state.dialogue!);
    const def = thoughtDef("moon_optimusk");
    expect(content.speaker).toBe(def.speaker);
    expect(content.portrait).toBe(def.portrait);
    expect(content.pages).toEqual(def.pages);
  });

  it("plays once — a later OPTIMUSK kill is silent", () => {
    const state = startGame();
    clearStage(state);

    const first = placeDying(state, "optimusk");
    killAndCollect(state, first.id);
    expect(state.dialogue?.source).toMatchObject({ kind: "playerThought" });
    // Tap the whole monologue closed.
    while (state.dialogue) advanceDialogue(state);
    expect(state.phase).toBe("playing");

    const second = placeDying(state, "optimusk");
    const events = killAndCollect(state, second.id);
    expect(events.some((e) => e.type === "enemyKilled")).toBe(true);
    expect(state.dialogue).toBeNull(); // no encore
    expect(state.phase).toBe("playing");
    expect(state.thoughtsSeen).toEqual(["moon_optimusk"]);
  });

  it("opens the hero's read on the night shift when the first HQ INTERN comes into view", () => {
    const state = startGame(undefined, "spacez_hq");
    clearStage(state);
    // A live intern parked beyond the sight radius: no reaction yet.
    const staffer = makeEnemy(
      { pos: { x: state.player.pos.x + 200, y: state.player.pos.y } },
      "intern",
    );
    state.enemies.push(staffer);
    step(state, idle, DT);
    expect(state.dialogue).toBeNull();

    // It steps into view — the thought fires on sight, before any blow.
    staffer.pos = { x: state.player.pos.x + 60, y: state.player.pos.y };
    step(state, idle, DT);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_staff",
    });
    expect(state.stats.kills).toBe(0); // sighted, not killed
    const content = dialogueContent(state.dialogue!);
    const def = thoughtDef("spacez_staff");
    expect(content.speaker).toBe(def.speaker);
    expect(content.pages).toEqual(def.pages);
  });

  it("fires the sight beat once — later interns in view stay silent", () => {
    const state = startGame(undefined, "spacez_hq");
    clearStage(state);
    const staffer = makeEnemy(
      { pos: { x: state.player.pos.x + 60, y: state.player.pos.y } },
      "intern",
    );
    state.enemies.push(staffer);
    step(state, idle, DT);
    expect(state.dialogue?.source).toMatchObject({ kind: "playerThought" });
    while (state.dialogue) advanceDialogue(state);
    expect(state.phase).toBe("playing");

    // Still in view on the next tick — the beat never replays.
    step(state, idle, DT);
    expect(state.dialogue).toBeNull();
    expect(state.thoughtsSeen).toEqual(["spacez_staff"]);
  });

  it("opens the hero's read on the haunting on the first moon wisp kill", () => {
    const state = startGame(); // the moon
    clearStage(state);
    const spirit = placeDying(state, "wisp");

    killAndCollect(state, spirit.id);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "moon_wisp",
    });
  });

  it("does not fire for OPTIMUSK killed at SpaceZ HQ", () => {
    const state = startGame(undefined, "spacez_hq");
    clearStage(state);
    const bot = placeDying(state, "optimusk");

    killAndCollect(state, bot.id);
    // SpaceZ HQ pins no first-kill thought to its own robots — they belong
    // there, so downing one is just another kill.
    expect(state.dialogue).toBeNull();
    expect(state.phase).toBe("playing");
    expect(state.thoughtsSeen).toEqual([]);
  });
});

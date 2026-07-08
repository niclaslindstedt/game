// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// First-kill inner monologues: a story beat pinned to a kill rather than a
// speaker. The first INTERN at SpaceZ HQ stops the run for the hero's read on
// a building fully staffed at midnight; the first wisp and the first OPTIMUSK
// on the moon do the same for the haunting and for the night-shift robots
// that followed the trail up here — each exactly once, each only on its level.

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

  it("opens the hero's read on the night shift on the first HQ INTERN kill", () => {
    const state = startGame(undefined, "spacez_hq");
    clearStage(state);
    const staffer = placeDying(state, "intern");

    killAndCollect(state, staffer.id);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_staff",
    });
    const content = dialogueContent(state.dialogue!);
    const def = thoughtDef("spacez_staff");
    expect(content.speaker).toBe(def.speaker);
    expect(content.pages).toEqual(def.pages);
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

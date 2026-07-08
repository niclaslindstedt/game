// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pinned inner monologues: a story beat pinned to a kill or a sighting rather
// than a speaker. The first INTERN the hero SEES at SpaceZ HQ stops the run
// for his read on a building fully staffed at midnight (a sight pin — no blow
// struck), and the first OPTIMUSK he SEES there is personal — he helped build
// the line that took everyone's jobs. The moon's haunting reads in two
// ordered beats — SEEING the first wisp, then DOWNING one (its `after` gate
// holds the kill beat until the sighting has played) — and the first OPTIMUSK
// he DOWNS up there is its own beat. Each fires exactly once, each only on
// its level.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  dialogueContent,
  step,
  thoughtDef,
  type GameEvent,
  type GameState,
} from "@game/core";

import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  startGame,
} from "../helpers.ts";

/** Drop a point-blank, one-hit-from-death mob of `defId` on the player. */
function placeDying(state: GameState, defId: string) {
  const mob = makeEnemy(
    { pos: { ...state.player.pos }, hp: 1, maxHp: 10, speed: 0 },
    defId,
  );
  state.enemies.push(mob);
  return mob;
}

/** Tap the open dialogue closed, page by page (a helper rather than an
 * inline loop so the caller's `state.dialogue` narrowing survives). */
function tapThrough(state: GameState): void {
  while (state.dialogue) advanceDialogue(state);
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
    tapThrough(state);
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
    tapThrough(state);
    expect(state.phase).toBe("playing");

    // Still in view on the next tick — the beat never replays.
    step(state, idle, DT);
    expect(state.dialogue).toBeNull();
    expect(state.thoughtsSeen).toEqual(["spacez_staff"]);
  });

  it("opens the haunting read when the first moon wisp comes into view, and closes it on the kill", () => {
    const state = startGame(); // the moon
    clearStage(state);
    // Inside the sight radius but outside sword reach: seen, not struck.
    const spirit = makeEnemy(
      {
        id: 9001,
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 1,
        maxHp: 10,
      },
      "wisp",
    );
    state.enemies.push(spirit);
    step(state, idle, DT);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "moon_wisp_sight",
    });
    tapThrough(state);

    // It drifts onto the blade: the kill beat closes the read.
    spirit.pos = { ...state.player.pos };
    killAndCollect(state, spirit.id);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "moon_wisp_kill",
    });
    expect(state.thoughtsSeen).toEqual(["moon_wisp_sight", "moon_wisp_kill"]);
  });

  it("holds the kill beat until the sighting has played — a snipe from beyond view defers it", () => {
    const state = startGame();
    clearStage(state);
    equipBlaster(state);
    // Downed from beyond the sight radius: the gated kill beat holds, unspent.
    const sniped = makeEnemy(
      {
        id: 9001,
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
        hp: 1,
        maxHp: 10,
      },
      "wisp",
    );
    state.enemies.push(sniped);
    killAndCollect(state, sniped.id);
    expect(state.dialogue).toBeNull();
    expect(state.thoughtsSeen).toEqual([]);

    // The next wisp drifts into view: the beats play in reading order.
    const seen = makeEnemy(
      {
        id: 9002,
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 1,
        maxHp: 10,
      },
      "wisp",
    );
    state.enemies.push(seen);
    step(state, idle, DT);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "moon_wisp_sight",
    });
    tapThrough(state);
    seen.pos = { ...state.player.pos };
    killAndCollect(state, seen.id);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "moon_wisp_kill",
    });
  });

  it("opens the hero's read on his old robot when the first HQ OPTIMUSK comes into view", () => {
    const state = startGame(undefined, "spacez_hq");
    clearStage(state);
    // Parked beyond the sight radius: no reaction yet.
    const bot = makeEnemy(
      {
        pos: { x: state.player.pos.x + 200, y: state.player.pos.y },
        hp: 1,
        maxHp: 10,
      },
      "optimusk",
    );
    state.enemies.push(bot);
    step(state, idle, DT);
    expect(state.dialogue).toBeNull();

    // It stomps into view — the beat fires on sight, before any blow.
    bot.pos = { x: state.player.pos.x + 60, y: state.player.pos.y };
    step(state, idle, DT);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_optimusk",
    });
    tapThrough(state);

    // Downing it here plays nothing more: the KILL beat (moon_optimusk)
    // belongs to the moon, where the tin men have no business being.
    bot.pos = { ...state.player.pos };
    killAndCollect(state, bot.id);
    expect(state.dialogue).toBeNull();
    expect(state.phase).toBe("playing");
    expect(state.thoughtsSeen).toEqual(["spacez_optimusk"]);
  });
});

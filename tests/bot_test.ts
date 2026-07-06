// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot (src/game/bot.ts): bot strategies produce ordinary GameInput
// from the live state, so a bot can play the game headlessly — closing on
// monsters, kiting at weapon range, scooping pickups, pushing for the boss —
// while keeping the run exactly as deterministic as a human's.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  botAct,
  botAllocate,
  createBot,
  enemyDef,
  step,
  WEAPON_DEFS,
  type Bot,
  type GameState,
} from "@game/core";
import { clearStage, DT, makeEnemy, startGame } from "./helpers.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Step the sim with the bot at the controls, spending its level-ups. */
function drive(
  state: GameState,
  bot: Bot,
  maxSteps: number,
  done?: (s: GameState) => boolean,
): number {
  for (let i = 0; i < maxSteps; i++) {
    if (done?.(state)) return i;
    step(state, botAct(bot, state), DT);
    while (state.player.pendingStatPoints > 0) {
      allocateStat(state, botAllocate(bot, state));
    }
  }
  return maxSteps;
}

describe("bot strategies", () => {
  it("rush closes on the nearest monster", () => {
    const state = startGame();
    clearStage(state);
    const ghost = makeEnemy({
      pos: { x: state.player.pos.x + 220, y: state.player.pos.y },
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(ghost);
    const before = dist(state.player.pos, ghost.pos);
    drive(state, createBot("rush"), 60);
    expect(dist(state.player.pos, ghost.pos)).toBeLessThan(before - 50);
  });

  it("kite settles inside weapon range but outside the pack's grasp", () => {
    const state = startGame();
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 220, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        speed: 42, // it chases; the bot must keep backing off
      }),
    );
    drive(state, createBot("kite"), 400);
    const ghost = state.enemies.find((e) => enemyDef(e.defId).role !== "boss")!;
    const d = dist(state.player.pos, ghost.pos);
    expect(d).toBeLessThanOrEqual(WEAPON_DEFS.blaster!.range);
    expect(d).toBeGreaterThan(60);
    expect(state.stats.damageTaken).toBe(0);
    expect(state.stats.shotsFired).toBeGreaterThan(0);
  });

  it("boss strategy crosses the map and engages ARMSTRONG", () => {
    const state = startGame();
    clearStage(state); // just the parked boss at the flag
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    const steps = drive(
      state,
      createBot("boss"),
      3000,
      (s) => s.stats.damageDealt > 0 || s.enemies.length === 0,
    );
    expect(steps).toBeLessThan(3000);
    expect(dist(state.player.pos, boss.home)).toBeLessThan(400);
  });

  it("survivor scoops a nearby pickup", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      {
        id: 9001,
        kind: "medkit",
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      },
    ];
    drive(state, createBot("survivor"), 300, (s) => s.items.length === 0);
    expect(state.stats.itemsCollected).toBe(1);
  });

  it("survivor pushes for the boss once levelled", () => {
    const state = startGame();
    clearStage(state);
    state.player.level = 6;
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    const before = dist(state.player.pos, boss.home);
    drive(state, createBot("survivor"), 600);
    expect(dist(state.player.pos, boss.home)).toBeLessThan(before - 300);
  });

  it("idle never steers", () => {
    const state = startGame();
    const input = botAct(createBot("idle"), state);
    expect(input.steering).toBe(false);
    expect(input.jump).toBe(false);
  });

  it("keeps a botted horde run deterministic", () => {
    const a = startGame();
    const b = startGame();
    drive(a, createBot("survivor"), 1200);
    drive(b, createBot("survivor"), 1200);
    expect(a.player.pos).toEqual(b.player.pos);
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos));
    expect(a.stats).toEqual(b.stats);
  });

  it("plays a real horde run headlessly", () => {
    const state = startGame();
    drive(state, createBot("survivor"), 1875); // 30 seconds
    // No survival requirement (the owner playtests winnability by hand) —
    // the bot just has to genuinely play: move, shoot, kill.
    expect(state.stats.shotsFired).toBeGreaterThan(0);
    expect(state.stats.kills).toBeGreaterThan(0);
  });
});

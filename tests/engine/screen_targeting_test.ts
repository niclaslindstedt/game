// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NOTHING OFF THE SCREEN IS A TARGET (src/game/sight.ts `visibleTo`, read by
// step/weapon.ts `nearestEnemy`, by `nearestCrate`, by the conjured powers and
// by the companions' engage bubble).
//
// The fog rule (fog_targeting_test.ts) is the OTHER half of the same question,
// and on its own it stops being an answer within about ten seconds of play: the
// fog never rolls back, so a hero who has walked a room has "explored" far more
// ground than a phone held sideways can show him. From then on a power reaching
// 300 world px — the storm, the volley, the singularity, the sentry grid, the
// well's hunt — could mark a monster the player had no picture of, and did.
//
// So the rule is BOTH: on this hero's own screen, and out of the fog. Reach is
// untouched by either — a long gun still outranges a pistol, it just cannot
// reach past what the player is being shown.

import { describe, expect, it } from "vitest";

import { COMPANIONS, recruitCompanion, step, visibleTo } from "@game/core";
import type { GameInput, GameState, Player } from "@game/core";
// Engine-internal: the shared target picker every automatic pick runs, one of
// the effects that used to pick without a screen, and the bot's stand-off read.
import { nearestEnemy } from "../../src/game/step/weapon.ts";
import { applyStorm } from "../../src/game/ability-effects.ts";
import { firingReach } from "../../src/game/bot/perception.ts";

import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  revealAll,
  startGame,
} from "./helpers.ts";

/** The phone world viewport (~422×195, the landscape reference device) centred
 * on `pos` — the rect the app stamps into `GameInput.view` every tick. */
function viewAround(pos: { x: number; y: number }) {
  return { x: pos.x - 211, y: pos.y - 97, width: 422, height: 195 };
}

/** A quiet, FULLY EXPLORED field: the fog is deliberately off, so anything
 * these tests refuse is refused by the screen alone. */
function litStage(state: GameState): GameState {
  clearStage(state);
  revealAll(state);
  return state;
}

/** Idle input carrying the hero's own camera. */
function watching(state: GameState): GameInput {
  return { ...idle, view: viewAround(state.players[0].pos) };
}

/** A spot `dist` px due NORTH of the hero — the short axis of a landscape
 * screen (97 px to the edge), and well inside the blaster's 260 reach. */
function north(state: GameState, dist: number): { x: number; y: number } {
  const { x, y } = state.players[0].pos;
  return { x, y: y - dist };
}

describe("the edge of the screen hides a mob from the auto-attack", () => {
  it("holds fire on a mob in reach, in the light, and off the top of the frame", () => {
    const state = litStage(equipBlaster(startGame()));
    // 150px north: inside the blaster's 260 reach, on ground the hero has
    // walked — and 53px past the top edge of a landscape phone.
    const spot = north(state, 150);
    state.enemies.push(makeEnemy({ pos: spot }));

    step(state, watching(state), DT);

    expect(state.projectiles).toHaveLength(0);
    expect(state.stats.shotsFired).toBe(0);
  });

  it("shoots that same mob once it is on screen", () => {
    const state = litStage(equipBlaster(startGame()));
    const enemy = makeEnemy({ pos: north(state, 150) });
    state.enemies.push(enemy);
    step(state, watching(state), DT);
    expect(state.projectiles).toHaveLength(0);

    // Nothing else about the arrangement changes — it walks into frame.
    enemy.pos = north(state, 60);
    step(state, watching(state), DT);

    expect(state.projectiles).toHaveLength(1);
    expect(state.projectiles[0]!.dir.y).toBeLessThan(0);
  });

  it("is not the fog: explored ground off screen is still refused", () => {
    const state = litStage(startGame());
    const hero = state.players[0];
    hero.view = viewAround(hero.pos);
    const spot = north(state, 150);
    // The fog has no objection at all — this is the screen's refusal alone.
    expect(visibleTo(state, hero, spot)).toBe(false);
    hero.view = undefined;
    expect(visibleTo(state, hero, spot)).toBe(true);
  });

  it("leaves a hero nobody is watching through able to fight (headless)", () => {
    // A run with no camera reported — the engine suites, `simulate --view none`
    // — must not have the screen half refuse everything, or the hero could
    // never attack at all.
    const state = litStage(equipBlaster(startGame()));
    state.enemies.push(makeEnemy({ pos: north(state, 150) }));

    step(state, idle, DT);

    expect(state.projectiles).toHaveLength(1);
  });
});

describe("the hero carries the screen the game aims through", () => {
  it("stamps the seat's own camera onto the hero, copied and not aliased", () => {
    const state = litStage(startGame());
    const view = viewAround(state.players[0].pos);
    expect(state.players[0].view).toBeUndefined(); // headless until reported

    step(state, { ...idle, view }, DT);

    expect(state.players[0].view).toEqual(view);
    expect(state.players[0].view).not.toBe(view);
  });

  it("keeps the camera while the player has a SCREEN up", () => {
    // A bag held open hands the simulation IDLE input for the seat, but the
    // field is still being drawn behind it — and the weapon still auto-fires.
    // Reading the view off that idle input would drop the gate exactly when the
    // player is least able to see what the hero shoots at.
    const state = litStage(equipBlaster(startGame()));
    const view = viewAround(state.players[0].pos);
    step(state, { ...idle, view }, DT);

    state.players[0].screen = "inventory";
    state.enemies.push(makeEnemy({ pos: north(state, 150) }));
    step(state, { ...idle, view }, DT);

    expect(state.players[0].view).toEqual(view);
    expect(state.projectiles).toHaveLength(0);
  });
});

describe("the conjured powers aim through the same screen", () => {
  /** A storm block reaching 300px — the shipped `range` order of magnitude,
   * stated inline so this stays an engine rule rather than a content read. */
  const STORM = {
    range: 300,
    damage: 10,
    intervalMs: 500,
  } as const;

  function strikeStorm(state: GameState, hero: Player): boolean {
    const scratch = { angle: 0, cooldownMs: 0 };
    applyStorm(state, hero, STORM, scratch, 1, () => ({ noMenace: true }));
    return state.events.some((e) => e.type === "lightning");
  }

  it("does not strike a body the player cannot see", () => {
    const state = litStage(startGame());
    const hero = state.players[0];
    hero.view = viewAround(hero.pos);
    // 250px north: inside the storm's reach, on explored ground, off frame.
    state.enemies.push(makeEnemy({ pos: north(state, 250) }));

    expect(strikeStorm(state, hero)).toBe(false);
  });

  it("strikes the same body once it is on frame", () => {
    const state = litStage(startGame());
    const hero = state.players[0];
    hero.view = viewAround(hero.pos);
    state.enemies.push(makeEnemy({ pos: north(state, 60) }));

    expect(strikeStorm(state, hero)).toBe(true);
  });
});

describe("the companions engage only what the hero can see", () => {
  /** A companion formed on the hero, and a fat mob `dist` px north of him —
   * inside the party's 230px engage bubble either way. Returns what the mob had
   * left after a second and a half of standing there. */
  function bubbleBrawl(dist: number, camera: boolean): number {
    const state = litStage(startGame());
    const hero = state.players[0];
    recruitCompanion(state, "test_companion", { ...hero.pos });
    const victim = makeEnemy({
      pos: { x: hero.pos.x, y: hero.pos.y - dist },
      hp: 500,
      maxHp: 500,
    });
    state.enemies.push(victim);
    for (let i = 0; i < 90; i++) {
      step(state, camera ? watching(state) : idle, DT);
    }
    return victim.hp;
  }

  it("leaves a mob inside the bubble but off the frame alone", () => {
    // 110px north is inside the bubble (COMPANIONS.engageRadius is 230) and
    // 13px past the top edge of a landscape phone. With no camera reported the
    // party tears into it; with one, it is something the player cannot see and
    // the party holds off beside a hero holding his own fire.
    expect(COMPANIONS.engageRadius).toBeGreaterThan(110);
    expect(bubbleBrawl(110, false)).toBeLessThan(500);
    expect(bubbleBrawl(110, true)).toBe(500);
  });

  it("still fights the same mob when it is on the frame", () => {
    expect(bubbleBrawl(60, true)).toBeLessThan(500);
  });
});

describe("the autopilot's stand-off knows where the frame ends", () => {
  it("cuts the firing reach at the screen edge, not at the weapon's reach", () => {
    const state = litStage(equipBlaster(startGame()));
    const hero = state.players[0];
    const target = north(state, 400);

    // No camera: the blaster's own 260 reach, uncut.
    expect(firingReach(state, hero, target)).toBeGreaterThan(200);

    // With one, the hero may only fire as far north as the frame goes.
    hero.view = viewAround(hero.pos);
    expect(firingReach(state, hero, target)).toBeCloseTo(97, 0);
  });
});

describe("`nearestEnemy` takes the eyes it picks through", () => {
  it("refuses everything off the owner's screen and picks the best on it", () => {
    const state = litStage(startGame());
    const hero = state.players[0];
    hero.view = viewAround(hero.pos);
    const near = makeEnemy({ id: 1, pos: north(state, 60) });
    const far = makeEnemy({ id: 2, pos: north(state, 150) });
    state.enemies.push(far, near);

    expect(nearestEnemy(state, hero.pos, 400, hero)?.id).toBe(1);
    // The closer one steps off frame and the pick does NOT fall through to the
    // one behind it — that one is off frame too.
    near.pos = north(state, 200);
    expect(nearestEnemy(state, hero.pos, 400, hero)).toBeUndefined();
    // …and with nobody watching, both are fair game again.
    expect(nearestEnemy(state, hero.pos, 400, undefined)?.id).toBe(2);
  });
});

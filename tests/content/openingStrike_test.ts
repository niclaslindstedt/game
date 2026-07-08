// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The scripted opening strike at SpaceZ HQ (LevelDef.openingStrike): the hero
// walks in with his sword holstered, and a lone VANGUARD scientist sprints out
// ahead of the pack to land a harmless first swing — THAT is what draws the
// blade, fires the "good thing I brought the sword" beat (spacez_armed), and
// turns the auto-attack on. Verifies the disarmed state, the ordering gate
// (the sighting read lands first), the no-HP-cost strike, and that a
// non-vanguard touch stays harmless until the beat lands.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  createGame,
  dismissIntro,
  enemyDef,
  skipCutscene,
  step,
  type Enemy,
  type GameState,
} from "@game/core";

import { DT, idle, makeEnemy, SEED, stopWaves } from "../helpers.ts";

/**
 * A SpaceZ HQ run past the opening scenes but with the hero still DISARMED —
 * the real opening. (The shared `startGame` helper arms him on purpose so the
 * other suites test a fighting hero; here we want the holstered state.)
 */
function disarmedHQ(seed = SEED): GameState {
  const state = createGame(seed, "spacez_hq");
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** The lone vanguard the level places (the only mob that can arm the hero). */
function vanguard(state: GameState): Enemy {
  const found = state.enemies.find((e) => e.vanguard);
  if (!found) throw new Error("no vanguard placed");
  return found;
}

/** Strip the board to just the vanguard so no crowd or sighting interferes. */
function isolateVanguard(state: GameState): Enemy {
  stopWaves(state);
  const v = vanguard(state);
  state.enemies = [v];
  return v;
}

/** Tap an open dialogue closed, page by page. */
function tapThrough(state: GameState): void {
  while (state.dialogue) advanceDialogue(state);
}

describe("SpaceZ HQ opening strike", () => {
  it("opens the hero disarmed, and other levels armed", () => {
    expect(disarmedHQ().player.disarmed).toBe(true);
    const moon = createGame(SEED, "moon");
    skipCutscene(moon); // no prelude on the moon — a no-op
    dismissIntro(moon);
    expect(moon.player.disarmed ?? false).toBe(false);
  });

  it("places a lone vanguard that outruns the pack and cannot hurt him", () => {
    const v = vanguard(disarmedHQ());
    const def = enemyDef(v.defId);
    expect(def.role).toBe("minion");
    expect(def.speed).toBeGreaterThan(enemyDef("intern").speed);
    expect(def.contactDamage).toBe(0);
  });

  it("holsters the weapon: no swing while disarmed, even point-blank", () => {
    const state = disarmedHQ();
    isolateVanguard(state);
    // Park a mob the sword would shred right on top of the hero.
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } }, "intern")];
    const before = state.stats.damageDealt;
    for (let i = 0; i < 30; i++) step(state, idle, DT);
    expect(state.stats.damageDealt).toBe(before); // never swung
    expect(state.player.disarmed).toBe(true);
  });

  it("arms the hero on the vanguard's strike — after the sighting beat", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff"); // the gate's prerequisite
    v.pos = { ...state.player.pos }; // in contact
    const hp = state.player.hp;
    step(state, idle, DT);
    expect(state.player.disarmed).toBe(false);
    expect(state.player.hp).toBe(hp); // the first swing costs no HP
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "spacez_armed",
    });
    expect(state.thoughtsSeen).toContain("spacez_armed");
  });

  it("holds the arming until the sighting beat has played (the gate)", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    v.pos = { ...state.player.pos };
    // spacez_staff not seen, and no interns on the board to fire it.
    for (let i = 0; i < 10; i++) step(state, idle, DT);
    expect(state.player.disarmed).toBe(true);
    expect(state.thoughtsSeen).not.toContain("spacez_armed");
    expect(state.dialogue).toBeNull();
  });

  it("keeps a non-vanguard touch harmless while disarmed", () => {
    const state = disarmedHQ();
    stopWaves(state);
    state.thoughtsSeen.push("spacez_staff"); // gate open, so only the mob matters
    // A regular scientist (contactDamage > 0) right on the hero — not the
    // vanguard, so it neither hurts him nor draws the blade.
    state.enemies = [makeEnemy({ pos: { ...state.player.pos } }, "scientist")];
    const hp = state.player.hp;
    for (let i = 0; i < 20; i++) step(state, idle, DT);
    expect(state.player.hp).toBe(hp);
    expect(state.player.disarmed).toBe(true);
    expect(state.dialogue).toBeNull();
  });

  it("resumes normal combat once armed", () => {
    const state = disarmedHQ();
    const v = isolateVanguard(state);
    state.thoughtsSeen.push("spacez_staff");
    v.pos = { ...state.player.pos };
    step(state, idle, DT); // the strike arms him and opens spacez_armed
    tapThrough(state);
    expect(state.phase).toBe("playing");

    // A fresh target in reach now takes sword damage — the weapon is live.
    state.enemies.push(
      makeEnemy(
        {
          id: 9100,
          pos: { x: state.player.pos.x + 10, y: state.player.pos.y },
          hp: 200,
          maxHp: 200,
        },
        "intern",
      ),
    );
    const before = state.stats.damageDealt;
    for (let i = 0; i < 60; i++) step(state, idle, DT);
    expect(state.stats.damageDealt).toBeGreaterThan(before);
  });
});

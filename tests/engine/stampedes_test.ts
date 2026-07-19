// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Employee stampedes (src/game/hazards.ts, stepStampedes): a wall of runners
// that charges right-to-left across the field at great speed, BOWLS minions in
// its band OVER (flung aside AND knocked out for a few seconds — no damage, no
// kill, no XP, no loot, so it can't be farmed and doesn't thin the horde),
// shoves elites/bosses, and — catching the grounded hero — strikes him ONCE (a
// difficulty-scaled max-hp bite AND a knockdown, Player.knockoutMs). A jump
// sails clean over the (thin) wall; a hero already down is never trampled twice.
// It is TELEGRAPHED: a line of approach-dust (state.stampedeWarn) lights along
// the herd's lane over the last (difficulty-scaled) stretch of the countdown.

import { describe, expect, it } from "vitest";

import {
  createGame,
  difficultyDef,
  dismissIntro,
  JUMP,
  skipCutscene,
  STAMPEDES,
  step,
} from "@game/core";
import type { Difficulty, GameState, Stampede } from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

/** A stampede run staged clean with no live herd spawning under the test (the
 * cadence timer parked far out). */
function startStampedes(difficulty: Difficulty = "medium"): GameState {
  const state = createGame(42, "test_stampede_level", difficulty);
  skipCutscene(state);
  dismissIntro(state);
  clearStage(state);
  state.stampedeTimerMs = 999_999;
  return state;
}

/** The bite one herd takes at the run's difficulty — a fraction of max hp. */
function herdBite(state: GameState): number {
  return Math.max(
    1,
    Math.round(
      state.player.maxHp * difficultyDef(state.difficulty).stampedeDamageFrac,
    ),
  );
}

/** A hand-built herd, parked by the test rather than the spawner. */
function makeStampede(
  overrides: Partial<Stampede> & { pos: Stampede["pos"] },
): Stampede {
  return {
    id: 9300,
    speed: 0,
    runners: [],
    struck: false,
    ...overrides,
  };
}

/** Drop a herd right on top of the hero. */
function herdOnHero(state: GameState): Stampede {
  const herd = makeStampede({ pos: { ...state.player.pos } });
  state.stampedes.push(herd);
  return herd;
}

describe("stampedes — spawning", () => {
  it("spawns a five-runner herd on the level's cadence, capped at maxAlive", () => {
    const state = startGame(42, "test_stampede_level");
    clearStage(state);
    expect(state.stampedes).toHaveLength(0);
    run(state, idle, Math.ceil((800 * (STAMPEDES.maxAlive + 3)) / DT));
    expect(state.stampedes.length).toBeGreaterThan(0);
    expect(state.stampedes.length).toBeLessThanOrEqual(STAMPEDES.maxAlive);
    expect(state.stampedes[0]?.runners).toHaveLength(STAMPEDES.runnerCount);
  });

  it("never spawns on levels without stampedes", () => {
    const state = startGame(42, "test_well_level");
    clearStage(state);
    run(state, idle, 200);
    expect(state.stampedes).toHaveLength(0);
  });
});

describe("stampedes — the trample of the hero", () => {
  it("catches the grounded hero: a bite AND a knockdown", () => {
    const state = startStampedes();
    const hpBefore = state.player.hp;
    const bite = herdBite(state);
    herdOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore - bite);
    // The hazard pass runs AFTER the player's knockout tick-down, so the timer
    // is set full this tick and only starts draining next tick.
    expect(state.player.knockoutMs).toBe(STAMPEDES.knockdownMs);
    expect(state.events.some((e) => e.type === "stampedeHit")).toBe(true);
  });

  it("scales the bite by difficulty: 10/15/20/30/40% of the hero's max hp", () => {
    const rungs: [Difficulty, number][] = [
      ["easy", 0.1],
      ["medium", 0.15],
      ["hard", 0.2],
      ["nightmare", 0.3],
      ["jesus", 0.4],
    ];
    for (const [difficulty, frac] of rungs) {
      const state = startStampedes(difficulty);
      const hpBefore = state.player.hp;
      herdOnHero(state);
      step(state, idle, DT);
      const expected = Math.max(1, Math.round(state.player.maxHp * frac));
      expect(hpBefore - state.player.hp, difficulty).toBe(expected);
    }
  });

  it("a jumping hero sails over the whole wall — no strike, no knockdown", () => {
    const state = startStampedes();
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    const hpBefore = state.player.hp;
    herdOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.player.knockoutMs).toBe(0);
  });

  it("never tramples a hero already down — no chain-lock", () => {
    const state = startStampedes();
    state.player.knockoutMs = 400;
    const hpBefore = state.player.hp;
    herdOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.player.knockoutMs).toBeLessThan(400);
  });

  it("strikes only once per herd, even as it charges over him", () => {
    const state = startStampedes();
    const herd = makeStampede({
      pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
      speed: 200,
    });
    state.stampedes.push(herd);
    const hpBefore = state.player.hp;
    // Let it charge across the hero over several ticks.
    run(state, idle, 8);
    // One bite only (the knockdown makes further ticks no-ops anyway).
    expect(hpBefore - state.player.hp).toBe(herdBite(state));
  });
});

describe("stampedes — bowling the horde over", () => {
  it("knocks a minion out instead of killing it — flung, stunned, alive, no farm", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    const minion = makeEnemy({ pos: { x: 1200, y: 800 } });
    state.enemies.push(minion);
    const xpBefore = state.player.xp;
    const killsBefore = state.stats.kills;
    const itemsBefore = state.items.length;
    const hpBefore = minion.hp;
    state.stampedes.push(makeStampede({ pos: { ...minion.pos } }));
    step(state, idle, DT);
    // Survives — bowled over, not killed.
    expect(state.enemies).toContain(minion);
    expect(minion.hp).toBe(hpBefore);
    // Flung aside and left knocked out for a few seconds.
    expect(minion.knockMs).toBeGreaterThan(0);
    expect(minion.knockVel).toBeDefined();
    expect(state.events.some((e) => e.type === "stampedeTrample")).toBe(true);
    // No farm: nothing credited to the player.
    expect(state.player.xp).toBe(xpBefore);
    expect(state.stats.kills).toBe(killsBefore);
    expect(state.items.length).toBe(itemsBefore);
  });

  it("does not re-stun a minion already knocked down (one knockdown per pass)", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    const minion = makeEnemy({ pos: { x: 1200, y: 800 } });
    state.enemies.push(minion);
    // A parked herd (speed 0) sitting on the minion, so it stays in the band.
    state.stampedes.push(makeStampede({ pos: { ...minion.pos } }));
    step(state, idle, DT);
    const stunned = minion.knockMs ?? 0;
    expect(stunned).toBeGreaterThan(0);
    expect(
      state.events.filter((e) => e.type === "stampedeTrample"),
    ).toHaveLength(1);
    // Next tick the herd still overlaps it, but it is NOT re-flung — no fresh
    // trample event, and its stun timer is running DOWN, not reset.
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "stampedeTrample")).toBe(false);
    expect(minion.knockMs ?? 0).toBeLessThan(stunned);
  });

  it("shoves an elite/boss out of the band without killing it", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    const boss = makeEnemy(
      { pos: { x: 1200, y: 800 }, hp: 500, maxHp: 500 },
      "test_boss",
    );
    state.enemies.push(boss);
    const hpBefore = boss.hp;
    state.stampedes.push(makeStampede({ pos: { ...boss.pos } }));
    step(state, idle, DT);
    // Still alive on the board, only nudged aside.
    expect(state.enemies).toContain(boss);
    expect(boss.hp).toBe(hpBefore);
    expect(Math.hypot(boss.pos.x - 1200, boss.pos.y - 800)).toBeGreaterThan(0);
  });
});

/** Step `ticks` times, collecting the intensity of every rumble grain emitted. */
function collectRumbles(state: GameState, ticks: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < ticks; k++) {
    step(state, idle, DT);
    for (const e of state.events) {
      if (e.type === "stampedeRumble") out.push(e.intensity);
    }
  }
  return out;
}

describe("stampedes — the approach is heard before it is seen", () => {
  it("rumbles before any herd appears and swells as the spawn nears", () => {
    // First herd is owed in 800ms (fixture everyMs) — inside the warn window,
    // so the floor rumbles from the very first tick, with no herd on the board.
    const state = startGame(42, "test_stampede_level");
    clearStage(state);
    expect(state.stampedes).toHaveLength(0);
    // 40 ticks (640ms) stays entirely BEFORE the 800ms spawn.
    const rumbles = collectRumbles(state, 40);
    expect(state.stampedes).toHaveLength(0);
    expect(rumbles.length).toBeGreaterThan(0);
    // Starts quiet (below the pre-spawn ceiling) and grows as the wall nears.
    expect(rumbles[0]).toBeGreaterThan(0);
    expect(rumbles[0]).toBeLessThan(STAMPEDES.warnPeak);
    expect(rumbles[rumbles.length - 1]).toBeGreaterThan(rumbles[0]!);
  });

  it("stays silent when no herd is anywhere near due", () => {
    // startStampedes parks the timer far out and clears the board — nothing
    // charging, nothing imminent, so no rumble at all.
    const state = startStampedes();
    expect(collectRumbles(state, 30)).toHaveLength(0);
  });

  it("a charging herd's rumble is louder the closer it is", () => {
    const near = startStampedes();
    near.stampedes.push(
      makeStampede({
        pos: { x: near.player.pos.x + 30, y: near.player.pos.y },
      }),
    );
    const far = startStampedes();
    far.stampedes.push(
      makeStampede({ pos: { x: far.player.pos.x + 500, y: far.player.pos.y } }),
    );
    const nearRumble = collectRumbles(near, 1)[0];
    const farRumble = collectRumbles(far, 1)[0];
    expect(nearRumble).toBeGreaterThan(farRumble!);
  });

  it("emits grains on a cadence, not every tick", () => {
    const state = startStampedes();
    state.stampedes.push(makeStampede({ pos: { ...state.player.pos } }));
    // 5 ticks (80ms) is under one rumble cadence (rumbleEveryMs) — one grain.
    expect(collectRumbles(state, 5)).toHaveLength(1);
  });

  it("never rumbles on a level without stampedes", () => {
    const state = startGame(42, "test_well_level");
    clearStage(state);
    expect(collectRumbles(state, 30)).toHaveLength(0);
  });
});

describe("stampedes — the approach is SEEN before it arrives (dust telegraph)", () => {
  it("lights the dust telegraph before the herd, then mints on that lane", () => {
    const state = startStampedes(); // timer parked far out, board cleared
    expect(state.stampedeWarn).toBeNull();
    // Arm a spawn just inside the lead window.
    state.stampedeTimerMs = 300;
    step(state, idle, DT);
    // The telegraph is up, on a locked lane, with no herd on the board yet.
    expect(state.stampedeWarn).not.toBeNull();
    expect(state.stampedes).toHaveLength(0);
    const laneY = state.stampedeWarn!.y;
    // Ride the countdown out: the herd mints on the telegraphed lane and the
    // spent warn clears.
    run(state, idle, Math.ceil(300 / DT) + 2);
    expect(state.stampedes).toHaveLength(1);
    expect(state.stampedeWarn).toBeNull();
    expect(state.stampedes[0]!.pos.y).toBe(laneY);
  });

  it("gives a longer look on gentle rungs than hard ones (difficulty ramp)", () => {
    const leadFor = (difficulty: Difficulty): number => {
      const state = startStampedes(difficulty);
      state.stampedeTimerMs = 100; // inside every rung's lead window
      step(state, idle, DT);
      return state.stampedeWarn?.leadMs ?? 0;
    };
    const easy = leadFor("easy");
    const hard = leadFor("hard");
    const jesus = leadFor("jesus");
    // easy 1.5× → hard 1.0× → jesus 0.4× the base lead.
    expect(easy).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(jesus);
    expect(easy).toBeCloseTo(STAMPEDES.telegraphMs * 1.5);
    expect(jesus).toBeCloseTo(STAMPEDES.telegraphMs * 0.4);
  });

  it("stays dark when no herd is anywhere near due", () => {
    const state = startStampedes(); // timer parked at 999_999
    run(state, idle, 30);
    expect(state.stampedeWarn).toBeNull();
  });
});

describe("stampedes — charging off the stage", () => {
  it("despawns a herd that has charged clear of the player", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    state.stampedes.push(
      makeStampede({
        pos: { x: 400 - STAMPEDES.despawnDistance - 20, y: 400 },
        speed: 0,
      }),
    );
    step(state, idle, DT);
    expect(state.stampedes).toHaveLength(0);
  });
});

describe("stampedes — the hero lies helpless after a trample", () => {
  it("freezes the trampled hero, then he gets up when the timer lapses", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    herdOnHero(state);
    step(state, idle, DT); // trampled — now down
    expect(state.player.knockoutMs).toBeGreaterThan(0);
    // Steering does nothing while he's down.
    const at = { ...state.player.pos };
    step(state, steerTo(at.x + 400, at.y), DT);
    expect(state.player.pos).toEqual(at);
    // Ride out the knockdown; he recovers and moves again.
    run(state, idle, Math.ceil(STAMPEDES.knockdownMs / DT) + 2);
    expect(state.player.knockoutMs).toBe(0);
    step(state, steerTo(at.x + 400, at.y), DT);
    expect(state.player.pos.x).toBeGreaterThan(at.x);
  });
});

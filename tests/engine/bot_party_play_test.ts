// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW A BOT PLAYS AS A MEMBER OF A PARTY (src/game/bot/party-play.ts): the
// personal SPACING envelope, the SPLIT-THE-PACKS target preference, COVERING a
// downed or bleeding teammate, and the CONVOY that tightens the leash on a
// long march. Each rule is asserted BOTH ways on purpose: the party case
// proves the behaviour exists, and the solo case proves it is a strict no-op —
// the property that keeps every solo measurement byte-identical.

import { describe, expect, it } from "vitest";

import {
  botAct,
  botTuningFor,
  createBot,
  seatHero,
  XP_SHARE,
  type GameInput,
  type GameState,
} from "@game/core";

import {
  allyCoverTarget,
  applyPartySpacing,
  handledByTeammate,
  partyLeash,
} from "../../src/game/bot/party-play.ts";
import { macroTarget } from "../../src/game/bot/macro.ts";
import { bestAimTarget } from "../../src/game/bot/arsenal.ts";
import {
  clearStage,
  equipRangedSidearm,
  makeEnemy,
  startGame,
} from "./helpers.ts";

/** A run with a second hero seated, both parked where the test puts them. */
function party(): GameState {
  const state = startGame(9);
  clearStage(state);
  seatHero(state, null);
  return state;
}

/** A plain steering input toward `target`. */
function steering(x: number, y: number): GameInput {
  return { steering: true, target: { x, y }, jump: false };
}

const TUNE = botTuningFor("test_level");

describe("personal spacing", () => {
  it("pushes two crowded bots apart while both keep their goal", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    // Standing 12px apart — well inside the personal envelope (a hero body is
    // PLAYER.radius = 10, the envelope four of those).
    a.pos = { x: 1000, y: 800 };
    b.pos = { x: 1012, y: 800 };
    // Both march east at the same goal; the adjustment must keep the heading
    // (still east of each hero) while opening the gap between them.
    const forA = steering(1200, 800);
    const forB = steering(1200, 800);
    applyPartySpacing(state, a, forA);
    applyPartySpacing(state, b, forB);
    // a is west of b: pushed further west of the shared goal…
    expect(forA.target.x).toBeLessThan(1200);
    // …and b east of it — the pair peels apart instead of stacking.
    expect(forB.target.x).toBeGreaterThan(1200);
    // The nudge is an offset, not an override: both still travel east.
    expect(forA.target.x).toBeGreaterThan(a.pos.x);
    expect(forB.target.x).toBeGreaterThan(b.pos.x);
  });

  it("leaves a comfortably spaced pair alone", () => {
    const state = party();
    state.players[0]!.pos = { x: 1000, y: 800 };
    state.players[1]!.pos = { x: 1100, y: 800 }; // 100px — outside the envelope
    const input = steering(1200, 800);
    applyPartySpacing(state, state.players[1]!, input);
    expect(input.target).toEqual({ x: 1200, y: 800 });
  });

  it("splits two heroes on the same pixel by seat order, deterministically", () => {
    const state = party();
    state.players[0]!.pos = { x: 1000, y: 800 };
    state.players[1]!.pos = { x: 1000, y: 800 };
    const forA = steering(1000, 600);
    const forB = steering(1000, 600);
    applyPartySpacing(state, state.players[0]!, forA);
    applyPartySpacing(state, state.players[1]!, forB);
    // Seat order is the tie-break — the same pair splits the same way every
    // run, with no rng draw anywhere near it.
    expect(forA.target.x).toBeLessThan(1000);
    expect(forB.target.x).toBeGreaterThan(1000);
  });

  it("is a strict no-op solo and on a deliberate stand", () => {
    const solo = startGame(9);
    clearStage(solo);
    solo.players[0]!.pos = { x: 1000, y: 800 };
    const input = steering(1200, 800);
    applyPartySpacing(solo, solo.players[0]!, input);
    expect(input.target).toEqual({ x: 1200, y: 800 });

    const state = party();
    state.players[0]!.pos = { x: 1000, y: 800 };
    state.players[1]!.pos = { x: 1006, y: 800 };
    const stand: GameInput = {
      steering: false,
      target: { x: 1006, y: 800 },
      jump: false,
    };
    applyPartySpacing(state, state.players[1]!, stand);
    // A branch that decided to PLANT (a breather, the hold) keeps its stand.
    expect(stand.target).toEqual({ x: 1006, y: 800 });
  });
});

describe("split the packs", () => {
  it("reads a foe a nearer engaged teammate is fighting as handled", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 900, y: 800 };
    b.pos = { x: 1300, y: 800 };
    // 20px off b's elbow — b is both nearer and inside the threat ring of it.
    const foe = makeEnemy({ id: 9101, pos: { x: 1320, y: 800 } });
    state.enemies.push(foe);
    expect(handledByTeammate(state, a, foe)).toBe(true);
    // For b itself the only teammate (a) is FARTHER from the foe — not handled.
    expect(handledByTeammate(state, b, foe)).toBe(false);
  });

  it("reads a foe by its quarry even outside the engagement ring", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 500, y: 800 };
    b.pos = { x: 1300, y: 800 };
    // 400px from b — outside the threat ring — but the mob is already chasing
    // seat 1 (`Enemy.quarry`), and b is nearer to it than a.
    const foe = makeEnemy({ id: 9102, pos: { x: 1700, y: 800 }, quarry: 1 });
    state.enemies.push(foe);
    expect(handledByTeammate(state, a, foe)).toBe(true);
  });

  it("never reads anything as handled solo", () => {
    const state = startGame(9);
    clearStage(state);
    const foe = makeEnemy({ id: 9103, pos: { x: 1000, y: 800 }, quarry: 0 });
    state.enemies.push(foe);
    expect(handledByTeammate(state, state.players[0]!, foe)).toBe(false);
  });

  it("aims past a foe a nearer teammate is handling when an alternative exists", () => {
    const state = party();
    equipRangedSidearm(state); // seat 0 shoots (range 260, single bolt)
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 700, y: 1320 };
    b.pos = { x: 870, y: 1320 };
    // The wounded foe at b's elbow would win the finisher pick outright…
    const handled = makeEnemy({
      id: 9104,
      pos: { x: 850, y: 1320 },
      hp: 5,
      maxHp: 45,
    });
    // …and the healthy one on a's own side is the alternative.
    const open = makeEnemy({ id: 9105, pos: { x: 550, y: 1320 } });
    state.enemies.push(handled, open);
    const aim = bestAimTarget(state, a);
    expect(aim).toEqual({ x: open.pos.x, y: open.pos.y });
  });

  it("still shoots the only enemy there is, handled or not", () => {
    const state = party();
    equipRangedSidearm(state);
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 700, y: 1320 };
    b.pos = { x: 870, y: 1320 };
    const only = makeEnemy({
      id: 9106,
      pos: { x: 850, y: 1320 },
      hp: 5,
      maxHp: 45,
    });
    state.enemies.push(only);
    const aim = bestAimTarget(state, a);
    expect(aim).toEqual({ x: only.pos.x, y: only.pos.y });
  });

  it("keeps the solo pick identical", () => {
    const solo = startGame(9);
    clearStage(solo);
    equipRangedSidearm(solo);
    const hero = solo.players[0]!;
    hero.pos = { x: 700, y: 1320 };
    const wounded = makeEnemy({
      id: 9107,
      pos: { x: 850, y: 1320 },
      hp: 5,
      maxHp: 45,
    });
    const fresh = makeEnemy({ id: 9108, pos: { x: 550, y: 1320 } });
    solo.enemies.push(wounded, fresh);
    // Solo there is nobody to defer to: the finisher takes the wounded body.
    expect(bestAimTarget(solo, hero)).toEqual({
      x: wounded.pos.x,
      y: wounded.pos.y,
    });
  });
});

describe("cover the one who is down", () => {
  it("makes a downed teammate the macro goal", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    b.pos = { x: 1600, y: 900 };
    b.hp = 0;
    b.downed = true;
    const bot = createBot("balanced");
    const goal = macroTarget(bot, state, a, TUNE);
    expect(goal).toEqual({ x: 1600, y: 900 });
  });

  it("labels the march for the BOT VIEW readout", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.disarmed = false;
    a.pos = { x: 340, y: 1320 };
    b.pos = { x: 1600, y: 900 };
    b.hp = 0;
    b.downed = true;
    // Nothing on the floor to divert the quiet-field reads.
    state.items = [];
    state.obstacles = state.obstacles.filter((o) => !o.chest);
    const bot = createBot("balanced");
    botAct(bot, state, a);
    expect(bot.lastThought).toBe("COVER ALLY");
  });

  it("holds near a critically low teammate instead of leaving", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 340, y: 1320 };
    b.pos = { x: 500, y: 1320 }; // inside the local threat ring
    b.hp = Math.floor(b.maxHp * 0.3); // under the bot's own bleeding line
    expect(allyCoverTarget(state, a, TUNE)).toEqual({ x: 500, y: 1320 });
    const bot = createBot("balanced");
    expect(macroTarget(bot, state, a, TUNE)).toEqual({ x: 500, y: 1320 });
  });

  it("covers nobody healthy, distant, or solo", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 340, y: 1320 };
    b.pos = { x: 500, y: 1320 };
    // Healthy neighbour: no cover read.
    expect(allyCoverTarget(state, a, TUNE)).toBeNull();
    // Bleeding but a screen and a half away: the leash owns that case.
    b.hp = Math.floor(b.maxHp * 0.3);
    b.pos = { x: 1600, y: 200 };
    expect(allyCoverTarget(state, a, TUNE)).toBeNull();

    const solo = startGame(9);
    clearStage(solo);
    expect(allyCoverTarget(solo, solo.players[0]!, TUNE)).toBeNull();
  });
});

describe("travel as a group", () => {
  it("tightens the leash on a long march and keeps it latched", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 400, y: 1320 };
    b.pos = { x: 1000, y: 1320 }; // 600 apart — inside the loose ring
    const bot = createBot("balanced");
    // A NEAR goal: the ordinary ring (0.9 × XP_SHARE.radius = 630) tolerates
    // the 600px gap, so no pull.
    expect(partyLeash(bot, state, a, { x: 500, y: 1320 })).toBeNull();
    expect(bot.convoying ?? false).toBe(false);
    // A FAR goal (the boss's corner, ~2100px — beyond two share radii):
    // the convoy latches, the ring halves, and 600px is now out of line.
    const far = { x: 2200, y: 260 };
    expect(partyLeash(bot, state, a, far)).toEqual({ x: 1000, y: 1320 });
    expect(bot.convoying).toBe(true);
    expect(bot.regrouping).toBe(true);
    // Hysteresis: a goal back inside two radii (but not yet inside 1.5) keeps
    // the convoy — the ring must not flap with every re-pick on the way.
    const mid = { x: a.pos.x + XP_SHARE.radius * 1.7, y: a.pos.y };
    expect(partyLeash(bot, state, a, mid)).toEqual({ x: 1000, y: 1320 });
    expect(bot.convoying).toBe(true);
    // Arrived beside the teammate with a near goal: both latches release.
    a.pos = { x: 950, y: 1320 };
    expect(partyLeash(bot, state, a, { x: 1000, y: 1320 })).toBeNull();
    expect(bot.regrouping).toBe(false);
    expect(bot.convoying).toBe(false);
  });

  it("is a strict no-op solo, however far the goal", () => {
    const solo = startGame(9);
    clearStage(solo);
    const bot = createBot("balanced");
    expect(partyLeash(bot, solo, solo.players[0]!, { x: 2200, y: 260 })).toBe(
      null,
    );
    // Solo the latches are never even touched.
    expect(bot.regrouping).toBeUndefined();
    expect(bot.convoying).toBeUndefined();
  });
});

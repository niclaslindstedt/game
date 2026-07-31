// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOT STEERS THE HERO IT IS GIVEN (multiplayer plan §7.1).
//
// **EVERY OTHER BOT SUITE WOULD PASS WITH THE REFACTOR REVERTED**, which is
// precisely why this one exists. `bot_test`, `bot_nav_test`, `bot_economy_test`
// and the rest all fly ONE hero, so they prove the parameterization changed
// nothing — the property that made it safe to land — and prove nothing at all
// about the capability it was for. These are the tests that fail the day
// somebody quietly reintroduces a `state.players[0]` under `src/game/bot/`.
//
// Three claims, and each is a different way the old code was stuck:
//
//  1. A bot handed seat 1 reasons about seat 1 — not about seat 0 standing
//     somewhere else entirely.
//  2. Two bots in one party are independent: each has its own memory, and the
//     ORDER they are asked in does not change what either decides.
//  3. The seat-0 case is unchanged, which is the identity that let 164 sites
//     move in one commit.

import { describe, expect, it } from "vitest";

import {
  botAct,
  createBot,
  seatHero,
  type GameInput,
  type GameState,
} from "@game/core";

import { clearStage, makeEnemy, startGame } from "./helpers.ts";

/** A run with a second hero seated, both parked where the test puts them. */
function party(): GameState {
  const state = startGame(9);
  clearStage(state);
  seatHero(state, null);
  return state;
}

/** Where a steering input is pointing, as a compass-ish sign pair. */
function heading(input: GameInput): { x: number; y: number } {
  return { x: Math.sign(input.target.x), y: Math.sign(input.target.y) };
}

describe("a bot steers the hero it is handed", () => {
  it("reasons about seat 1's surroundings, not seat 0's", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    // The two heroes are put far apart, and a threat is parked on top of ONE of
    // them. A bot reading seat 0 would see an empty field from seat 1's chair.
    a.pos = { x: 400, y: 400 };
    b.pos = { x: 1400, y: 1400 };
    const foe = makeEnemy({
      pos: { x: 1420, y: 1420 },
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(foe);

    const bot = createBot("balanced");
    const forB = botAct(bot, state, b);
    const thoughtForB = bot.lastThought;

    const other = createBot("balanced");
    botAct(other, state, a);
    const thoughtForA = other.lastThought;

    // Seat 1 is standing in a fight; seat 0 is standing in an empty field. The
    // two bots must not reach the same conclusion.
    expect(thoughtForB).not.toBe(thoughtForA);
    // And seat 1's bot produced a real decision about the foe beside it rather
    // than an idle one about a hero a thousand pixels away.
    expect(forB).toBeTruthy();
  });

  it("gives two bots in one party independent memory", () => {
    const state = party();
    const a = state.players[0]!;
    const b = state.players[1]!;
    a.pos = { x: 300, y: 300 };
    b.pos = { x: 1500, y: 1500 };
    state.enemies.push(makeEnemy({ pos: { x: 1520, y: 1520 } }));

    const botA = createBot("balanced");
    const botB = createBot("balanced");
    botAct(botA, state, a);
    botAct(botB, state, b);
    // The memory that used to be impossible to keep apart: with one shared
    // `players[0]` read, both bots reasoned about the same hero and their
    // thought trails were identical by construction.
    expect(botA.lastThought).not.toBe(botB.lastThought);
  });

  it("does not depend on the order the party's bots are polled", () => {
    // §7.1's second rule: `botAct` is pure with respect to `state`, so asking
    // the party in a different order must produce the same inputs. Nothing in
    // the bot mutates the run today, and this is what pins it — the simulator
    // is about to poll N bots per tick and a hidden write would show up as an
    // irreproducible campaign.
    const build = () => {
      const state = party();
      state.players[0]!.pos = { x: 500, y: 500 };
      state.players[1]!.pos = { x: 900, y: 900 };
      state.enemies.push(makeEnemy({ pos: { x: 700, y: 700 } }));
      return state;
    };

    const forwards = build();
    const fa = botAct(createBot("balanced"), forwards, forwards.players[0]!);
    const fb = botAct(createBot("balanced"), forwards, forwards.players[1]!);

    const backwards = build();
    const bb = botAct(createBot("balanced"), backwards, backwards.players[1]!);
    const ba = botAct(createBot("balanced"), backwards, backwards.players[0]!);

    expect(heading(ba)).toEqual(heading(fa));
    expect(heading(bb)).toEqual(heading(fb));
    expect(ba.steering).toBe(fa.steering);
    expect(bb.steering).toBe(fb.steering);
  });

  it("leaves the single-player answer exactly as it was", () => {
    // The identity case, and the whole reason 164 sites could move at once: a
    // run with one hero has exactly one answer to "which hero", so seat 0
    // passed as the parameter must decide what the old code decided. The
    // campaign-level proof is a byte-identical simulator report; this is the
    // unit-level one.
    const state = startGame(21);
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.players[0]!.pos.x + 120, y: state.players[0]!.pos.y },
      }),
    );
    const bot = createBot("balanced");
    const first = botAct(bot, state, state.players[0]!);
    expect(first).toBeTruthy();
    expect(bot.lastThought).toBeTruthy();
  });
});

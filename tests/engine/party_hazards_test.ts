// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE WEATHER IS AIMED WHEN THERE IS A PARTY (`hazardFocus`,
// engine/game/hazards.ts) — and the autopilot's one party rule, the LEASH
// (engine/game/bot/party-play.ts). Both landed together, because the first was
// found BY the instrument the second makes usable.
//
// **THE BUG THESE PIN WAS INVISIBLE TO EVERY SUITE IN THE REPO, and the reason
// is worth stating once.** Every ambient hazard was laid down on
// `partyCentroid`, and every one of them carried a comment saying — correctly —
// that with one hero the centroid IS that hero. That is exactly why no test
// caught it: the whole suite flies one hero, so the party case had no reader at
// all until the party simulator grew one. Flying a party of two on the moon landed
// 2 kills over three minutes where the same seed solo landed 128.
//
// So these are the tests that fail if either rule is quietly reverted, and both
// are written against a PARTY on purpose: a single-hero assertion here would
// pass with the whole change backed out.

import { describe, expect, it } from "vitest";

import {
  ASTEROIDS,
  botAct,
  createBot,
  createGame,
  dismissIntro,
  seatHero,
  skipCutscene,
  step,
  XP_SHARE,
} from "@game/core";
import type { GameState, Player } from "@game/core";

import { clearStage, DT, idle, startGame } from "./helpers.ts";

/** The asteroid-rain arena with `extra` heroes seated beside the first. */
function rainWithParty(extra: number): GameState {
  const state = createGame(42, "test_asteroid_level");
  skipCutscene(state);
  dismissIntro(state);
  clearStage(state);
  for (let i = 0; i < extra; i++) seatHero(state, null);
  return state;
}

/** Park the party's heroes at the given spots and hold them there. */
function station(state: GameState, spots: { x: number; y: number }[]): void {
  state.players.forEach((hero, seat) => {
    const spot = spots[seat];
    if (spot) hero.pos = { x: spot.x, y: spot.y };
  });
}

/** Every rock the rain lays down over `ticks`, by where it was AIMED. */
function rainTargets(
  state: GameState,
  ticks: number,
  spots: { x: number; y: number }[],
): { x: number; y: number }[] {
  const seen: { x: number; y: number }[] = [];
  for (let i = 0; i < ticks; i++) {
    // The heroes are held still: this measures the SPAWNER's aim, not a chase.
    station(state, spots);
    step(state, idle, DT);
    for (const rock of state.asteroids) {
      if (!seen.some((t) => t.x === rock.target.x && t.y === rock.target.y))
        seen.push({ x: rock.target.x, y: rock.target.y });
    }
  }
  return seen;
}

/** How near `t` came to the nearest of `spots`. */
function nearestSpot(
  t: { x: number; y: number },
  spots: { x: number; y: number }[],
): number {
  return Math.min(...spots.map((s) => Math.hypot(t.x - s.x, t.y - s.y)));
}

describe("an ambient hazard is aimed at a hero", () => {
  it("still rains on the one hero a single-player run has", () => {
    // The identity case. Nothing about a solo run may move: one hero in play
    // has exactly one answer, and the roll is skipped rather than answered —
    // spending a `state.rng` draw here would shift every roll after it in every
    // seeded measurement in the repo.
    const state = rainWithParty(0);
    const spot = { x: 900, y: 700 };
    const targets = rainTargets(state, 400, [spot]);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(nearestSpot(t, [spot])).toBeLessThanOrEqual(
        ASTEROIDS.targetJitter * Math.SQRT2 + 1,
      );
    }
  });

  it("never falls in the empty middle of a spread party", () => {
    // The bug in its clearest form. Two heroes at opposite ends of a hall have
    // a centroid nobody is standing on, so a rain aimed there falls where
    // nothing is happening — the hazard simply stops existing for the party
    // that spread out, and lands on EVERY head of the party that did not.
    const state = rainWithParty(1);
    const spots = [
      { x: 500, y: 700 },
      { x: 1900, y: 700 },
    ];
    const targets = rainTargets(state, 600, spots);
    expect(targets.length).toBeGreaterThan(2);
    const middle = { x: 1200, y: 700 };
    for (const t of targets) {
      // Every rock is somebody's rock…
      expect(nearestSpot(t, spots)).toBeLessThanOrEqual(
        ASTEROIDS.targetJitter * Math.SQRT2 + 1,
      );
      // …and none of them is the centroid's.
      expect(Math.hypot(t.x - middle.x, t.y - middle.y)).toBeGreaterThan(
        ASTEROIDS.targetJitter,
      );
    }
  });

  it("shares the weather out rather than picking on the host", () => {
    // The roll has to be a roll. Aiming every rock at seat 0 would keep the
    // per-hero rate honest for the host and hand everybody else a map with no
    // weather on it — the same defect as the centroid, wearing the other face.
    const state = rainWithParty(1);
    const spots = [
      { x: 500, y: 700 },
      { x: 1900, y: 700 },
    ];
    const targets = rainTargets(state, 1200, spots);
    const mine = targets.filter(
      (t) => nearestSpot(t, [spots[0]!]) < nearestSpot(t, [spots[1]!]),
    ).length;
    expect(mine).toBeGreaterThan(0);
    expect(targets.length - mine).toBeGreaterThan(0);
  });
});

describe("the autopilot's party leash", () => {
  /** A two-hero run with the party parked where the test puts it. */
  function leashed(a: Player["pos"], b: Player["pos"]): GameState {
    const state = startGame(9);
    clearStage(state);
    seatHero(state, null);
    state.players[0]!.pos = { ...a };
    state.players[1]!.pos = { ...b };
    return state;
  }

  it("leaves a soloist alone", () => {
    // A single-player run has nobody to be away from, so nothing about its
    // travel plan may change — which is the property that let this land in the
    // same commit as a measurement everybody reads.
    const state = startGame(9);
    clearStage(state);
    const bot = createBot("balanced");
    for (let i = 0; i < 120; i++) {
      botAct(bot, state, state.players[0]!);
      step(state, idle, DT);
    }
    expect(bot.regrouping).toBeFalsy();
  });

  it("latches once a hero is out of the share ring, and holds", () => {
    // The number is `XP_SHARE.radius` rather than a distance somebody typed: it
    // is where a hero stops sharing in a kill, so past it the bot is not merely
    // out of position, it is spending the party's payout.
    const far = XP_SHARE.radius * 2;
    const state = leashed({ x: 400, y: 400 }, { x: 400 + far, y: 400 });
    const bot = createBot("balanced");
    botAct(bot, state, state.players[0]!);
    expect(bot.regrouping).toBe(true);

    // Hysteresis: back INSIDE the ring but not yet comfortably in it, the walk
    // home is still on. Releasing at the pull distance would leave the hero
    // oscillating on the boundary for the whole run.
    state.players[1]!.pos = { x: 400 + XP_SHARE.radius * 0.75, y: 400 };
    botAct(bot, state, state.players[0]!);
    expect(bot.regrouping).toBe(true);

    // Comfortably back with the party — the soloist's own reads own the run
    // again.
    state.players[1]!.pos = { x: 460, y: 400 };
    botAct(bot, state, state.players[0]!);
    expect(bot.regrouping).toBe(false);
  });

  it("does not walk to a body nobody is behind", () => {
    // `heroInPlay`, not `hp > 0`: a departed seat is a hero the world has
    // stopped answering for, and marching across the map to stand beside one is
    // exactly the ghost-following that predicate exists to stop.
    const far = XP_SHARE.radius * 2;
    const state = leashed({ x: 400, y: 400 }, { x: 400 + far, y: 400 });
    state.players[1]!.departed = true;
    const bot = createBot("balanced");
    botAct(bot, state, state.players[0]!);
    expect(bot.regrouping).toBeFalsy();
  });
});

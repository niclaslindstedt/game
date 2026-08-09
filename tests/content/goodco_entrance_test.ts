// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GOODCO HQ'S FRONT DOOR — the campaign's first venue, as it actually carves.
//
// The engine rule is pinned on a synthetic lot (`tests/engine/arrivals_test.ts`);
// this suite is about THIS map, and every assertion in it is a way the shipped
// mission could become UNSTARTABLE without anything else going red:
//
//   • the lot carves with an entrance in it, and a plan to reach it, ON EVERY
//     SEED — the geometry is rolled, so a rule that holds on seed 42 and not on
//     seed 43 is a mission that fails one player in two;
//   • nothing ambient stands on the tarmac, and everybody who does is neutral;
//   • no rampage gate is laced outdoors;
//   • the scripted first blow waits INSIDE, past the doors;
//   • and the whole thing plays out — badge, doors, the walk in, the blade —
//     with the AUTOPILOT driving, which is the only end-to-end proof that the
//     level can still be finished.

import { describe, expect, it } from "vitest";

import {
  botAct,
  createBot,
  createGame,
  dismissIntro,
  enemyDef,
  muteDialogue,
  runLevelDef,
  skipCutscene,
  step,
  type GameState,
} from "@game/core";

import { DT } from "../helpers.ts";

/** How far a point sits off a line segment — the honest way to ask whether a
 * prop is standing in somebody's walk. */
function distToSeg(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Enough seeds that a rolled floor plan cannot hide a hole in the rule, few
 * enough that the suite stays a suite rather than a soak. */
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 11, 17, 23, 31, 42];

function hq(seed: number): GameState {
  const state = createGame(seed, "goodco_hq");
  skipCutscene(state);
  dismissIntro(state);
  muteDialogue(state);
  return state;
}

describe("GOODCO HQ's staff lot", () => {
  it("carves a way in, and a plan to reach it, on every seed", () => {
    for (const seed of SEEDS) {
      const state = hq(seed);
      const def = runLevelDef(state);
      const entrances = (def.doors ?? []).filter((d) => d.id === "entrance");
      expect(entrances.length, `seed ${seed}: no entrance`).toBeGreaterThan(0);
      expect(def.arrivalLot?.length, `seed ${seed}: no lot`).toBeGreaterThan(0);
      const plan = state.arrivalPlan;
      expect(plan, `seed ${seed}: no plan`).not.toBeNull();
      expect(plan?.bays.length, `seed ${seed}: no bays`).toBeGreaterThan(0);
      // EVERY leaf of it is shut, and none of them opens on approach: the whole
      // point is that walking up to the building does nothing.
      for (const door of entrances) expect(door.opens).not.toBe("approach");
    }
  });

  it("stands nobody on the tarmac who is in the fight", () => {
    for (const seed of SEEDS) {
      const state = hq(seed);
      const lot = runLevelDef(state).arrivalLot;
      expect(lot).toBeDefined();
      if (!lot) continue;
      const onLot = state.enemies.filter((e) =>
        lot.some(
          (z) =>
            z.shape === "rect" &&
            e.pos.x >= z.rect.x &&
            e.pos.x <= z.rect.x + z.rect.width &&
            e.pos.y >= z.rect.y &&
            e.pos.y <= z.rect.y + z.rect.height,
        ),
      );
      for (const body of onLot) {
        expect(
          enemyDef(body.defId).disposition,
          `seed ${seed}: ${body.defId} is standing on the lot`,
        ).toBe("neutral");
      }
      // …and the guards really are out there. The lot with nobody on it is a
      // car park, not a place somebody is watching.
      expect(
        onLot.filter((e) => e.defId === "parking_guard").length,
        `seed ${seed}: no parking guards`,
      ).toBeGreaterThan(0);
    }
  });

  it("laces no rampage gate outdoors", () => {
    for (const seed of SEEDS) {
      const state = hq(seed);
      const lot = runLevelDef(state).arrivalLot ?? [];
      for (const spawner of state.spawners) {
        // A HELLGATE is a spawn point with a rampage stage on it — the one
        // thing outdoors would have to answer for, since it never drains.
        if (spawner.openStage === undefined) continue;
        const outside = lot.some(
          (z) =>
            z.shape === "rect" &&
            spawner.at.x >= z.rect.x &&
            spawner.at.x <= z.rect.x + z.rect.width &&
            spawner.at.y >= z.rect.y &&
            spawner.at.y <= z.rect.y + z.rect.height,
        );
        expect(outside, `seed ${seed}: hellgate on the staff lot`).toBe(false);
      }
    }
  });

  it("waits with the first blow until he is inside", () => {
    for (const seed of SEEDS) {
      const state = hq(seed);
      const def = runLevelDef(state);
      const lot = def.arrivalLot ?? [];
      const at = def.openingStrike?.at;
      expect(at).toBeDefined();
      if (!at) continue;
      const onLot = lot.some(
        (z) =>
          z.shape === "rect" &&
          at.x >= z.rect.x &&
          at.x <= z.rect.x + z.rect.width &&
          at.y >= z.rect.y &&
          at.y <= z.rect.y + z.rect.height,
      );
      expect(onLot, `seed ${seed}: the rusher is on the tarmac`).toBe(false);
    }
  });

  it("stands the gatehouse beside the gate, clear of the walk", () => {
    // WITHOUT IT THE WAY IN IS A SLAB OF WALL that occasionally slides aside,
    // and the player has no way to know the door is CONTROLLED rather than
    // stuck. Two ways it goes missing and both are silent: the doorway is a hole
    // in a WALL, so a kiosk placed flush beside it is a kiosk inside somebody's
    // masonry and is simply dropped; and the footpath runs down the apron's own
    // line, so a kiosk on the bay side is one every arriving staffer walks
    // through — an arrival does not collide with anything, so nothing would even
    // stop it.
    for (const seed of SEEDS) {
      const state = hq(seed);
      const plan = state.arrivalPlan;
      expect(plan, `seed ${seed}: no plan`).not.toBeNull();
      if (!plan) continue;
      const booth = state.obstacles.filter((o) => o.sprite === "gate_booth");
      expect(booth.length, `seed ${seed}: no gatehouse`).toBe(1);
      const at = booth[0]!.pos;
      // Beside the gate — near enough to read as its box, far enough not to
      // stand in the doorway.
      const gap = Math.hypot(at.x - plan.door.x, at.y - plan.door.y);
      expect(gap, `seed ${seed}`).toBeGreaterThan(20);
      expect(gap, `seed ${seed}`).toBeLessThan(160);
      // …and CLEAR OF THE FOOTPATH, which is the half of this that fails
      // silently: an arrival walks its route with no collision at all, so a
      // kiosk standing on that line is not a body that gets stuck, it is a body
      // that walks through a building.
      const path = [
        [
          { x: plan.entryX, y: plan.walkY },
          { x: plan.apron.x, y: plan.walkY },
        ],
        [{ x: plan.apron.x, y: plan.walkY }, plan.apron],
        [plan.apron, plan.door],
      ] as const;
      const clearance = Math.min(...path.map(([a, b]) => distToSeg(at, a, b)));
      expect(
        clearance,
        `seed ${seed}: the kiosk is in the walk`,
      ).toBeGreaterThan(booth[0]!.radius + 8);
    }
  });

  it("keeps the read on the floor from firing out on the tarmac", () => {
    // "EVERY DESK'S MANNED. EVERY LAB LIT." is a line about the inside of a
    // building, and a sighting is plain distance — so the crowd standing a step
    // past the doorway is within the beat's own radius of a man on the car park
    // the instant a badge opens the gate. `inside` on the trigger is what holds
    // it, and this is the assertion that says so about the shipped map.
    //
    // It also covers the FIRST BLOW, which waits on this same read
    // (`openingStrike.after`): a scientist that broke cover early would be
    // sprinting out onto the lot to beat a holstered man in front of two
    // parking guards.
    for (const seed of SEEDS) {
      const state = hq(seed);
      const plan = state.arrivalPlan;
      expect(plan, `seed ${seed}: no plan`).not.toBeNull();
      if (!plan) continue;
      const bot = createBot("balanced");
      // Which side of the doorway the hero is on, measured down the plan's own
      // normal — positive is the building.
      const nx = plan.inside.x - plan.door.x;
      const ny = plan.inside.y - plan.door.y;
      let readAt = -1;
      for (let t = 0; t < 90_000 / DT; t++) {
        step(state, [botAct(bot, state, state.players[0]!)], DT);
        if (state.thoughtsSeen.includes("goodco_staff")) {
          const hero = state.players[0]!;
          readAt =
            (hero.pos.x - plan.door.x) * nx + (hero.pos.y - plan.door.y) * ny;
          break;
        }
      }
      expect(readAt, `seed ${seed}: never read the floor`).not.toBe(-1);
      expect(readAt, `seed ${seed}: read it from the car park`).toBeGreaterThan(
        0,
      );
    }
  }, 60_000);

  it("lets the autopilot follow somebody in and get armed", () => {
    // THE ONE TEST THAT PROVES THE LEVEL IS STILL PLAYABLE. Everything above is
    // geometry; this is the run: the bot lands on the lot holstered, waits for
    // somebody with a card, walks in behind them, and takes the scripted blow
    // that draws the blade. If any link in that chain breaks the campaign opens
    // on a hero standing in a car park for the rest of the clock — which is
    // exactly what it did, twice, while this was being built.
    for (const seed of SEEDS) {
      const state = hq(seed);
      const bot = createBot("balanced");
      let badged = -1;
      let armed = -1;
      for (let t = 0; t < 90_000 / DT; t++) {
        step(state, [botAct(bot, state, state.players[0]!)], DT);
        if (badged < 0 && state.events.some((e) => e.type === "badgeSwiped")) {
          badged = t;
        }
        if (armed < 0 && !state.players[0]!.disarmed) armed = t;
        if (armed >= 0) break;
      }
      expect(badged, `seed ${seed}: nobody ever badged in`).toBeGreaterThan(0);
      expect(armed, `seed ${seed}: never armed`).toBeGreaterThan(0);
      // The badge comes FIRST. Armed before it would mean the scene played on
      // the wrong side of a door that was never opened.
      expect(armed).toBeGreaterThan(badged);
    }
  }, 60_000);
});

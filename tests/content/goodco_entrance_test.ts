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
  ARRIVALS,
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

import { DT, idle } from "../helpers.ts";

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

  it("stages the whole beat where he lands, on every seed", () => {
    // THE MISSION'S OPENING READ IS A THING TO WATCH, and for a long time it
    // was only a thing that HAPPENED. The entrance lands wherever the carve
    // punches it and the lot's landing wherever its middle falls, so the rank
    // anchored on the doorway sat 150–690 px from the hero on ten of these
    // twelve seeds: he touched down, thought "that's the night shift clocking
    // on" about a car park with nothing on it, and had to go and find the beat
    // that exists to stop him searching. `stageIt` (engine/game/arrivals.ts)
    // answers it by laying the lane and the rank around the LANDING instead —
    // and this is the assertion that says so about the shipped map, seed by
    // seed, because a rolled floor plan is exactly where it went wrong.
    for (const seed of SEEDS) {
      const state = hq(seed);
      const plan = state.arrivalPlan;
      expect(plan, `seed ${seed}: no plan`).not.toBeNull();
      if (!plan) continue;
      const at = runLevelDef(state).playerSpawn;
      const bay = plan.bays[0] as number;
      expect(
        Math.abs(bay - at.x),
        `seed ${seed}: the first bay is off his screen`,
      ).toBeLessThanOrEqual(ARRIVALS.watchReach);
      expect(
        Math.abs(plan.laneY - at.y),
        `seed ${seed}: the lane runs off his screen`,
      ).toBeLessThanOrEqual(ARRIVALS.watchReach);
      // …and the car still ARRIVES rather than appearing: no kerb on this map
      // is inside what he can see from where he stands. The tighter rule — a
      // run-in that starts off his SCREEN, `ARRIVALS.arriveGap` — is what a
      // PULLED staging is held to and is pinned on the fixture next door; this
      // is the weaker one that has to hold however the lot was staged, and it
      // is the one a carve could break by dropping a lot boundary on the
      // landing's own row.
      expect(
        Math.abs(plan.entryX - at.x),
        `seed ${seed}: the car is minted in plain sight`,
      ).toBeGreaterThan(ARRIVALS.watchReach);
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
      // that walks through a building. The walk now ENDS at the kiosk's window
      // (`ArrivalPlan.reader`) rather than at the doorway, so the legs measured
      // are the ones he crosses the tarmac on; the last one is the dogleg from
      // the glass to the gate, which is supposed to start beside the box.
      const path = [
        [
          { x: plan.entryX, y: plan.walkY },
          { x: plan.reader.x, y: plan.walkY },
        ],
        [{ x: plan.reader.x, y: plan.walkY }, plan.reader],
      ] as const;
      const clearance = Math.min(...path.map(([a, b]) => distToSeg(at, a, b)));
      expect(
        clearance,
        `seed ${seed}: the kiosk is in the walk`,
      ).toBeGreaterThan(booth[0]!.radius + 8);
    }
  });

  it("blips the card at the guard box, not at the gate", () => {
    // THE KIOSK IS THE POINT OF THE KIOSK. A gate is not a door with a lock on
    // it — it is a lit box with somebody sitting in it, and the way through is
    // to go and be seen by them. While the walk ended at the middle of the
    // doorway the box was scenery: the badge read as something the DOOR did,
    // and the one sentence the venue is built to say ("somebody decides who
    // comes through here") was told by a sprite nobody ever walked to.
    for (const seed of SEEDS) {
      const state = hq(seed);
      const plan = state.arrivalPlan;
      expect(plan, `seed ${seed}: no plan`).not.toBeNull();
      if (!plan) continue;
      const booth = state.obstacles.find((o) => o.sprite === "gate_booth");
      expect(booth, `seed ${seed}: no gatehouse`).toBeDefined();
      if (!booth) continue;
      const toBox = Math.hypot(
        plan.reader.x - booth.pos.x,
        plan.reader.y - booth.pos.y,
      );
      // AT the window: past the glass, and not so far off it that he is simply
      // standing on the tarmac near a box.
      expect(
        toBox,
        `seed ${seed}: the card is blipped nowhere near the box`,
      ).toBeLessThan(booth.radius + 28);
      // …and OUT of it. An arrival is a real neutral and the separation pass
      // shoves it out of furniture, so a reader inside the kiosk is a staffer
      // pushed back out of it every tick who then badges from wherever he
      // landed.
      expect(
        toBox,
        `seed ${seed}: the reader is inside the kiosk`,
      ).toBeGreaterThan(booth.radius + 8);
      // …and it is NOT the doorway. Same point as the apron would be a change
      // that compiles, passes every other assertion here, and quietly puts the
      // beat back where it was.
      const toGate = Math.hypot(
        plan.reader.x - plan.door.x,
        plan.reader.y - plan.door.y,
      );
      expect(
        toGate,
        `seed ${seed}: the card is blipped at the gate`,
      ).toBeGreaterThan(
        Math.hypot(plan.apron.x - plan.door.x, plan.apron.y - plan.door.y),
      );
    }
  });

  it("hangs a person-width gate, whatever district the lot landed beside", () => {
    // A DOORWAY'S WIDTH IS OTHERWISE THE ROOM'S, and the room on the far side of
    // this one is whichever the carve put the staff lot against — so the front
    // of GOODCO used to be a 220px hangar opening on every seed that landed the
    // lot beside an assembly bay: thirteen slabs of door, which is a wall with a
    // piece missing rather than a gate. `opening` on the door object is what
    // makes it one object at one size wherever the floor plan puts it.
    for (const seed of SEEDS) {
      const state = hq(seed);
      const def = runLevelDef(state);
      for (const door of (def.doors ?? []).filter((d) => d.id === "entrance")) {
        const width = Math.hypot(
          door.to.x - door.from.x,
          door.to.y - door.from.y,
        );
        expect(width, `seed ${seed}: the gate is ${width}px wide`).toBe(48);
      }
      // …and the building's own doors are the same door. A ladder of widths up
      // to a hangar's is what this replaced.
      for (const door of (def.doors ?? []).filter((d) => d.id !== "entrance")) {
        const width = Math.hypot(
          door.to.x - door.from.x,
          door.to.y - door.from.y,
        );
        expect(width, `seed ${seed}: ${door.id} is ${width}px wide`).toBe(48);
      }
    }
  });

  it("draws the gate open while it is open, and takes it back when it shuts", () => {
    // A GATE HAS TWO MODES AND HAS TO SHOW BOTH. Shut, it is its own obstacle
    // chain — that half was never in doubt. OPEN was drawn as NOTHING: the slats
    // came off the field and the doorway reverted to a hole, so "the way in is
    // open right now" was a fact the player could only learn by walking at it.
    // The leaves have to come back OUT of the jambs too, or the gate stands shut
    // with a pair of open leaves beside it and a fresh pair after every badge.
    const state = hq(1);
    const gate = state.doors.find((d) => d.id === "entrance");
    expect(gate).toBeDefined();
    if (!gate) return;
    const leaves = (): number =>
      state.decor.filter((d) => d.kind === gate.openSprite).length;
    expect(leaves(), "leaves before it ever opened").toBe(0);
    let opened = false;
    let sawLeaves = false;
    for (let t = 0; t < 90_000 / DT; t++) {
      step(state, [idle], DT);
      if (gate.open) {
        opened = true;
        if (leaves() > 0) sawLeaves = true;
      } else if (opened) break;
    }
    expect(opened, "the gate never opened").toBe(true);
    expect(sawLeaves, "the gate opened and drew nothing").toBe(true);
    // Shut again (the hero never went near it, so nothing held the clock), and
    // the jambs are empty.
    expect(gate.open, "the gate never shut").toBe(false);
    expect(leaves(), "open leaves left standing beside a shut gate").toBe(0);
  }, 30_000);

  it("tells him to wait for the next one when he watches one go in", () => {
    // THE GATE IS A MOMENT, AND MISSING IT IS THE ORDINARY FIRST OUTCOME. What
    // the level could not say for itself is what a miss MEANS: the way in opened,
    // shut, and went back to being a wall, with nothing out on the quiet tarmac
    // to tell the player "wait for the next car" from "that was never the way
    // in". This is the line that does, and it only fires on somebody still
    // standing outside.
    const state = createGame(1, "goodco_hq");
    skipCutscene(state);
    dismissIntro(state);
    muteDialogue(state);
    const missed = runLevelDef(state).arrivals?.missedThought;
    expect(missed, "the level authors no missed-gate beat").toBeDefined();
    if (!missed) return;
    // The hero does nothing at all — which is exactly the player this is for.
    let read = -1;
    for (let t = 0; t < 90_000 / DT; t++) {
      step(state, [idle], DT);
      if (state.thoughtsSeen.includes(missed)) {
        read = t * DT;
        break;
      }
    }
    expect(read, "he watched somebody go in and said nothing").toBeGreaterThan(
      0,
    );
    // …behind the arrival read, which explains who these people are. Said the
    // other way round, "and there they go" lands before anybody has been
    // introduced.
    const first = runLevelDef(state).arrivals?.thought;
    expect(first).toBeDefined();
    if (first) expect(state.thoughtsSeen).toContain(first);
    expect(state.thoughtsSeen.indexOf(missed)).toBeGreaterThan(
      state.thoughtsSeen.indexOf(first as string),
    );
  }, 30_000);

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

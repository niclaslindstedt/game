// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH HALF OF THE EFFECT LAYER AN EFFECT BELONGS TO
// (pwa/src/game/render/effects.ts `drawnUnderActors`, and the `restsOnFloor`
// rule that answers most of it).
//
// The layer is drawn OVER the finished frame because nearly everything in it
// happens in the air: an explosion, a rising damage number, a spray of blood, a
// body coming apart. What is left when those are over is not in the air at all,
// and the field has no depth sort to appeal to — so a corpse, a burst's gibs and
// a cleave's halves were painted over the hero every time he walked across the
// spot they lay in, for seconds at a time and for the whole level in an epic's
// case. They change layers when they land, and this is the rule that says when.
//
// The garage door's roll-up is in the same half for a different reason, and
// from its first frame rather than its last: it is a piece of the LEVEL the
// engine has already dropped, redrawn while it retracts, so it has to be painted
// inside the world picture — under the night's wash, under the lamp pools and
// under the bodies — exactly like the shut door it is replacing.

import { describe, expect, it } from "vitest";

import {
  CLEAVE_MS,
  GORE_BURST_MS,
} from "../pwa/src/game/game-screen/gore-burst.ts";
import {
  drawnUnderActors,
  GARAGE_DOOR_MS,
  restsOnFloor,
  type Effect,
} from "../pwa/src/game/render/effects.ts";

/** An effect spawned at t=0 with `life` ms on the clock, as GameScreen builds
 * them: `untilMs` is the death, `durationMs` the whole span. */
function spawned(
  effect: Partial<Effect> & { kind: Effect["kind"] },
  life: number,
): Effect {
  return {
    pos: { x: 0, y: 0 },
    untilMs: life,
    durationMs: life,
    ...effect,
  } as Effect;
}

describe("what has come to rest on the floor", () => {
  it("keeps a burst in the air until every piece has landed", () => {
    // GORE LINGER (ten seconds shipped) rides on top of the flight, so most of
    // a gib effect's life is spent lying still — which is exactly the stretch
    // that was being drawn over the hero.
    const gib = spawned({ kind: "gib" }, GORE_BURST_MS + 10_000);
    expect(restsOnFloor(gib, 0)).toBe(false);
    expect(restsOnFloor(gib, GORE_BURST_MS - 1)).toBe(false);
    expect(restsOnFloor(gib, GORE_BURST_MS)).toBe(true);
    expect(restsOnFloor(gib, GORE_BURST_MS + 9_000)).toBe(true);
  });

  it("gives a cleave its own, longer parting", () => {
    // The two halves take longer to come apart than a burst's pieces take to
    // fly, and reading one clock for both would drop a cleave to the floor
    // mid-part.
    const cleave = spawned({ kind: "cleave" }, CLEAVE_MS + 10_000);
    expect(restsOnFloor(cleave, GORE_BURST_MS)).toBe(false);
    expect(restsOnFloor(cleave, CLEAVE_MS)).toBe(true);
  });

  it("holds an epic's remains down for the rest of the level", () => {
    // A day of run-clock, and `persist` so it never blinks out — the one case
    // where the mess outlives everything else on the field, and the one the
    // player is most likely to walk back through.
    const epic = spawned({ kind: "gib", persist: true }, 86_400_000);
    expect(restsOnFloor(epic, 0)).toBe(false);
    expect(restsOnFloor(epic, GORE_BURST_MS)).toBe(true);
    expect(restsOnFloor(epic, 3_600_000)).toBe(true);
  });

  it("lets a body finish keeling over first", () => {
    const corpse = spawned({ kind: "corpse" }, 2000);
    expect(restsOnFloor(corpse, 0)).toBe(false);
    expect(restsOnFloor(corpse, 200)).toBe(false);
    expect(restsOnFloor(corpse, 400)).toBe(true);
  });

  it("lets a punted one finish its flight, however far it sails", () => {
    // A launched body arcs UP off the ground and tumbles — it is genuinely in
    // the air, and passing behind the hero on the way down would be the same
    // mistake in the other direction. The further the blow threw it, the longer
    // that lasts.
    const punted = spawned(
      { kind: "corpse", launch: { dx: 1, dy: 0, dist: 220, spins: 2 } },
      3200,
    );
    expect(restsOnFloor(punted, 400)).toBe(false);
    expect(restsOnFloor(punted, 600)).toBe(false);
    expect(restsOnFloor(punted, 900)).toBe(true);
    // …and a throw too small to read has no flight to wait out at all.
    const nudged = spawned(
      { kind: "corpse", launch: { dx: 1, dy: 0, dist: 1, spins: 0 } },
      2000,
    );
    expect(restsOnFloor(nudged, 400)).toBe(true);
  });

  it("leaves everything that happens in the air where it was", () => {
    // The rule is about REMAINS, not about anything that merely lasts a while:
    // a spray, a splash, a floating number and a burning body all belong over
    // the frame, and a lingering one is still over it.
    for (const kind of [
      "blood",
      "splash",
      "damage",
      "incinerate",
      "lightning",
      "lootShine",
    ] as const) {
      const effect = spawned({ kind }, 2000);
      expect(restsOnFloor(effect, 0)).toBe(false);
      expect(restsOnFloor(effect, 1900)).toBe(false);
      expect(drawnUnderActors(effect, 0)).toBe(false);
      expect(drawnUnderActors(effect, 1900)).toBe(false);
    }
  });
});

describe("which half of the layer draws it", () => {
  it("draws the garage door's roll-up inside the frame from first slat to last", () => {
    // The one member that does NOT earn its place by coming to rest. Drawn over
    // the finished frame it sat above `drawNight`'s wash and above every lamp
    // pool cut out of it, so a door hanging in the lit bay turned from warm
    // grey to its own cold slate on the tick it started moving — and it painted
    // over the hero standing in the doorway. Every frame of the roll-up, not
    // just the settled tail.
    const door = spawned({ kind: "garageDoor" }, GARAGE_DOOR_MS);
    for (const t of [0, 1, GARAGE_DOOR_MS / 2, GARAGE_DOOR_MS - 1]) {
      expect(drawnUnderActors(door, t)).toBe(true);
    }
    // …and it is emphatically not "at rest": the gore rule has nothing to say
    // about a door, which is why the membership question is its own function.
    expect(restsOnFloor(door, GARAGE_DOOR_MS / 2)).toBe(false);
  });

  it("still hands the remains over on the frame they land", () => {
    // The other half of the membership, unchanged: `drawnUnderActors` must not
    // drag a body down early or leave one in the air late.
    const corpse = spawned({ kind: "corpse" }, 2000);
    expect(drawnUnderActors(corpse, 200)).toBe(false);
    expect(drawnUnderActors(corpse, 400)).toBe(true);
  });
});

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// COMBAT TEXT LANES (pwa/src/game/game-screen/float-lane.ts): a float that would
// land where a live one already sits takes the lane ABOVE it, because two
// numbers drawn into the same pixels are zero numbers — a mob dying at the
// hero's feet and shedding a purse puts a hit number, a blue "+N XP" and a gold
// "+N" on one spot. What matters here is that a busy spot lifts, a free one
// costs nothing, that two numbers side by side never pay for a collision they
// don't have, and that a float which has climbed out of the way stops charging
// rent.

import { describe, expect, it } from "vitest";

import {
  floatLift,
  pushDamage,
  pushFloat,
  trackFloats,
} from "../pwa/src/game/game-screen/float-lane.ts";
import type { Effect } from "../pwa/src/game/render.ts";

const NOW = 10_000;
const SPOT = { x: 100, y: 100 };

/** A live text float on `SPOT`, `age` ms into its 1000 ms life. */
function float(over: Partial<Effect> = {}, age = 0): Effect {
  return {
    kind: "text",
    pos: { ...SPOT },
    untilMs: NOW + 1000 - age,
    durationMs: 1000,
    text: "+42 XP",
    rise: 0, // no climb unless a case asks for one
    ...over,
  };
}

/** A live hit number on `SPOT` — pinned to the body, so it never climbs. */
function damage(over: Partial<Effect> = {}): Effect {
  return {
    kind: "damage",
    pos: { ...SPOT },
    untilMs: NOW + 650,
    durationMs: 650,
    value: 128,
    ...over,
  };
}

describe("floatLift", () => {
  it("costs nothing on a spot nobody is using", () => {
    expect(floatLift([], SPOT, NOW, "+42 XP")).toBe(0);
  });

  it("lifts a float clear of the live one under it", () => {
    expect(floatLift([float()], SPOT, NOW, "+42 XP")).toBeGreaterThan(0);
  });

  it("lifts a float clear of a live HIT NUMBER too", () => {
    expect(floatLift([damage()], SPOT, NOW, "+42 XP")).toBeGreaterThan(0);
  });

  it("stacks the third float above the second", () => {
    const first = float();
    const second = float({ lift: floatLift([first], SPOT, NOW, "+42 XP") });
    expect(floatLift([first, second], SPOT, NOW, "+42 XP")).toBeGreaterThan(
      second.lift ?? 0,
    );
  });

  it("gives a big number a taller lane than a small one", () => {
    const small = floatLift([float({ scale: 1 })], SPOT, NOW, "+42 XP");
    const big = floatLift([float({ scale: 3 })], SPOT, NOW, "+42 XP");
    expect(big).toBeGreaterThan(small);
  });

  it("leaves two numbers side by side alone — they never overlapped", () => {
    // "+42 XP" is ~23px wide; 80px apart is two clear columns.
    const beside = float({ pos: { x: SPOT.x + 80, y: SPOT.y } });
    expect(floatLift([beside], SPOT, NOW, "+42 XP")).toBe(0);
  });

  it("lifts one that overlaps a wide neighbour", () => {
    const wide = float({ text: "A VERY LONG BOSS BARK INDEED" });
    const beside = { x: SPOT.x + 30, y: SPOT.y };
    expect(floatLift([wide], beside, NOW, "+42 XP")).toBeGreaterThan(0);
  });

  it("ignores a float on another body", () => {
    const away = float({ pos: { x: SPOT.x, y: SPOT.y + 60 } });
    expect(floatLift([away], SPOT, NOW, "+42 XP")).toBe(0);
  });

  it("ignores one that has already expired", () => {
    expect(floatLift([float({ untilMs: NOW - 1 })], SPOT, NOW, "+42 XP")).toBe(
      0,
    );
  });

  it("stops charging for one that has climbed out of the way", () => {
    // Half a life into a 40px climb: 20px up, well clear of one line.
    expect(floatLift([float({ rise: 40 }, 500)], SPOT, NOW, "+42 XP")).toBe(0);
  });

  it("takes the collision rather than walking a pile-up off the screen", () => {
    const wall = Array.from({ length: 40 }, (_, i) => float({ lift: i * 6 }));
    expect(floatLift(wall, SPOT, NOW, "+42 XP")).toBeLessThanOrEqual(48);
  });
});

describe("pushFloat / pushDamage", () => {
  it("ladders a fight's numbers instead of overprinting them", () => {
    const effects: Effect[] = [];
    // A hit, its kill's XP, and the purse it shook out — one spot, three
    // messages, in the order a real kill emits them.
    pushDamage(effects, NOW, {
      pos: { ...SPOT },
      untilMs: NOW + 650,
      durationMs: 650,
      value: 128,
      crit: false,
    });
    pushFloat(effects, NOW, {
      pos: { ...SPOT },
      untilMs: NOW + 1100,
      durationMs: 1100,
      text: "+42 XP",
    });
    pushFloat(effects, NOW, {
      pos: { ...SPOT },
      untilMs: NOW + 900,
      durationMs: 900,
      text: "+822",
    });
    const lifts = effects.map((e) => e.lift ?? 0);
    expect(lifts[0]).toBe(0);
    expect(lifts[1]).toBeGreaterThan(lifts[0] ?? 0);
    expect(lifts[2]).toBeGreaterThan(lifts[1] ?? 0);
  });

  it("lays a multi-line bark out top-down, clear of the fight's numbers", () => {
    // A boss barking over a live hit number: the paragraph pushes its LAST line
    // first, so each earlier line lands on the row above and the block reads
    // top-down — above the number, not through it.
    const effects: Effect[] = [damage()];
    for (const text of ["SECOND LINE", "FIRST LINE"]) {
      pushFloat(effects, NOW, {
        pos: { ...SPOT },
        untilMs: NOW + 1500,
        durationMs: 1500,
        text,
      });
    }
    const [hit, second, first] = effects;
    expect(second?.lift ?? 0).toBeGreaterThan(hit?.lift ?? 0);
    expect(first?.lift ?? 0).toBeGreaterThan(second?.lift ?? 0);
  });
});

describe("floatLift under the world projection", () => {
  it("measures the gap on the GLASS, which the pitch squashes", () => {
    // 6 world units north-south is only 4.5px once the ground is pitched — less
    // than a row, so the two would collide and the newcomer takes a row of its
    // own.
    const near = float({ pos: { x: SPOT.x, y: SPOT.y - 6 } });
    expect(floatLift([near], SPOT, NOW, "+42 XP")).toBeGreaterThan(0);
    // …while a body a real distance up the floor is clear on the glass too.
    const far = float({ pos: { x: SPOT.x, y: SPOT.y - 40 } });
    expect(floatLift([far], SPOT, NOW, "+42 XP")).toBe(0);
  });

  it("takes the free row UNDER a float that has climbed away", () => {
    const climbed = float({ rise: 40 }, 700); // 28px up, its row is empty
    expect(floatLift([climbed], SPOT, NOW, "+42 XP")).toBe(0);
  });

  it("steps over a stack rather than landing between two rows", () => {
    const stacked = [float({ lift: 0 }), float({ lift: 6 })];
    expect(floatLift(stacked, SPOT, NOW, "+42 XP")).toBe(12);
  });
});

describe("trackFloats", () => {
  it("keeps a hero's thought over his head while he drives away from it", () => {
    const hero = { pos: { ...SPOT } };
    const words = float({
      pos: { x: SPOT.x, y: SPOT.y - 30 },
      follow: { seat: 0, dy: 30 },
    });
    // The car pulls out of the drive with the words still in his head.
    hero.pos.x += 400;
    hero.pos.y += 25;
    trackFloats([words], [hero]);
    expect(words.pos.x).toBe(hero.pos.x);
    expect(words.pos.y).toBe(hero.pos.y - 30);
  });

  it("leaves the lane it was given alone, so a moving word doesn't jitter", () => {
    const hero = { pos: { ...SPOT } };
    const words = float({ lift: 12, follow: { seat: 0, dy: 30 } });
    hero.pos.x += 200;
    trackFloats([words], [hero]);
    expect(words.lift).toBe(12);
  });

  it("leaves a combat number on the spot the blow landed", () => {
    const hero = { pos: { ...SPOT } };
    const number = damage();
    hero.pos.x += 200;
    trackFloats([number], [hero]);
    expect(number.pos).toEqual(SPOT);
  });

  it("leaves a float alone when its seat isn't in this world", () => {
    const words = float({ follow: { seat: 3, dy: 30 } });
    trackFloats([words], [{ pos: { ...SPOT } }]);
    expect(words.pos).toEqual(SPOT);
  });
});

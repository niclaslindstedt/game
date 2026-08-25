// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAYERS OF THE SKY — the climb's neighbourhoods (engine/game/rocket/
// layers.ts), and the spawner that walks them.
//
// The SHAPE again, not the figures: a `perTrip` may be retuned freely and the
// design may not be broken. What is asserted is the four things the layered
// sky exists to promise —
//
//   • EVERY neighbourhood is met on EVERY climb. A band nobody ever flies
//     through is art that never ships, and this is the whole reason the table
//     replaced a spawner that only dealt aircraft to a ship already off
//     course.
//   • The band's ORDER is the sky's: birds under the airways under the
//     watch deck under the orbits.
//   • Nothing is laid above the shell's top, or ALL CLEAR is not clear.
//   • Nothing IN ORBIT falls, because that is what an orbit is.
//
// An ENGINE suite: a flight has no level and no catalog under it at all.

import { describe, expect, it } from "vitest";

import {
  FLIGHT,
  FLIGHT_OUTCOME,
  ORBIT_VARIANTS,
  SKY_LAYERS,
  createFlight,
  createFlightDriver,
  flightDriverInput,
  layerFrac,
  planeHullFrac,
  skyZoneLabel,
  stepFlight,
  type FlightParams,
  type OrbitKind,
  type OrbitObject,
} from "../../engine/game/rocket/index.ts";

const PARAMS: FlightParams = {
  seed: 4242,
  difficulty: "medium",
  to: "test_level",
};

const STEP_MS = 1000 / 60;

/**
 * FLY A WHOLE CLIMB and keep one record per thing the sky ever minted.
 *
 * The stick is the shipped auto-pilot's, because the claim being tested is
 * about an ORDINARY climb and nothing else can hold an inverted pendulum
 * upright for thirty seconds. What is counted is what the sky LAID, not what
 * the ship hit — a pilot good enough to reach orbit dodged most of it.
 */
function everythingMet(seed: number): OrbitObject[] {
  const flight = createFlight({ ...PARAMS, seed });
  const driver = createFlightDriver();
  const seen = new Map<number, OrbitObject>();
  for (let i = 0; i < 60 * 240; i++) {
    stepFlight(flight, STEP_MS, flightDriverInput(driver, flight));
    for (const o of flight.field) if (!seen.has(o.id)) seen.set(o.id, { ...o });
    if (flight.craft.alt >= FLIGHT.coursePx * FLIGHT.field.shellTopFrac) break;
    if (flight.outcome !== FLIGHT_OUTCOME.flying) break;
  }
  expect(flight.craft.alt).toBeGreaterThan(
    FLIGHT.coursePx * FLIGHT.field.shellTopFrac * 0.98,
  );
  return [...seen.values()];
}

/** Which layer a spawned thing came off — kind plus which end of the kind's
 * variant list it wears, which is how one kind carries two neighbourhoods. */
function layerOf(o: OrbitObject): string | undefined {
  return SKY_LAYERS.find(
    (l) => l.kind === o.kind && l.variants.includes(o.variant),
  )?.id;
}

describe("the sky's layers", () => {
  it("keeps every band inside the shell, and its variants inside its kind", () => {
    const shellTop = FLIGHT.coursePx * FLIGHT.field.shellTopFrac;
    for (const layer of SKY_LAYERS) {
      expect(layer.from).toBeLessThan(layer.to);
      expect(layer.fade).toBeGreaterThan(0);
      expect(layer.perTrip).toBeGreaterThan(0);
      expect(layer.variants.length).toBeGreaterThan(0);
      // Authored inside the sky it is laid in: the spawn ceiling is the
      // shell's top, so a band whose full-strength stretch runs past it is a
      // count the climb can never deal.
      expect(layer.to).toBeLessThanOrEqual(shellTop);
      for (const v of layer.variants) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(ORBIT_VARIANTS[layer.kind]);
      }
    }
  });

  it("never lets two layers of one kind share a variant", () => {
    // The variant is how a kind carries two neighbourhoods, so a variant in
    // two bands is a thing whose altitude — and, for an aircraft, whose hull
    // cost — depends on which row happened to deal it.
    const claimed = new Set<string>();
    for (const layer of SKY_LAYERS) {
      for (const v of layer.variants) {
        const key = `${layer.kind}:${v}`;
        expect(claimed.has(key)).toBe(false);
        claimed.add(key);
      }
    }
  });

  // THE POINT OF THE WHOLE TABLE, and it is a claim about EVERY climb rather
  // than about a lucky one — birds, somebody's canopy, the light lanes, the
  // airways, the watch deck, the constellation and the military's orbits are
  // not a rare sky, they are THE sky. So it is asserted seed by seed: one
  // seed passing is exactly the evidence a rare band would also produce.
  for (const seed of [1, 17, 404, 4242, 90210]) {
    it(`meets every neighbourhood on the climb from seed ${seed}`, () => {
      const met = new Set(everythingMet(seed).map(layerOf));
      const missing = SKY_LAYERS.filter((l) => !met.has(l.id)).map((l) => l.id);
      expect(missing).toEqual([]);
    });
  }

  it("lays each neighbourhood in its own stretch of sky", () => {
    for (const o of everythingMet(PARAMS.seed)) {
      const id = layerOf(o);
      if (!id) continue;
      const layer = SKY_LAYERS.find((l) => l.id === id)!;
      // Minted somewhere the band actually reaches. The record is taken the
      // first tick the thing is seen, so it has drifted at most one tick from
      // where it was laid — hence the slack rather than an exact bound.
      const slack = 220;
      expect(o.alt).toBeGreaterThan(layer.from - layer.fade - slack);
      expect(o.alt).toBeLessThan(layer.to + layer.fade + slack);
      expect(layerFrac(layer, (layer.from + layer.to) / 2)).toBe(1);
    }
  });

  it("puts the birds under the airways under the orbits", () => {
    const at = (id: string) => {
      const l = SKY_LAYERS.find((x) => x.id === id)!;
      return (l.from + l.to) / 2;
    };
    expect(at("birds")).toBeLessThan(at("light"));
    expect(at("light")).toBeLessThan(at("airways"));
    expect(at("airways")).toBeLessThan(at("watch"));
    expect(at("watch")).toBeLessThan(at("constellation"));
    expect(at("constellation")).toBeLessThan(at("milorbit"));
  });

  it("never lets anything in orbit fall", () => {
    // An orbit is the thing that does not fall. What is left when the ship's
    // own orbit is subtracted from a satellite's is the ANGLE between them —
    // sideways — so the vertical share must stay small beside it.
    const orbital: OrbitKind[] = ["satellite", "milsat", "rock", "junk"];
    for (const o of everythingMet(PARAMS.seed)) {
      if (!orbital.includes(o.kind)) continue;
      expect(Math.abs(o.vy)).toBeLessThanOrEqual(Math.abs(o.vx) + 1);
    }
  });

  it("makes the crossers faster than anything under them", () => {
    const met = everythingMet(PARAMS.seed);
    const fastest = (kind: OrbitKind) =>
      Math.max(
        0,
        ...met.filter((o) => o.kind === kind).map((o) => Math.abs(o.vx)),
      );
    // A satellite is doing orbital speed and a bird is doing forty km/h; the
    // sky is only honest if the dial's own conversion is the one both were
    // authored through.
    expect(fastest("satellite")).toBeGreaterThan(fastest("plane"));
    expect(fastest("plane")).toBeGreaterThan(fastest("bird"));
    expect(fastest("bird")).toBeGreaterThan(0);
  });
});

describe("the dashboard's zone readout", () => {
  it("names the sky bottom to top and ends on ALL CLEAR", () => {
    const course = FLIGHT.coursePx;
    const zones: string[] = [];
    for (let alt = 0; alt <= course * FLIGHT.field.shellTopFrac; alt += 20) {
      const zone = skyZoneLabel(alt, course);
      if (zone !== zones[zones.length - 1]) zones.push(zone);
    }
    expect(zones[0]).toBe("BIRDS");
    expect(zones).toContain("THE AIRWAYS");
    expect(zones).toContain("CONSTELLATION");
    expect(zones).toContain("MIL ORBITS");
    // Out of the top of the shell there is nothing left to name.
    expect(skyZoneLabel(course * FLIGHT.field.shellTopFrac, course)).toBe(
      "ALL CLEAR",
    );
    expect(skyZoneLabel(course, course)).toBe("ALL CLEAR");
  });

  it("never doubles back — the ladder only ever goes up", () => {
    // Two layers naming the same stretch of sky is a readout that flickers
    // between them as the ship climbs (the parcel quads sharing the birds'
    // two kilometres did exactly that), so the ladder is asserted to name each
    // zone once and never return to one it has left.
    const course = FLIGHT.coursePx;
    const seen: string[] = [];
    for (let alt = 0; alt <= course; alt += 10) {
      const zone = skyZoneLabel(alt, course);
      if (zone === seen[seen.length - 1]) continue;
      expect(seen).not.toContain(zone);
      seen.push(zone);
    }
    expect(seen.length).toBeGreaterThan(6);
  });

  it("never prints a layer that does not name a sky", () => {
    const named = new Set(SKY_LAYERS.filter((l) => l.zone).map((l) => l.label));
    for (let alt = 0; alt <= FLIGHT.coursePx; alt += 20) {
      const zone = skyZoneLabel(alt, FLIGHT.coursePx);
      if (zone === "ALL CLEAR" || zone === "THE SHELL" || zone === "OPEN SKY") {
        continue;
      }
      expect(named.has(zone)).toBe(true);
    }
  });
});

describe("what an aircraft costs", () => {
  it("prices the airliners far above the light single", () => {
    const airways = SKY_LAYERS.find((l) => l.id === "airways")!;
    const light = SKY_LAYERS.find((l) => l.id === "light")!;
    for (const big of airways.variants) {
      for (const small of light.variants) {
        expect(planeHullFrac(big)).toBeGreaterThan(planeHullFrac(small) * 2);
      }
    }
  });

  it("clamps a variant the table does not have, rather than reading nothing", () => {
    expect(planeHullFrac(99)).toBe(planeHullFrac(ORBIT_VARIANTS.plane - 1));
    expect(planeHullFrac(-3)).toBe(planeHullFrac(0));
  });
});

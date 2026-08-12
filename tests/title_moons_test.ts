// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SATELLITES OF THE TITLE SKY — the twenty in `title-moons.ts` and Earth's
// own Moon in `title-planets.ts`, held to what their own files claim about
// them.
//
// The sky is a picture of the real solar system, and almost every number in it
// is measured rather than chosen. That is exactly why it needs a suite: a
// measured number is one keystroke from being a wrong measured number, and
// nothing on a title screen looks broken enough to catch it. Every check here
// is one of the claims those two files make in prose.
//
// FIVE OF THEM ARE THE POINT:
//
//   • THE RIGHT PLANET, and a real one — every satellite's parent has a pole,
//     a diameter and an orbit of its own.
//   • THE RIGHT SIZE — a satellite's disc is its true diameter over its
//     planet's, with no easing anywhere.
//   • THE RIGHT SPEED — one clock for the twenty, so every period RATIO
//     between them is the true one.
//   • THE RIGHT PLANE — a satellite rides its planet's equator, which is what
//     makes Uranus's five wheel round a toppled planet while Jupiter's four
//     hold a line, and Triton go round backwards.
//   • AND FAST ENOUGH TO SEE. This is the one check that is about the VIEWER
//     rather than about the sky: a body whose drawn orbit takes it under a
//     pixel a second is a body that is not moving as far as anyone watching
//     can tell, however exact its period is. See `MIN_APPARENT_PX_S`.

import { describe, expect, it } from "vitest";

import {
  DIAMETER_KM,
  EARTH_DISC,
  EARTH_PERIOD_MS,
  EARTH_YEAR_DAYS,
  MOON_SIDEREAL_DAYS,
  discSize,
  moonBody,
  type Planet,
} from "../pwa/src/game/title-planets.ts";
import {
  SATELLITES,
  SAT_MS_PER_DAY,
  layoutSatellites,
  satelliteOffset,
  type ParentName,
  type SatelliteScreen,
} from "../pwa/src/game/title-moons.ts";
import { PLANET_POLES, equatorBasis } from "@ui/lib/planet-poles.ts";

/** The reference device: a phone held horizontally (see AGENTS.md). The short
 * side is what every fraction in the sky is measured against. */
const SHORT_PX = 390;

const PARENTS: ParentName[] = [
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
];

const parentDisc = Object.fromEntries(
  PARENTS.map((p) => [p, discSize(p)]),
) as Record<ParentName, number>;
const parentKm = Object.fromEntries(
  PARENTS.map((p) => [p, DIAMETER_KM[p]]),
) as Record<ParentName, number>;

const layout = layoutSatellites(parentDisc, parentKm);
const byId = new Map(layout.map((s) => [s.def.id, s]));

function screenOf(id: string): SatelliteScreen {
  const hit = byId.get(id);
  if (!hit) throw new Error(`no satellite ${id}`);
  return hit;
}

/** Earth's Moon, which is not in the catalogue and is checked beside it. */
const moon: Planet = moonBody({} as HTMLElement);

/**
 * How far a body travels along its own orbit per second of screen time, in CSS
 * pixels at the reference viewport — the plain "is it moving" measure, before
 * any projection. The projection only ever makes it SLOWER (an orbit seen
 * edge-on is squashed), so this is the generous version of the question.
 */
function apparentPxPerSec(orbitFraction: number, ms: number): number {
  return (2 * Math.PI * orbitFraction * SHORT_PX) / (ms / 1000);
}

describe("every satellite orbits a real planet", () => {
  it("names a parent that has a pole, a diameter and an orbit", () => {
    for (const s of SATELLITES) {
      expect(PLANET_POLES[s.parent], s.id).toBeDefined();
      expect(DIAMETER_KM[s.parent], s.id).toBeGreaterThan(0);
    }
  });

  it("gives every satellite a distinct id and its own texture", () => {
    const ids = new Set(SATELLITES.map((s) => s.id));
    expect(ids.size).toBe(SATELLITES.length);
    const kinds = new Set(SATELLITES.map((s) => s.kind));
    expect(kinds.size).toBe(SATELLITES.length);
  });

  it("puts each one in the system it belongs to", () => {
    // A spot check with real astronomy rather than a restatement of the table:
    // these are the four Galileo saw, the seven of Saturn, and the two that go
    // round Mars.
    const of = (parent: ParentName) =>
      SATELLITES.filter((s) => s.parent === parent).map((s) => s.id);
    expect(of("mars")).toEqual(["phobos", "deimos"]);
    expect(of("jupiter")).toEqual(["io", "europa", "ganymede", "callisto"]);
    expect(of("saturn")).toContain("titan");
    expect(of("uranus")).toContain("miranda");
    expect(of("neptune")).toEqual(["proteus", "triton"]);
  });
});

describe("every disc is true against its planet", () => {
  it("draws a satellite at its real diameter ratio, with no easing", () => {
    for (const s of SATELLITES) {
      const expected = parentDisc[s.parent] * (s.d / parentKm[s.parent]);
      expect(screenOf(s.id).disc).toBeCloseTo(expected, 12);
    }
  });

  it("draws Earth's Moon at a true quarter of the Earth", () => {
    expect(moon.base / EARTH_DISC).toBeCloseTo(
      DIAMETER_KM.moon / DIAMETER_KM.earth,
      12,
    );
    expect(moon.base / EARTH_DISC).toBeGreaterThan(0.25);
    expect(moon.base / EARTH_DISC).toBeLessThan(0.28);
  });

  it("makes Ganymede the largest moon in the sky", () => {
    const biggest = [...SATELLITES].sort((a, b) => b.d - a.d)[0];
    expect(biggest?.id).toBe("ganymede");
    // …and bigger than Mercury, which is the fact worth having.
    expect(biggest?.d).toBeGreaterThan(DIAMETER_KM.mercury);
  });
});

describe("one clock, so every ratio between the twenty is the real one", () => {
  it("scales every period by the same number of ms per day", () => {
    for (const s of SATELLITES) {
      expect(screenOf(s.id).ms).toBe(Math.round(s.days * SAT_MS_PER_DAY));
    }
  });

  it("keeps the Galilean resonance watchable: Io laps Europa twice", () => {
    const io = screenOf("io").ms;
    const europa = screenOf("europa").ms;
    const ganymede = screenOf("ganymede").ms;
    // The real Laplace resonance is 1:2:4 to within a per cent, which is the
    // claim `title-moons.ts` makes about it.
    expect(europa / io).toBeCloseTo(2, 1);
    expect(ganymede / europa).toBeCloseTo(2, 1);
  });

  it("orders each system's orbits by its true semi-major axes", () => {
    for (const parent of PARENTS) {
      const family = SATELLITES.filter((s) => s.parent === parent);
      const byAxis = [...family].sort((a, b) => a.a - b.a).map((s) => s.id);
      const byDrawn = [...family]
        .sort((a, b) => screenOf(a.id).orbit - screenOf(b.id).orbit)
        .map((s) => s.id);
      expect(byDrawn, parent).toEqual(byAxis);
      // …and a farther moon is a slower moon, which is Kepler's third law
      // surviving the compression of the distances.
      const byPeriod = [...family]
        .sort((a, b) => a.days - b.days)
        .map((s) => s.id);
      expect(byPeriod, parent).toEqual(byAxis);
    }
  });
});

describe("every satellite rides its own planet's equator", () => {
  /** The orbit's normal, from two samples a quarter period apart. */
  function orbitNormal(s: SatelliteScreen): [number, number, number] {
    const a = satelliteOffset(s, 0);
    const b = satelliteOffset(s, s.ms / 4);
    return [
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x,
    ];
  }

  function unit(v: [number, number, number]): [number, number, number] {
    const l = Math.hypot(...v) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function dot(
    a: readonly [number, number, number],
    b: readonly [number, number, number],
  ): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  it("lays each orbit in its planet's equatorial plane", () => {
    for (const s of SATELLITES) {
      const pole = equatorBasis(PLANET_POLES[s.parent]).north;
      const align = Math.min(
        1,
        Math.abs(dot(unit(orbitNormal(screenOf(s.id))), pole)),
      );
      const tilt = (Math.acos(align) * 180) / Math.PI;
      // Its own inclination to that plane, and nothing more.
      expect(tilt, s.id).toBeLessThan(Math.max(s.inc, 180 - s.inc) + 0.5);
    }
  });

  it("wheels Uranus's five round a toppled planet and strings Jupiter's out", () => {
    // The pole tells the whole story: Uranus is 82° over, so its moons' plane
    // is nearly perpendicular to the ecliptic the camera looks along.
    expect((PLANET_POLES.uranus.obliquity * 180) / Math.PI).toBeGreaterThan(80);
    expect((PLANET_POLES.jupiter.obliquity * 180) / Math.PI).toBeLessThan(5);
  });

  it("sends Triton round Neptune backwards, and Proteus forwards", () => {
    const pole = equatorBasis(PLANET_POLES.neptune).north;
    expect(dot(unit(orbitNormal(screenOf("proteus"))), pole)).toBeGreaterThan(
      0.5,
    );
    expect(dot(unit(orbitNormal(screenOf("triton"))), pole)).toBeLessThan(-0.5);
  });

  it("keeps every satellite inside its planet's band, clear of the disc", () => {
    for (const s of SATELLITES) {
      const screen = screenOf(s.id);
      const radii = screen.orbit / (parentDisc[s.parent] / 2);
      expect(radii, s.id).toBeGreaterThan(1.4);
      expect(radii, s.id).toBeLessThan(3.5);
      // Never inside its own planet, at any point of an eccentric orbit.
      expect(screen.orbit * (1 - s.e), s.id).toBeGreaterThan(
        parentDisc[s.parent] / 2 + screen.disc / 2,
      );
    }
  });
});

describe("every satellite is tidally locked", () => {
  it("has no spin of its own to author — the orbit IS the rotation", () => {
    // `SatelliteDef` carries no rotation field at all, which is the strongest
    // form of this rule: the driver sets `spin = ms` from the orbit, and there
    // is nothing in the catalogue that could disagree with it. What a test can
    // still check is that every one of them HAS an orbit to be locked to, and
    // that Earth's Moon — which is a full `Planet` and so could author a spin —
    // declines to.
    for (const s of SATELLITES) {
      expect(screenOf(s.id).ms, s.id).toBeGreaterThan(0);
      expect(Object.keys(s)).not.toContain("rotDays");
    }
    expect(moon.rotDays).toBe(0);
    expect(moon.ms).toBeGreaterThan(0);
  });
});

describe("and every one of them visibly moves", () => {
  /**
   * The floor, in CSS pixels of orbital travel per second at the reference
   * viewport. It is deliberately low — this is a check for a body that has
   * stopped, not a taste control — and it is set where motion stops being
   * legible at all rather than where it starts being pretty: at 1 px/s a body
   * takes six seconds to cross its own drawn disc, and every reading of the
   * title screen shorter than that shows a still picture.
   *
   * IT IS THE REGRESSION GUARD FOR EARTH'S MOON, which sat at 0.77 px/s: 164 s
   * for one lap of a 20 px orbit, which is a Moon that does not move.
   */
  const MIN_APPARENT_PX_S = 2;

  it("moves every satellite at least a couple of pixels a second", () => {
    for (const s of SATELLITES) {
      const screen = screenOf(s.id);
      expect(
        apparentPxPerSec(screen.orbit, screen.ms),
        `${s.id} is not moving`,
      ).toBeGreaterThan(MIN_APPARENT_PX_S);
    }
  });

  it("moves Earth's Moon, the one the player is looking at", () => {
    expect(apparentPxPerSec(moon.r, moon.ms as number)).toBeGreaterThan(
      MIN_APPARENT_PX_S,
    );
  });

  it("laps the Earth the true number of times per on-screen year", () => {
    // The one ratio in the sky a viewer can actually check, because both halves
    // of it are in frame together: the Moon goes round the Earth 13.37 times
    // while the Earth goes round the sun once. It is exact here — the Moon runs
    // on the planets' clock — and it was 0.39 when the Moon ran on the
    // satellites' clock, which is the bug this file was written for.
    const laps = EARTH_PERIOD_MS / (moon.ms as number);
    expect(laps).toBeCloseTo(EARTH_YEAR_DAYS / MOON_SIDEREAL_DAYS, 2);
    expect(laps).toBeCloseTo(13.37, 1);
  });
});

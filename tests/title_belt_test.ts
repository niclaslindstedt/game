// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BELT'S STATISTICS — the check that the main-menu asteroids are the
// population they claim to be (`pwa/src/game/title-belt.ts`).
//
// A backdrop cannot be reviewed by looking at one frame of it: what is being
// claimed here is a DISTRIBUTION — the taxonomy's shares, the size–frequency
// law, the Maxwellian speeds, the Poisson intervals, the spin barrier — and
// every one of those is invisible in any single fly-by and obvious over ten
// thousand. So this file rolls ten thousand and measures them.
//
// The tolerances are the sampling error at that count and nothing tighter. A
// test that pinned these to three decimals would be pinning the LCG rather
// than the physics, and would fail the first time a constant moved for a good
// reason.

import { describe, expect, it } from "vitest";

import {
  ARRIVAL_MS,
  CEIL_KM,
  CLASSES,
  FLOOR_KM,
  SIGHT_S,
  SPAN_MAX,
  SPIN_BARRIER_H,
  flybyAt,
  lcg,
  nextGapMs,
  rollDiameter,
  rollFlyby,
  rollSpeed,
  rollSpinHours,
  rollClass,
} from "../pwa/src/game/title-belt.ts";

const N = 10_000;
/** An hour on the sky's spin clock (EARTH_SPIN_MS / 24). */
const SPIN_MS_PER_HOUR = 22_000 / 24;

function sample<T>(seed: number, f: (rnd: () => number) => T): T[] {
  const rnd = lcg(seed);
  return Array.from({ length: N }, () => f(rnd));
}

const mean = (xs: number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

describe("the belt's taxonomy", () => {
  it("shares are a probability distribution", () => {
    const total = CLASSES.reduce((a, c) => a + c.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("rolls each class at its real share of the population", () => {
    const rolled = sample(11, rollClass);
    for (const c of CLASSES) {
      const got = rolled.filter((r) => r.id === c.id).length / N;
      // Three sampling sigma, floored so the two rare classes (V at 1.5% and
      // E at 0.5%) are checked at all rather than waved through.
      const sigma = Math.sqrt((c.share * (1 - c.share)) / N);
      expect(Math.abs(got - c.share), `class ${c.id}`).toBeLessThan(
        3 * sigma + 0.002,
      );
    }
  });

  it("keeps the measured albedo ladder — a twelvefold spread, C dark, E bright", () => {
    const by = Object.fromEntries(CLASSES.map((c) => [c.id, c.albedo]));
    // The order is the physics: primitive D-types darkest, then carbonaceous,
    // then the metallic and stony middle, then basaltic Vesta chips, then the
    // enstatite E-types brightest of all.
    expect(by.D).toBeLessThan(by.C as number);
    expect(by.C).toBeLessThan(by.M as number);
    expect(by.M).toBeLessThan(by.S as number);
    expect(by.S).toBeLessThan(by.V as number);
    expect(by.V).toBeLessThan(by.E as number);
    expect((by.E as number) / (by.D as number)).toBeGreaterThan(10);
    // And the carbonaceous majority really is coal-dark: Bennu measures 0.044.
    expect(by.C).toBeLessThan(0.09);
  });
});

describe("the belt's size distribution", () => {
  const km = sample(23, rollDiameter);

  it("stays inside the drawn range", () => {
    for (const d of km) {
      expect(d).toBeGreaterThanOrEqual(FLOOR_KM);
      expect(d).toBeLessThanOrEqual(CEIL_KM);
    }
  });

  it("is a power law weighted toward what a camera actually meets", () => {
    // The population is overwhelmingly small rubble, but a rock is picked up
    // out to a range proportional to its size and so sweeps an area ∝ D². What
    // ARRIVES is therefore tilted hard toward the top of the range — the same
    // selection that had astronomers find the belt's largest bodies first.
    // Both halves of that are asserted: sub-kilometre rocks are still a large
    // minority, and the median is up near a kilometre rather than down at the
    // floor a raw population draw would give.
    const sub = km.filter((d) => d < 1).length / N;
    expect(sub).toBeGreaterThan(0.3);
    expect(sub).toBeLessThan(0.7);
    const sorted = [...km].sort((a, b) => a - b);
    const median = sorted[Math.floor(N / 2)] as number;
    expect(median).toBeGreaterThan(0.6);
    expect(median).toBeLessThan(2);
  });
});

describe("the belt's speeds", () => {
  const v = sample(37, rollSpeed);

  it("is a Maxwellian about the belt's measured encounter velocity", () => {
    // Collision studies of the main belt put the mean impact velocity near
    // 5.3 km/s and the most probable near 4.4 — the gap between the two is the
    // signature of a Maxwellian rather than a symmetric spread, so both are
    // checked.
    expect(mean(v)).toBeGreaterThan(4.9);
    expect(mean(v)).toBeLessThan(5.7);
    const bins = new Array(30).fill(0);
    for (const x of v) bins[Math.min(29, Math.floor(x))] += 1;
    const mode = bins.indexOf(Math.max(...bins));
    expect(mode).toBeGreaterThanOrEqual(3);
    expect(mode).toBeLessThanOrEqual(5);
  });

  it("has the long tail and no negative or stalled encounters", () => {
    expect(Math.min(...v)).toBeGreaterThan(0);
    expect(Math.max(...v)).toBeGreaterThan(11);
    // …and none of it is orbital speed: everything at 3 AU shares ~17 km/s
    // round the sun, and that common motion is invisible from inside it.
    expect(Math.max(...v)).toBeLessThan(17);
  });
});

describe("the belt's intervals", () => {
  const gaps = sample(41, nextGapMs);

  it("is a Poisson process — exponential gaps, not a metronome", () => {
    // The one measurement that separates a belt from a conveyor belt: for an
    // exponential distribution the standard deviation EQUALS the mean, so the
    // coefficient of variation is 1. A fixed cycle scores 0.
    const m = mean(gaps);
    expect(m).toBeGreaterThan(ARRIVAL_MS * 0.95);
    expect(m).toBeLessThan(ARRIVAL_MS * 1.05);
    const sd = Math.sqrt(mean(gaps.map((g) => (g - m) * (g - m))));
    expect(sd / m).toBeGreaterThan(0.9);
    expect(sd / m).toBeLessThan(1.1);
    // Which means fly-bys clump: about a third of gaps are under 40% of the
    // mean, and a few per cent are more than three times it.
    expect(gaps.filter((g) => g < m * 0.4).length / N).toBeGreaterThan(0.25);
    expect(gaps.filter((g) => g > m * 3).length / N).toBeGreaterThan(0.02);
  });
});

describe("the belt's rotation", () => {
  const hours = sample(53, rollSpinHours);

  it("never crosses the 2.2 h rubble-pile spin barrier", () => {
    // The sharp edge in the lightcurve databases: faster than this, a
    // gravitationally-bound heap starts throwing itself apart. Every rock in
    // this belt is well above the ~150 m where cohesion could save one.
    expect(Math.min(...hours)).toBeGreaterThanOrEqual(SPIN_BARRIER_H);
  });

  it("peaks in the observed few-hours band and keeps the slow tail", () => {
    const sorted = [...hours].sort((a, b) => a - b);
    const median = sorted[Math.floor(N / 2)] as number;
    expect(median).toBeGreaterThan(4);
    expect(median).toBeLessThan(11);
    // The slow rotators — the ones that get a tumble — are a real minority.
    expect(hours.filter((h) => h > 20).length / N).toBeGreaterThan(0.02);
    expect(hours.filter((h) => h > 20).length / N).toBeLessThan(0.15);
  });

  it("turns both ways, and not on a coin toss", () => {
    const rnd = lcg(59);
    const rocks = Array.from({ length: N }, () =>
      rollFlyby(rnd, 0, SPIN_MS_PER_HOUR),
    ).map((f) => f.rock);
    const retro = rocks.filter((r) => r.spinMs < 0).length / N;
    // YORP torques leave the two senses unevenly filled rather than 50/50.
    expect(retro).toBeGreaterThan(0.3);
    expect(retro).toBeLessThan(0.43);
    // Only slow rotators tumble — a fast one has damped onto its short axis.
    for (const r of rocks) {
      if (r.tumbleMs !== 0) {
        expect(Math.abs(r.spinMs) / SPIN_MS_PER_HOUR).toBeGreaterThan(20);
      }
    }
  });

  it("is right against the rest of the sky's clocks", () => {
    // A rock's spin rides EARTH_SPIN_MS, the same clock Jupiter's ten-hour day
    // does, so the fastest possible rotator turns once every two seconds and a
    // typical one every six — visible, and not invented.
    expect(SPIN_BARRIER_H * SPIN_MS_PER_HOUR).toBeCloseTo(2016.7, 0);
  });
});

describe("a fly-by's geometry", () => {
  const rnd = lcg(67);
  const flys = Array.from({ length: 4000 }, (_, i) =>
    rollFlyby(rnd, i * ARRIVAL_MS, SPIN_MS_PER_HOUR),
  );

  it("puts the closest approach at the closest approach", () => {
    // The velocity is built perpendicular to the closest-approach point, which
    // is what makes the range √(b² + v²t²) rather than merely a curve that
    // happens to pass nearby. Verified by walking each path.
    for (const f of flys.slice(0, 200)) {
      const mid = (f.from + f.to) / 2;
      const here = flybyAt(f, mid);
      const range = Math.hypot(here.x, here.y, here.z);
      expect(range).toBeCloseTo(f.miss, 4);
      for (const dt of [-9000, -3000, 3000, 9000]) {
        const p = flybyAt(f, mid + dt);
        expect(Math.hypot(p.x, p.y, p.z)).toBeGreaterThanOrEqual(range - 1e-6);
      }
    }
  });

  it("never lets a rock grow past the frame's share of it", () => {
    for (const f of flys) {
      // The apparent diameter at closest approach, as a fraction of the short
      // side — the perspective divide the driver uses.
      const span = f.rock.km / f.miss;
      expect(span).toBeLessThanOrEqual(SPAN_MAX + 1e-9);
    }
  });

  it("keeps every fly-by inside the sight window", () => {
    for (const f of flys) {
      const life = (f.to - f.from) / 1000;
      expect(life).toBeGreaterThan(0);
      expect(life).toBeLessThanOrEqual(SIGHT_S * 2 + 1e-6);
    }
  });

  it("keeps fly-bys short enough to be fly-bys", () => {
    const life = flys.map((f) => (f.to - f.from) / 1000);
    const sorted = [...life].sort((a, b) => a - b);
    // Half of them are over in under ten seconds; the long ones are the big
    // rocks, which are picked up further out and cross more slowly — which is
    // perspective doing its job, not a tuning knob.
    expect(sorted[Math.floor(life.length / 2)] as number).toBeLessThan(14);
    expect(mean(life)).toBeGreaterThan(8);
    expect(mean(life)).toBeLessThan(24);
  });

  it("draws close passes as rarely as close passes are", () => {
    // The impact parameter follows the real b·db law, so the fraction of
    // fly-bys reaching more than half the maximum span goes as the square of
    // the ratio: a quarter of them at most, and in practice fewer because the
    // span is also capped.
    const spans = flys.map((f) => f.rock.km / f.miss);
    const big = spans.filter((s) => s > SPAN_MAX / 2).length / spans.length;
    expect(big).toBeLessThan(0.3);
    expect(big).toBeGreaterThan(0.02);
  });
});

/**
 * THE PACE, MEASURED THROUGH THE REAL PROJECTION — the only number in this
 * file that says anything about what a player sees.
 *
 * Everything above is a property of the distributions; none of it answers "is
 * the menu empty?". Little's law gets close (arrival rate × mean life) but
 * counts rocks the frame never contains: a fly-by's closest approach is aimed
 * over a cone wider than the viewport, and most of a fly-by is spent too small
 * to be worth drawing. So this walks the clock at 2 Hz and applies the
 * driver's own cull — the perspective divide, the minimum pixel size, the
 * frame test — and counts what survives.
 *
 * It runs at all three reference viewports because the answer must not depend
 * on one. A phone in either orientation and a desktop see the same belt at the
 * same pace, and that is worth pinning: it is exactly what a viewport-aware
 * aim cone would have broken.
 */
describe("what the frame actually sees", () => {
  const VIEWS = [
    { name: "landscape phone", vw: 844, vh: 390 },
    { name: "portrait phone", vw: 390, vh: 844 },
    { name: "desktop", vw: 1920, vh: 1080 },
  ];
  /** The driver's floor: below this a rock is one more speck in a starfield. */
  const MIN_PX = 1.4;
  /** "A rock you can see craters on" — the pass worth waiting for. */
  const GOOD = 0.05;

  for (const view of VIEWS) {
    it(`is alive but not busy at ${view.name}`, () => {
      const u = Math.min(view.vw, view.vh);
      const rnd = lcg(71);
      const span = 3000;
      const flys = Array.from({ length: span }, (_, i) =>
        rollFlyby(rnd, i * ARRIVAL_MS, SPIN_MS_PER_HOUR),
      );
      const until = span * ARRIVAL_MS;
      let ticks = 0;
      let visible = 0;
      const goodOnes = new Set<number>();
      for (let t = 0; t < until; t += 500) {
        ticks += 1;
        for (let i = 0; i < flys.length; i++) {
          const f = flys[i] as (typeof flys)[number];
          if (t < f.from || t > f.to) continue;
          const p = flybyAt(f, t);
          if (p.z <= 0.05) continue;
          const persp = 1 / p.z;
          const d = f.rock.km * persp * u;
          if (d < MIN_PX) continue;
          const cx = view.vw / 2 + p.x * persp * u;
          const cy = view.vh / 2 + p.y * persp * u;
          if (cx < -d || cy < -d || cx > view.vw + d || cy > view.vh + d) {
            continue;
          }
          visible += 1;
          if (d > u * GOOD) goodOnes.add(i);
        }
      }
      // One or two rocks in view at any moment. Below one and the menu is a
      // still photograph most of the time; above three and the belt starts
      // competing with the solar system it is meant to be threading through.
      const concurrent = visible / ticks;
      expect(concurrent).toBeGreaterThan(1.1);
      expect(concurrent).toBeLessThan(2.6);
      // …and a rock big enough to read comes round about every eight seconds.
      const goodEvery = until / 1000 / goodOnes.size;
      expect(goodEvery).toBeGreaterThan(5);
      expect(goodEvery).toBeLessThan(13);
    });
  }
});

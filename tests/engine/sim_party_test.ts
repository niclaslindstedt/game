// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SIMULATOR FLIES A PARTY — the instrument the party-XP tuning pass is
// blocked on, and the reason the co-op rules shipped as
// structure rather than as measured numbers.
//
// **THE TWO KNOBS THIS SUITE EXISTS TO KEEP APART.** `--party N` is how many
// heroes are standing on the floor; `/players N` is D2's monster-hp and XP
// SCALING, and they are independent — a party of four at `/players 1` is four
// heroes against a solo horde. Conflating them is the one mistake worth naming
// in advance, so the report prints both and this suite asserts it.

import { describe, expect, it } from "vitest";

import { simulateLevel } from "../../engine/sim/simulate.ts";

/** A short run — long enough to seat a party and step it, short enough that the
 * suite stays seconds rather than minutes. */
const SHORT = { maxMinutes: 0.4, realisticPacing: false } as const;

/**
 * How long a test that flies a real party is ALLOWED to take.
 *
 * Every case in this file steps the actual engine, and simulated minutes cost
 * real seconds — so none of them belong on vitest's five-second default, which
 * was never chosen for them. It was the LEVELLING case that proved it, timing
 * out at 5.1s on a loaded machine while asserting nothing about time at all:
 * a red suite that says nothing about the code, which is worse than a slow one.
 *
 * Generous on purpose. This is not a performance budget — a genuinely wedged
 * simulation still fails, just after a wait long enough that a busy CI box
 * cannot be the reason.
 */
const SIM_TIMEOUT_MS = 60_000;

describe("a simulated party", () => {
  it(
    "says nothing about a party when there is not one",
    () => {
      // Party 1 is the whole shipped campaign and every existing measurement, so
      // the report it produces must be the report it always produced — no new
      // section for a consumer to trip over.
      const report = simulateLevel({
        levelId: "moon",
        difficulty: "medium",
        seed: 4242,
        ...SHORT,
      });
      expect(report.party).toBeUndefined();
      expect(report.hero).toBeDefined();
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "seats the party it was asked for, each in its own lane",
    () => {
      // A party of four identical meta builds measures ONE build four times,
      // which is the least interesting thing a party simulator could do — so the
      // seats are dealt distinct profiles unless the caller says otherwise.
      const report = simulateLevel({
        levelId: "moon",
        difficulty: "medium",
        seed: 7,
        party: 4,
        ...SHORT,
      });
      expect(report.party?.size).toBe(4);
      expect(report.party?.seats).toHaveLength(4);
      const lanes = new Set(report.party!.seats.map((s) => s.profile));
      expect(lanes.size).toBeGreaterThan(1);
      // Seat 0 is still the hero the rest of the report describes.
      expect(report.party!.seats[0]!.seat).toBe(0);
      expect(report.party!.seats[0]!.levelEnd).toBe(report.hero.levelEnd);
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "takes an authored lane per seat, repeating a short list",
    () => {
      const report = simulateLevel({
        levelId: "moon",
        difficulty: "medium",
        seed: 7,
        party: 3,
        partyProfiles: ["ranged"],
        ...SHORT,
      });
      // Seat 0 keeps `profile`; the rest take the authored list, which repeats.
      expect(report.party!.seats[1]!.profile).toBe("ranged");
      expect(report.party!.seats[2]!.profile).toBe("ranged");
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "reports PER CAPITA, which is the read the tuning pass moves a lever on",
    () => {
      // The warning worth repeating: a party shares each kill AND clears faster, so the
      // per-KILL share and the per-capita RATE move in opposite directions.
      // Reading the share alone concludes that grouping is a tax when it is a
      // bonus, or the reverse — so the rate is what the report carries.
      const report = simulateLevel({
        levelId: "moon",
        difficulty: "medium",
        seed: 11,
        party: 2,
        ...SHORT,
      });
      const per = report.party!.perCapita;
      expect(per.xpPerMinute).toBeGreaterThan(0);
      expect(Number.isFinite(per.killsPerMinute)).toBe(true);
      expect(per.damageTaken).toBeGreaterThanOrEqual(0);
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "keeps `--party` and `/players` as two different numbers",
    () => {
      // The collision the two knobs invite. A party of two under the shipped 1×
      // tuning must report a scaling of 1 — the horde was not re-priced just
      // because more heroes turned up.
      const report = simulateLevel({
        levelId: "moon",
        difficulty: "medium",
        seed: 13,
        party: 2,
        ...SHORT,
      });
      expect(report.party!.size).toBe(2);
      expect(report.party!.playersScaling).toBe(1);
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "replays identically from the same seed at the same party size",
    () => {
      // Determinism is what makes the instrument an instrument: the tuning pass
      // is a comparison between runs, and a simulator that wandered would report
      // its own noise as a balance change.
      const once = simulateLevel({
        levelId: "moon",
        difficulty: "medium",
        seed: 99,
        party: 3,
        ...SHORT,
      });
      const twice = simulateLevel({
        levelId: "moon",
        difficulty: "medium",
        seed: 99,
        party: 3,
        ...SHORT,
      });
      expect(JSON.stringify(twice)).toEqual(JSON.stringify(once));
    },
    SIM_TIMEOUT_MS,
  );

  it(
    "survives a party member levelling up",
    () => {
      // The bug a party found on its first run: `levelup` was still a GLOBAL
      // phase (the per-player screens split had not landed), so a party member's
      // ding paused the whole run — and a simulator that only drained SEAT 0's
      // chooser wedged, because the phase never resumed. A run that completes at
      // all is the assertion.
      const report = simulateLevel({
        levelId: "moon",
        difficulty: "easy",
        seed: 5,
        party: 3,
        maxMinutes: 1,
        realisticPacing: false,
      });
      expect(report.outcome).not.toBe("stuck");
      // …and somebody other than seat 0 actually grew, which is what makes the
      // assertion above mean something.
      const grew = report.party!.seats.some((s) => s.levelEnd > s.levelStart);
      expect(grew).toBe(true);
    },
    SIM_TIMEOUT_MS,
  );
});

describe("every seat in a simulated party is immortal", () => {
  // THE CALIBRATION HERO HAS NEVER BEEN ALLOWED TO STAY DOWN — his death is
  // booked as a pressure gauge and the measurement marches on. Nothing extended
  // that to the OTHER seats, and nothing could have caught it: seat 0's revive
  // hangs off the `dying` PHASE, and `dying` fires on `partyWiped`, so a party
  // that loses one member never reaches it. The result is a party of N that is
  // really a party of one, with every per-capita figure still divided by N — a
  // bot that died reported as a balance result.
  it(
    "stands its casualties back up and books the deaths against their seats",
    () => {
      const report = simulateLevel({
        levelId: "moon",
        difficulty: "nightmare",
        seed: 3,
        party: 4,
        maxMinutes: 0.8,
        realisticPacing: false,
      });
      const seats = report.party!.seats;
      // Nightmare from level 1 kills a fresh party; what matters is that nobody is
      // left lying there at the end.
      expect(seats.every((s) => s.alive)).toBe(true);
      // …and that the deaths were BOOKED rather than swallowed, per seat, so a
      // reader can tell a party that cruised from one that was resurrected forty
      // times into the same per-capita number.
      expect(seats.every((s) => s.deaths >= 0)).toBe(true);
      expect(seats.reduce((n, s) => n + s.deaths, 0)).toBeGreaterThan(0);
    },
    SIM_TIMEOUT_MS,
  );
});

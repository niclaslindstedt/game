// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The effects gallery's DRIVE shelf, DRIVEN — every exhibit's staging run
// headlessly through the real road, and held to what it advertises.
//
// WHY THIS SUITE EXISTS AND WHY IT IS UNUSUAL. Every other exhibit in the
// gallery FIRES its effect: it pushes an engine event and the game's own
// consumers draw it, so an exhibit that stages a legal id shows the right thing
// by construction. A drive exhibit cannot do that. A collision is a momentum sum
// (`solveImpact`) between a moving car and a thing planted in front of it, and
// everything the exhibit is OF — how many sparks, how far the gore goes, how
// hard the frame is shoved, and which of the two body sound shelves plays — is
// priced off the joules that sum returns. So a drive exhibit's whole show is a
// plant distance and a lateral offset, and a re-tune of the road's masses, its
// top speed, its wear budget or its sound thresholds can silently turn TAKEN
// SQUARE into a glancing thud with every other check in the repo still green.
//
// A shelf showing the wrong shelf is worse than no shelf at all — a reviewer
// would tune the light bank while looking at the heavy one — so each exhibit
// declares the event it exists to show (`shows`) and the bank the road must pick
// that event's take from (`bank`), and this suite drives all eight and checks.
//
// It runs the ENGINE ONLY: `createDrive`, the exhibit's own `road`, `stepDrive`.
// No canvas, no synth — the staging deliberately touches no browser (see
// drive-exhibits.ts), which is the whole reason it can be tested at all.

import {
  createDrive,
  stepDrive,
  type DriveEvent,
  type DriveState,
} from "@game/core";
import { describe, expect, it } from "vitest";

import { effectsCatalog } from "../../pwa/src/game/effects-gallery/effects-catalog.ts";
import {
  isDriveExhibit,
  type DriveExhibit,
} from "../../pwa/src/game/effects-gallery/exhibit-kit.ts";
import {
  bodyHitSound,
  BREAKDOWN_SOUND,
  panelSound,
  SHED_SOUND,
  trafficHitSound,
  BODY_SOUNDS,
  CRUNCH_SOUNDS,
  HARD_BODY_SOUNDS,
  PANEL_SOUNDS,
  SCRAPE_SOUNDS,
} from "../../pwa/src/game/drive-screen/drive-sounds.ts";

/** The host's own constants, repeated here because a test that drove the road
 * differently from the gallery would be testing a road nobody sees. */
const STEP_MS = 16;
const SEED = 20250725;
const FLAT_OUT = { pedal: 1, wheel: 0 };

const SHELF = effectsCatalog().filter(isDriveExhibit);

/** Build and drive one exhibit's road exactly as `runDriveExhibit` does, for the
 * length of its show, and hand back every event it booked. */
function play(exhibit: DriveExhibit): { event: DriveEvent; atMs: number }[] {
  const drive: DriveState = createDrive({
    seed: SEED,
    direction: exhibit.direction ?? 1,
    difficulty: exhibit.difficulty ?? "medium",
    to: "goodco_hq",
    gib: exhibit.gib ?? true,
  });
  exhibit.road?.(drive);
  const out: { event: DriveEvent; atMs: number }[] = [];
  const showMs = exhibit.showMs ?? 2000;
  for (let t = 0; t < showMs; t += STEP_MS) {
    stepDrive(drive, STEP_MS, exhibit.input ?? FLAT_OUT);
    for (const event of drive.events) out.push({ event, atMs: drive.ms });
  }
  return out;
}

/** The sound the drive screen would play for an event — the app's own pick, so
 * a re-tuned threshold moves this test and not just the game. */
function soundFor(event: DriveEvent): string | undefined {
  if (event.type === "pedestrianHit")
    return bodyHitSound(event.pos.x, event.pos.y, event.joules);
  if (event.type === "trafficHit")
    return trafficHitSound(event.pos.x, event.pos.y, event.joules);
  if (event.type === "panelBent") return panelSound(event.pos.x, event.pos.y);
  if (event.type === "partShed") return SHED_SOUND;
  if (event.type === "breakdown") return BREAKDOWN_SOUND;
  return undefined;
}

describe("effects gallery / the DRIVE shelf", () => {
  it("has a shelf to check, or this suite proves nothing", () => {
    expect(SHELF.length).toBeGreaterThanOrEqual(8);
  });

  for (const exhibit of SHELF) {
    it(`${exhibit.id} shows what it says it does`, () => {
      const events = play(exhibit);
      if (!exhibit.shows) {
        // THE RIDE — the one exhibit with nothing in front of it. Its claim is
        // the opposite one: the road stays empty, so the speed-scaled tremble is
        // the only thing on screen. A stray collision here would be a spawner
        // the staging failed to silence, and it would be invisible in review.
        const hits = events.filter(
          (e) =>
            e.event.type === "pedestrianHit" || e.event.type === "trafficHit",
        );
        expect(hits, `${exhibit.id} was meant to hit nothing`).toEqual([]);
        return;
      }
      const wanted = events.filter((e) => e.event.type === exhibit.shows);
      expect(
        wanted.length,
        `${exhibit.id} staged no ${exhibit.shows} in its ${exhibit.showMs ?? 2000} ms show — ` +
          `re-tune its plant distance in drive-exhibits.ts (it booked: ` +
          `${events.map((e) => e.event.type).join(", ") || "nothing"})`,
      ).toBeGreaterThan(0);
    });

    if (exhibit.bank) {
      it(`${exhibit.id} lands on its own sound bank`, () => {
        const first = play(exhibit).find(
          (e) => e.event.type === exhibit.shows,
        )?.event;
        expect(first, `${exhibit.id} staged no ${exhibit.shows}`).toBeDefined();
        const sound = first ? soundFor(first) : undefined;
        expect(
          exhibit.bank,
          `${exhibit.id} plays ${sound}, which is not the shelf it advertises — ` +
            `the collision's energy has drifted across a threshold in drive-sounds.ts`,
        ).toContain(sound);
      });
    }

    it(`${exhibit.id} lands its collision early in the show`, () => {
      const events = play(exhibit);
      if (!exhibit.shows) return;
      const at = events.find((e) => e.event.type === exhibit.shows)?.atMs ?? 0;
      // The show is a LOOP, so a hit that lands in its last third is a hit the
      // eye never gets to see the aftermath of.
      expect(at, `${exhibit.id} hits at ${at} ms`).toBeLessThan(
        (exhibit.showMs ?? 2000) * 0.66,
      );
      // …and one on the opening tick is over before the eye has arrived.
      expect(at).toBeGreaterThan(200);
    });
  }

  it("covers every sound bank the road can pick from", () => {
    // The banks, not the ids: WHICH take plays is hashed off where the hit
    // happened, so a shelf covers a bank rather than each of its variants.
    const banks: [string, readonly string[]][] = [
      ["light bodies", BODY_SOUNDS],
      ["heavy bodies", HARD_BODY_SOUNDS],
      ["scrapes", SCRAPE_SOUNDS],
      ["crunches", CRUNCH_SOUNDS],
      ["panels", PANEL_SOUNDS],
      ["a shed part", [SHED_SOUND]],
      ["a breakdown", [BREAKDOWN_SOUND]],
    ];
    const played = new Set(
      SHELF.flatMap((exhibit) =>
        play(exhibit)
          .map((e) => soundFor(e.event))
          .filter((id): id is string => id !== undefined),
      ),
    );
    for (const [name, bank] of banks) {
      expect(
        bank.some((id) => played.has(id)),
        `no drive exhibit plays ${name} (${bank.join("/")})`,
      ).toBe(true);
    }
  });
});

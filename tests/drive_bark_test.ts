// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HERO'S LINES AGAINST THE ROAD THEY ARE SAID OVER — the OPENING thought on
// the outskirt, and the RUN-IN's, which is the trip's verdict and the place
// printed as one sentence.
//
// The drive opens on a stretch of empty outskirt with one thing on it: the hero
// saying where he is going, and then what he thinks of the people he is about
// to drive through. THAT one has no wall in front of it — it is turned by the
// player and the road is held for it (`holdDriveOpening`) — so what is pinned
// here is that every page is up long enough to have been PRINTED, which is a
// claim about `bark.ts` alone.
//
// THE RUN-IN'S LINE IS THE ONE UNDER A CLOCK, and it is under a hard one: it is
// printed over a rolling car between the sight of the place and the black, its
// halves are a CROSS PRODUCT (every verdict against every destination), and the
// two ends of the constraint live in different trees — the beat in `engine/`,
// the page clock in the app — so nothing but a test can hold them together.

import { describe, expect, it } from "vitest";

import { DRIVE, thoughtDef } from "@game/core";

import { arrivalLine, driveVoice } from "../pwa/src/game/drive-screen/voice.ts";

import {
  ageBark,
  barkMs,
  crawlMs,
  openBark,
  turnBark,
} from "../pwa/src/game/drive-screen/bark.ts";

/** The pages of a thought as the drive screen builds them — plain string rows;
 * none of the road's lines carries a `{ them: [...] }` block, because he is
 * alone in the car. */
function pagesOf(id: string): string[][] {
  const def = thoughtDef(id);
  expect(def, `no thought ${id}`).toBeDefined();
  return (def?.pages ?? []).map((page) =>
    Array.isArray(page) ? [...page] : [...page.them],
  );
}

describe("the drive's opening thought", () => {
  // BOTH LEGS SAY SOMETHING OUT THERE, and neither is measured against the road
  // any more. The approach is as long as the reading takes: the town is pushed
  // along in front of the car while a page is up and planted a taper ahead when
  // the last one is turned away — which is why a THIRD page is a line in
  // `content/thoughts.yaml` and nothing else.
  it.each(["drive_out_welfare", "drive_home_errand"])(
    "is a thought the road can be held for, however many pages it grows",
    (id) => {
      const pages = pagesOf(id);
      expect(pages.length).toBeGreaterThan(0);
      // Every page is its own beat the player turns, so the one thing that
      // matters about the set is that each of them is a page with words on it —
      // an empty one would be a tap that looked like nothing happening.
      for (const page of pages) expect(page.join("").length).toBeGreaterThan(0);
    },
  );

  it("gives every page more time than its own crawl needs", () => {
    // A BARK IS NEVER DISMISSED AND NEVER WAITS — the road drives out from
    // under it on the clock below — so a hold shorter than the page's own crawl
    // would retire the line mid-word. (The opening's thought is the exception
    // and is safe either way: nothing but a thumb turns that one.)
    for (const id of [
      "drive_out_welfare",
      "drive_home_errand",
      "drive_broke_down",
      "drive_arrive_goodco",
      "drive_arrive_home",
    ]) {
      for (const page of pagesOf(id)) {
        expect(barkMs(page), id).toBeGreaterThan(crawlMs(page));
      }
    }
  });

  it("prices a page's punctuation rather than its length", () => {
    // The regression this replaced an estimate to fix. Two pages of the same
    // character count, one written with the pauses the typewriter honours —
    // sized off `page.join(" ").length` they were the same line, and the one
    // with the beats in it was cut off short of its last word.
    const plain = ["A LINE THAT JUST KEEPS GOING ON AND ON OK"];
    const beats = ["A LINE. THAT JUST. KEEPS GOING. ON AND ON"];
    expect(plain[0]?.length).toBe(beats[0]?.length);
    expect(crawlMs(beats)).toBeGreaterThan(crawlMs(plain));
  });
});

// ── WHICH LINES THE CLOCK OWNS, AND WHICH ONE THE THUMB DOES ────────────────
// The two kinds of line the road has, held apart by one flag. Worth pinning
// because the failure modes are opposite and both are silent: a bark that
// waited would strand an unattended road on a line nobody is there to dismiss,
// and an opening thought that did not wait would be a held town nothing ever
// releases — a car driving out of town forever.
describe("a line the road waits for", () => {
  const PAGES = [["FIRST."], ["SECOND."]];

  it("is never retired by the clock, however long the road runs", () => {
    const live = openBark("held", PAGES, 0, true);
    expect(ageBark(live, 10_000_000)).toBe(live);
  });

  it("turns page by page on the thumb, and then goes", () => {
    const first = openBark("held", PAGES, 0, true);
    const second = turnBark(first, 1000);
    expect(second?.page).toBe(1);
    expect(second?.waits).toBe(true);
    expect(turnBark(second!, 2000)).toBeNull();
  });

  it("leaves an ordinary bark on its own clock", () => {
    const live = openBark("bark", PAGES, 0);
    expect(live.waits).toBe(false);
    expect(ageBark(live, live.untilMs - 1)).toBe(live);
    expect(ageBark(live, live.untilMs)?.page).toBe(1);
  });
});

// ── THE RUN-IN'S LINE, WHICH IS TWO THOUGHTS ────────────────────────────────
// What he made of the trip is not carried off the road to be said at the far
// end: `driveVerdict` picks a few words and `arrivalLine` prints them onto the
// front of the place's own line, as one sentence — ROUGH RIDE. THERE'S GOODCO.
//
// WHICH PUTS THE VERDICTS UNDER A CLOCK THEY DID NOT USED TO BE UNDER. Spoken
// in a monologue box they had as long as the player took to tap; printed over a
// rolling car they have from the sight of the place (`sightMs`) to the black
// (`blackoutMs`), and the pairing is a CROSS PRODUCT — every verdict against
// every destination — so the one that overruns is a combination nobody wrote
// down. Both halves of the constraint live in different trees again (the beat
// in `engine/`, the page clock in the app), so only this can hold them together.
const VERDICTS = [
  "drive_arrive_clean",
  "drive_arrive_wreck",
  "drive_arrive_posts",
  "drive_arrive_cars",
  "drive_arrive_quick",
  "drive_arrive_slow",
  "drive_arrive_some",
  "drive_arrive_bumpy",
] as const;

describe("the run-in's line", () => {
  it("says the verdict and then the place, on one row", () => {
    const [page, ...rest] = arrivalLine(
      "drive_arrive_bumpy",
      "drive_arrive_goodco",
    );
    expect(rest).toEqual([]);
    expect(page).toEqual(["ROUGH RIDE. THERE'S GOODCO."]);
  });

  it("is ONE page however long the place's own line is", () => {
    // A page break would turn one throwaway remark into two beats, and the
    // run-in has room for exactly one — the box would still be turning itself
    // over as the black landed.
    for (const to of ["goodco_hq", "garage"]) {
      const { sight } = driveVoice({ to });
      for (const verdict of VERDICTS) {
        expect(arrivalLine(verdict, sight), `${verdict} → ${to}`).toHaveLength(
          1,
        );
      }
    }
  });

  it.each(["goodco_hq", "garage"])(
    "types every verdict out at %s before the black takes the picture",
    (to) => {
      const { sight } = driveVoice({ to });
      // The window is the ROAD's, and it is the thing to move if a verdict
      // outgrows it — the line is the writing, the beat is a number.
      const windowMs = DRIVE.arrival.blackoutMs - DRIVE.arrival.sightMs;
      for (const verdict of VERDICTS) {
        const page = arrivalLine(verdict, sight)[0] ?? [];
        expect(crawlMs(page), `${verdict} → ${to}`).toBeLessThanOrEqual(
          windowMs,
        );
      }
    },
  );

  it("keeps the fade behind the black rather than on top of it", () => {
    // `arrivalHoldMs` follows `blackoutMs`: widening the run-in for a longer
    // line and leaving the hold where it was would hand the crossing over
    // mid-fade.
    expect(
      DRIVE.arrivalHoldMs - DRIVE.arrival.blackoutMs,
    ).toBeGreaterThanOrEqual(1200);
  });
});

describe("which leg's voice a road is driven to", () => {
  it("gives each destination its own two lines, and neither of them shared", () => {
    // THE TWO LEGS MUST NOT SOUND LIKE ONE TRIP. Going out he has an errand and
    // an opinion about the people he is about to drive through; coming back he
    // has the part on the passenger seat and has stopped thinking about them
    // entirely. If either id were shared, the leg home would repeat the sourest
    // line in the game — which is the one thing the absence is for.
    const out = driveVoice({ to: "goodco_hq" });
    const home = driveVoice({ to: "garage" });
    expect(new Set(Object.values(out)).size).toBe(2);
    expect(new Set(Object.values(home)).size).toBe(2);
    for (const key of ["monologue", "sight"] as const) {
      expect(home[key]).not.toBe(out[key]);
      // …and every one of them is a thought the catalog actually has: the drain
      // says an id and the box prints whatever comes back, so a typo here is a
      // silent line rather than a crash.
      expect(thoughtDef(out[key]), out[key]).toBeDefined();
      expect(thoughtDef(home[key]), home[key]).toBeDefined();
    }
    // A destination the road has no leg for still speaks — the trip out's
    // lines, which is what the shelf plays when nothing has been chosen.
    expect(driveVoice({ to: "nowhere_at_all" })).toEqual(out);
  });
});

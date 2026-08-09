// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OPENING THOUGHT AGAINST THE ROAD IT IS SAID OVER.
//
// The drive opens on a stretch of empty outskirt with one thing on it: the hero
// saying where he is going, and then what he thinks of the people he is about
// to drive through. Both pages have to be READ in that window, and the window
// has two walls that live in two different files — the road is laid out in
// `DRIVE.opening` (engine) and the pages are timed by `bark.ts` (app), so
// nothing but a test can hold them against each other. It has already come
// apart once in each direction: an approach cut to five seconds left the second
// page landing over the crowd it is only funny said BEFORE, and a barked page
// sized off a character count sat there long enough to still be up when the
// instruments arrived.
//
// THE FAR WALL IS `dashAtPx`, NOT THE GATE. The hand-over is the frame the
// screen stops being a road with a man on it and becomes an instrument panel;
// a line still being read across it is a line the player chose the dashboard
// over, and the town is a whole second behind that.

import { describe, expect, it } from "vitest";

import { DRIVE, thoughtDef } from "@game/core";

import { driveVoice } from "../pwa/src/game/drive-screen/voice.ts";

import { barkMs, crawlMs } from "../pwa/src/game/drive-screen/bark.ts";

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

/** Drive-clock ms at a world x on the approach — the whole of which is held at
 * `entrySpeedPx`, which is what makes every distance out there a duration. */
function msAt(px: number): number {
  return (px / DRIVE.opening.entrySpeedPx) * 1000;
}

describe("the drive's opening thought", () => {
  // BOTH LEGS SAY SOMETHING OUT THERE and both are pressed against the same
  // wall. The road is symmetric — the outskirt the trip out opens over is the
  // one the trip home finishes on and vice versa — so the deadline below is the
  // same deadline whichever way the leg runs, and a homeward page that overran
  // it would be read over the instruments arriving exactly as an outbound one
  // would.
  it.each(["drive_out_welfare", "drive_home_errand"])(
    "reads %s out between the car settling and the wheel coming back",
    (id) => {
      const { opening } = DRIVE;
      const pages = pagesOf(id);
      expect(pages).toHaveLength(2);

      // He starts as the car settles into frame…
      const startMs = msAt(opening.sayAtPx);
      // …and the deadline is the hand-over: the instruments slide in and the
      // wheel becomes his one second before the town (`dashAtPx` back from the
      // gate).
      const deadlineMs = msAt(opening.cityPx - opening.dashAtPx);

      const spokenMs = pages.reduce((ms, page) => ms + barkMs(page), 0);
      expect(startMs + spokenMs).toBeLessThanOrEqual(deadlineMs);
    },
  );

  it("gives every page more time than its own crawl needs", () => {
    // The wall the pages are pressed against above is only worth having if a
    // page that fits it is a page that was actually printed: a bark is never
    // dismissed and never waits, so a hold shorter than the crawl would retire
    // a line mid-word.
    for (const id of [
      "drive_out_welfare",
      "drive_home_errand",
      "drive_broke_down",
      "drive_arrive_goodco",
      "drive_arrive_door",
      "drive_arrive_home",
      "drive_arrive_ship",
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

describe("which leg's voice a road is driven to", () => {
  it("gives each destination its own three lines, and none of them shared", () => {
    // THE TWO LEGS MUST NOT SOUND LIKE ONE TRIP. Going out he has an errand and
    // an opinion about the people he is about to drive through; coming back he
    // has the part on the passenger seat and has stopped thinking about them
    // entirely. If any of the three ids were shared, the leg home would repeat
    // the sourest line in the game — which is the one thing the absence is for.
    const out = driveVoice({ to: "goodco_hq" });
    const home = driveVoice({ to: "garage" });
    expect(new Set(Object.values(out)).size).toBe(3);
    expect(new Set(Object.values(home)).size).toBe(3);
    for (const key of ["monologue", "sight", "door"] as const) {
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

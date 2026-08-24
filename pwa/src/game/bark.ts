// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A MINIGAME'S VOICE, AND ITS CLOCK — how long one of the hero's lines stays
// on the screen, and how a two-page thought turns itself over. Shared by every
// interlude with a speech box (the road's, the flight's); the drive is the
// worked example the doc below speaks in.
//
// A LINE SAID AT SPEED IS A BARK, NOT A SCENE, and that is the design of nearly
// all of the drive's voice. The hero's remark about minding how you go is funny
// BECAUSE he says it while driving, and a box that stopped the car to deliver it
// would turn a man talking to himself at the wheel into a cutscene about talking
// to himself. So a bark prints over the moving road, holds long enough to read,
// and gets out of the way on its own — which is also what leaves an unattended
// road (the attract loop, a playtest) nothing to be stuck on.
//
// THE OPENING IS THE EXCEPTION, and it is the opposite in every respect
// (`Speech.waits`). Out on the approach the car is held, nothing is scored and
// there is nothing else to be doing, so that one is turned by the PLAYER and the
// ROAD waits for it (`holdDriveOpening`, engine) — the town is kept out of reach
// until the last page goes. Which is what makes the clock below a floor on how
// long a line is up rather than a budget it has to fit: a page added to the
// opening thought lengthens the approach instead of overrunning it.

import { pauseAfter } from "@ui/lib/typewriter.ts";

/**
 * One of the hero's thoughts, mid-delivery — which one, its pages, how far
 * through them he has got, and the drive-clock ms this page gives way at.
 */
export type Speech = {
  id: string;
  pages: string[][];
  page: number;
  /** Drive-clock ms this page is retired at — the drive's clock rather than
   * the wall's, so a paused road holds the line where it was. Ignored while
   * `waits` holds, which is the one line nothing but a thumb turns. */
  untilMs: number;
  /**
   * DOES THIS ONE WAIT FOR A THUMB — true for the OPENING thought and nothing
   * else on the road.
   *
   * The opening is the one line said while the car is being held, with no clock
   * running and nothing the player could be doing instead, and the road waits
   * for it (`holdDriveOpening`) — so it is read at a person's own pace and a
   * third page costs a re-tune of nothing. Every other line is a BARK over a
   * road at speed and retires itself: a box that stopped the car to deliver a
   * remark about the suspension would turn a man muttering at the wheel into a
   * cutscene about muttering at the wheel, and would strand an unattended road
   * on a line nobody is there to dismiss.
   */
  waits: boolean;
};

/**
 * HOW LONG THE CRAWL ITSELF TAKES (ms) — the page's own printing, asked of the
 * typewriter that will print it rather than estimated from its length.
 *
 * A CHARACTER COUNT IS NOT A DURATION, which is what the estimate this replaced
 * kept getting wrong at both ends: `useTypewriter` prints letters at 30 ms and
 * then HOLDS on the punctuation — 260 ms on a full stop, 440 on the tail of an
 * ellipsis — so two lines of the same length can differ by most of a second,
 * and a line written with pauses in it is exactly the line that needs them
 * respected. Reading the real table (`pauseAfter`) makes this the printing time
 * and nothing else, which is what lets the dwell below be a number about
 * READING rather than a fudge that has to cover both.
 *
 * The reveal fires the first character after one base gap and does not wait
 * after the last, which is the sum this walks.
 */
export function crawlMs(page: readonly string[]): number {
  const full = page.join("\n");
  if (full.length === 0) return 0;
  let ms = 30;
  for (let i = 0; i < full.length - 1; i += 1) ms += pauseAfter(full, i);
  return ms;
}

/**
 * …AND HOW LONG THE FINISHED LINE SITS THERE AFTERWARDS (ms).
 *
 * The beat the player actually reads in: the crawl only guarantees the words
 * arrived. Long enough for a phone-sized box of capitals to be taken in without
 * effort, short enough that a remark thrown out at 120 mph is behind him by the
 * time the next thing happens.
 */
const DWELL_MS = 1600;

/**
 * The floor under a very short page — "THERE'S GOODCO." prints in under half a
 * second, and a box that came and went inside two would read as a flicker
 * rather than as a man saying something.
 */
const MIN_MS = 2600;

/** How long a page of a bark is up: its own crawl, plus a beat to read it back. */
export function barkMs(page: readonly string[]): number {
  return Math.max(MIN_MS, crawlMs(page) + DWELL_MS);
}

/** Raise a thought's first page at `nowMs` on the drive's clock. `waits` is the
 * opening's line and only ever that — see `Speech`. */
export function openBark(
  id: string,
  pages: string[][],
  nowMs: number,
  waits = false,
): Speech {
  return {
    id,
    pages,
    page: 0,
    untilMs: nowMs + barkMs(pages[0] ?? []),
    waits,
  };
}

/**
 * The bark's own clock: what `live` should be at `nowMs`. `live` itself while
 * this page still has time, the next page once it does not, and null after the
 * last one — which is the box taking itself away.
 *
 * A WAITING LINE HAS NO CLOCK. It sits there until the player turns it
 * (`turnBark`), because the road it is said over is being held for it.
 */
export function ageBark(live: Speech, nowMs: number): Speech | null {
  if (live.waits || nowMs < live.untilMs) return live;
  return turnBark(live, nowMs);
}

/**
 * TURN THE PAGE — the next one, or null after the last, which is the box going.
 *
 * The clock above and the thumb both come through here, so a line that is turned
 * by a tap and one that turns itself can never disagree about what "the next
 * page" is or about when the speech is over.
 */
export function turnBark(live: Speech, nowMs: number): Speech | null {
  const page = live.page + 1;
  if (page >= live.pages.length) return null;
  return { ...live, page, untilMs: nowMs + barkMs(live.pages[page] ?? []) };
}

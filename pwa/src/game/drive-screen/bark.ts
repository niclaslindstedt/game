// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD'S VOICE, AND ITS CLOCK — how long one of the hero's lines stays on
// the screen, and how a two-page thought turns itself over.
//
// IT IS A BARK, NOT A SCENE, and that is the whole design of the drive's voice.
// The first cut froze the world for it — the same freeze the run's own dialogue
// is — and it was wrong for a reason that only shows up at speed: the hero's
// line about minding how you go is funny BECAUSE he says it while driving, and a
// box that stops the car to deliver it turns a man talking to himself at the
// wheel into a cutscene about talking to himself. So it prints over the moving
// road, holds long enough to read, and gets out of the way on its own. Nothing
// on this screen ever waits for the player to dismiss a line.
//
// WHICH MEANS THE CLOCK IN HERE IS THE ONLY THING THAT DECIDES WHETHER A LINE
// WAS READ, and on this road it is a clock with a deadline on the other end:
// both pages of the opening thought have to be off the screen by the time the
// instruments slide in and the wheel comes back (`DRIVE.opening.dashAtPx`).
// That is why this is its own module rather than two helpers inside the screen
// component — `tests/drive_bark_test.ts` holds the sum of the pages against the
// road `DRIVE.opening` lays out, so a longer line or a shorter approach fails
// there instead of in front of a player.

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
   * the wall's, so a paused road holds the line where it was. */
  untilMs: number;
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
 * effort, short enough that a two-page thought fits the ten seconds of road it
 * is said over (`DRIVE.opening`) with the last page clear of the hand-over.
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

/** Raise a thought's first page at `nowMs` on the drive's clock. */
export function openBark(id: string, pages: string[][], nowMs: number): Speech {
  return { id, pages, page: 0, untilMs: nowMs + barkMs(pages[0] ?? []) };
}

/**
 * The bark's own clock: what `live` should be at `nowMs`. `live` itself while
 * this page still has time, the next page once it does not, and null after the
 * last one — which is the box taking itself away.
 */
export function ageBark(live: Speech, nowMs: number): Speech | null {
  if (nowMs < live.untilMs) return live;
  const page = live.page + 1;
  if (page >= live.pages.length) return null;
  return { ...live, page, untilMs: nowMs + barkMs(live.pages[page] ?? []) };
}

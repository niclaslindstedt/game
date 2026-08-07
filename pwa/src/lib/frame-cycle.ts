// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A LIST OF PICTURES, PLAYED — the DOM's answer to the field renderer's
// per-frame sprite pick.
//
// The canvas never needs this: it is redrawn sixty times a second anyway, so
// "which frame is showing" is a modulo of the clock it already has. React is
// the other way round — a component renders when something changes, and an
// animation is precisely the case where the thing that changed is time. So this
// is the small timer that turns a frame list into a re-render, and it exists as
// a hook rather than as a copy inside each surface because there are four of
// them (the dialogue box, the errand offer, the talk tree, the shop counter)
// and a portrait that animates in three of the four is worse than one that
// animates in none.
//
// Generic React/UI game code: lives in pwa/src/lib/ (imported as @ui/lib/*),
// the pool a later game keeps as-is. It knows nothing about sprites — it takes
// a list and hands back one of them.
//
// THREE THINGS IT REFUSES TO DO, and each one is a bug the surfaces this
// replaced would otherwise have had:
//
//   * **It does not tick when it has nothing to play.** One frame, no frames,
//     or `active: false` and there is no interval at all — a portrait that
//     cannot move must not wake React every 130ms to say so.
//   * **It does not restart the list on every parent render.** The frames are
//     compared by CONTENT, not by identity, because a caller building the list
//     inline (`frames={[a, b]}`) hands over a new array every time — and a
//     cycle that resets on each one holds frame 0 forever, which looks exactly
//     like a broken animation.
//   * **It counts TICKS, never an index.** The state is "how many times has the
//     timer fired", and which frame that is comes out of a modulo at the end.
//     Holding the index instead would mean clamping it every time the list
//     changed length, which is state that has to be corrected after the fact —
//     the shape that makes a `setState` inside an effect look necessary.

import { useEffect, useState } from "react";

/**
 * Which of `frames` is showing right now, advancing every `delayMs`.
 *
 * @param frames   the pictures, in play order. Empty or one-long → no timer.
 * @param delayMs  how long ONE frame is held.
 * @param active   false parks the cycle on frame 0 (a speaker who has stopped
 *                 talking is not mid-blink, they are at rest).
 */
export function useFrameCycle<T>(
  frames: readonly T[],
  delayMs: number,
  active = true,
): T | undefined {
  // The list's CONTENT, as one string — the dependency the effect actually
  // wants. An array literal from a caller is a new object every render, so
  // depending on the array itself would clear and re-arm the interval on every
  // parent update and the cycle would never reach frame 1.
  const key = frames.join(" ");
  const [tick, setTick] = useState(0);

  // A NEW LIST STARTS AT ITS FIRST FRAME. Adjusted DURING RENDER (React's
  // supported "state derived from props" pattern, the same one the dialogue
  // box's paging uses) rather than in an effect: a speaker who changes
  // mid-crawl must not show the previous speaker's third frame for one paint,
  // and a setState inside an effect cascades a second render to fix it.
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setTick(0);
  }

  const count = frames.length;
  useEffect(() => {
    if (!active || count < 2 || delayMs <= 0) return undefined;
    const timer = setInterval(() => setTick((t) => t + 1), delayMs);
    return () => clearInterval(timer);
  }, [key, count, delayMs, active]);

  if (count === 0) return undefined;
  return active ? frames[tick % count] : frames[0];
}

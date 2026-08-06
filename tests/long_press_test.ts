// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PRESS-AND-HOLD GESTURE (`@ui/lib/long-press.ts`) — the machine behind
// "hold an item card to copy it as a picture". Its whole job is telling a HOLD
// apart from the two things that share its opening frames, and both mistakes
// are ones the inventory would show the player immediately: a drag-to-equip
// that also copies, or a copy whose release ALSO equips the piece.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LONG_PRESS_MS,
  LONG_PRESS_SLOP_PX,
  watchLongPress,
} from "@ui/lib/long-press.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("long press", () => {
  it("fires once the finger has stayed put long enough", () => {
    const fired = vi.fn();
    const watch = watchLongPress({ x: 100, y: 100 }, fired);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(fired).not.toHaveBeenCalled();
    expect(watch.fired).toBe(false);
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
    // `fired` is what the up-handler asks before treating the release as a tap.
    expect(watch.fired).toBe(true);
  });

  it("tolerates the wobble a finger has, and nothing more", () => {
    const fired = vi.fn();
    const watch = watchLongPress({ x: 100, y: 100 }, fired);
    watch.moved(100 + LONG_PRESS_SLOP_PX, 100);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fired).toHaveBeenCalledTimes(1);

    // A press that travels is a DRAG — the bag's drag-to-equip must never also
    // copy the card on its way past.
    const dragged = vi.fn();
    const drag = watchLongPress({ x: 100, y: 100 }, dragged);
    drag.moved(100 + LONG_PRESS_SLOP_PX + 1, 100);
    vi.advanceTimersByTime(LONG_PRESS_MS * 4);
    expect(dragged).not.toHaveBeenCalled();
    expect(drag.fired).toBe(false);
  });

  it("measures the wander from the ORIGIN, not from the last point", () => {
    // A slow drag that never steps more than the slop in one move event is
    // still a drag; measuring point-to-point would let it walk off the screen
    // with the timer alive.
    const fired = vi.fn();
    const watch = watchLongPress({ x: 0, y: 0 }, fired, { slopPx: 10 });
    for (let x = 2; x <= 40; x += 2) watch.moved(x, 0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fired).not.toHaveBeenCalled();
    expect(watch.fired).toBe(false);
  });

  it("is cancelled by the release, and cancelling twice is harmless", () => {
    const fired = vi.fn();
    const watch = watchLongPress({ x: 0, y: 0 }, fired);
    watch.cancel();
    watch.cancel();
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(fired).not.toHaveBeenCalled();
  });

  it("stays fired after a late cancel — the release still has to be swallowed", () => {
    const fired = vi.fn();
    const watch = watchLongPress({ x: 0, y: 0 }, fired);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    // pointerup arrives AFTER the hold fired: the caller cancels, then asks.
    watch.cancel();
    watch.moved(500, 500);
    expect(watch.fired).toBe(true);
    expect(fired).toHaveBeenCalledTimes(1);
  });
});

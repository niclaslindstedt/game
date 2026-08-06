// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WAKE REPAINT (`@ui/lib/canvas-wake.ts`) — the seam that redraws the
// canvases nothing else would. A label or a map card is drawn once and then
// left alone, so anything a backgrounded page does to its bitmap survives
// forever: the dialogue box came back from a tab switch wearing the bottom
// rows of the text it held when the player alt-tabbed away. The registry is
// what puts a second draw on the way back in, so what it owes is exactly this:
// every registered paint runs, an unregistered one never does again, and a
// canvas that goes away takes its listener with it.

import { describe, expect, it } from "vitest";

import { onCanvasWake, repaintCanvases } from "@ui/lib/canvas-wake.ts";

/** The two methods the module uses, recorded so the test can fire the 2D
 * context's own "your bitmap is gone" event at it. */
function fakeCanvas() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener(type: string, listener: () => void) {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    /** Fire an event at the canvas, as the browser would. */
    emit(type: string) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

describe("canvas wake repaint", () => {
  it("repaints every registered canvas, and stops at unregister", () => {
    const canvasA = fakeCanvas();
    const canvasB = fakeCanvas();
    let a = 0;
    let b = 0;
    const offA = onCanvasWake(canvasA, () => (a += 1));
    const offB = onCanvasWake(canvasB, () => (b += 1));

    repaintCanvases();
    expect([a, b]).toEqual([1, 1]);

    offA();
    repaintCanvases();
    expect([a, b]).toEqual([1, 2]);

    offB();
    repaintCanvases();
    expect([a, b]).toEqual([1, 2]);
  });

  it("survives a paint that unregisters itself mid-sweep", () => {
    // A component unmounting on the same tick a wake fires: the set is mutated
    // while it is being walked, and iterating it directly would skip the
    // neighbour that follows.
    const one = fakeCanvas();
    const two = fakeCanvas();
    let painted = 0;
    const off = onCanvasWake(one, () => {
      painted += 1;
      off();
    });
    const offTwo = onCanvasWake(two, () => (painted += 1));

    repaintCanvases();
    expect(painted).toBe(2);
    offTwo();
  });

  it("repaints one canvas when its own context is restored", () => {
    const canvas = fakeCanvas();
    let painted = 0;
    const off = onCanvasWake(canvas, () => (painted += 1));

    expect(canvas.count("contextrestored")).toBe(1);
    canvas.emit("contextrestored");
    expect(painted).toBe(1);

    // …and the listener leaves with the canvas, so a discarded element can't
    // keep a dead paint (and its captured state) alive.
    off();
    expect(canvas.count("contextrestored")).toBe(0);
    canvas.emit("contextrestored");
    expect(painted).toBe(1);
  });
});

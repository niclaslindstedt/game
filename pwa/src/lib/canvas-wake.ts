// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// REPAINT DRAW-ONCE CANVASES WHEN THE PAGE WAKES UP.
//
// A canvas that is redrawn every frame (the world, the minimap) heals itself
// from anything the browser does to its backing store while the page is in the
// background. A canvas drawn ONCE — every `PixelText` label, the map card —
// never does: nothing repaints it until its own props change, so whatever the
// browser hands back after a tab switch is what the player keeps looking at.
// And what it hands back is not reliably what we drew. A backgrounded page
// stops compositing, its canvas bitmaps may be hibernated (copied out and the
// GPU resources freed) or lost outright, and a draw that lands WHILE the page
// is hidden — a dialogue crawl typing on through a throttled timer, a page
// turn — is not composited at all: on return the tile can be re-rastered from
// the last snapshot the compositor took, so the box shows a slice of the text
// that was on screen when the player alt-tabbed away UNDER the text that
// should be there now. That is the "remnants of old text along the bottom of
// each line" the dialogue box shows after a tab switch.
//
// The cure is to redraw, so this is the one seam that says WHEN: register a
// canvas and its paint function, and the paint runs again whenever the page
// comes back to the foreground or the 2D context announces it lost its
// contents. Generic React/UI game code: lives in pwa/src/lib/ (imported as
// @ui/lib/*), the pool a later game keeps as-is.

/** The part of a canvas element this module touches — a plain object stands in
 * for one in a test, which is why it isn't typed as `HTMLCanvasElement`. */
type CanvasLike = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

const repainters = new Set<() => void>();

/**
 * Repaint every registered canvas. Exported for the tests (and for any resume
 * path that knows it just clobbered the page's canvases); the listeners below
 * are what normally calls it.
 */
export function repaintCanvases(): void {
  // Copied first: a paint may unregister itself (a component unmounting on the
  // same tick) and mutating the set mid-iteration would skip its neighbour.
  for (const paint of [...repainters]) paint();
}

let frame = 0;

/**
 * Repaint on the next animation frame, once, however many wake signals arrive.
 *
 * The frame matters: `requestAnimationFrame` only runs while the page is
 * actually being presented, so the redraw lands AFTER the browser has finished
 * whatever restoring it does on the way back — a repaint that raced ahead of
 * that restore would be the thing overwritten. With no rAF (a non-browser
 * host), paint straight away.
 */
function schedule(): void {
  if (typeof requestAnimationFrame !== "function") {
    repaintCanvases();
    return;
  }
  if (frame !== 0) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    repaintCanvases();
  });
}

let wired = false;

/** Attach the page-level wake listeners once, on the first registration. */
function wireWakeListeners(): void {
  if (wired) return;
  wired = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });
  }
  // A bfcache restore (mobile Safari's back gesture, and the shells' own
  // resume) reports itself here rather than through `visibilitychange`.
  if (typeof window !== "undefined")
    window.addEventListener("pageshow", schedule);
}

/**
 * Register `paint` as the way to redraw `canvas`, and run it again whenever the
 * page wakes up or the canvas's context is restored. Returns the unregister
 * function — call it when the canvas goes away (a component's effect cleanup).
 *
 * `paint` must draw the canvas from scratch, sizing included: a restored
 * context comes back with a blank bitmap at the default size, so a paint that
 * only touches the pixels it drew last time leaves the rest empty.
 */
export function onCanvasWake(
  canvas: CanvasLike,
  paint: () => void,
): () => void {
  wireWakeListeners();
  repainters.add(paint);
  // The 2D context's own "your bitmap is gone" signal (a GPU context loss, or
  // the browser reclaiming memory). It fires on the element, so it is the one
  // half of this that has to be per-canvas.
  canvas.addEventListener("contextrestored", paint);
  return () => {
    repainters.delete(paint);
    canvas.removeEventListener("contextrestored", paint);
  };
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Hold-to-steer pointer tracking for canvas games. Generic React/UI game
// code — lives in website/src/lib/ so it can be extracted into oss-framework
// once mature. Unifies mouse/touch/pen via Pointer Events: while held, the
// state carries the pointer position in CSS pixels relative to the element.

export type PointerState = {
  held: boolean;
  /** Position in CSS px relative to the element's top-left (while held). */
  x: number;
  y: number;
};

export type PointerTracker = {
  /** Live state — read it every simulation tick; never replaced. */
  state: PointerState;
  dispose: () => void;
};

export type PointerOptions = {
  /** Called on a quick press-and-release that barely moved — a tap. */
  onTap?: () => void;
  /** Maximum press duration for a tap (ms). */
  tapMaxMs?: number;
  /** Maximum pointer travel for a tap (CSS px). */
  tapMaxDistance?: number;
};

export function trackPointer(
  element: HTMLElement,
  { onTap, tapMaxMs = 220, tapMaxDistance = 12 }: PointerOptions = {},
): PointerTracker {
  const state: PointerState = { held: false, x: 0, y: 0 };
  let downAt = 0;
  let downX = 0;
  let downY = 0;

  const update = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    state.x = event.clientX - rect.left;
    state.y = event.clientY - rect.top;
  };
  const down = (event: PointerEvent) => {
    // Capture so steering keeps tracking when the pointer leaves the canvas.
    element.setPointerCapture(event.pointerId);
    state.held = true;
    update(event);
    downAt = performance.now();
    downX = state.x;
    downY = state.y;
  };
  const move = (event: PointerEvent) => {
    if (state.held) update(event);
  };
  const up = () => {
    if (
      state.held &&
      onTap &&
      performance.now() - downAt <= tapMaxMs &&
      Math.hypot(state.x - downX, state.y - downY) <= tapMaxDistance
    ) {
      onTap();
    }
    state.held = false;
  };
  // Long-press context menus would interrupt touch steering.
  const contextmenu = (event: Event) => event.preventDefault();

  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("contextmenu", contextmenu);

  return {
    state,
    dispose() {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("contextmenu", contextmenu);
    },
  };
}

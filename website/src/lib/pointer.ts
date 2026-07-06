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

export function trackPointer(element: HTMLElement): PointerTracker {
  const state: PointerState = { held: false, x: 0, y: 0 };

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
  };
  const move = (event: PointerEvent) => {
    if (state.held) update(event);
  };
  const up = () => {
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

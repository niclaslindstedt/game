// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pointer tracking for canvas games. Generic React/UI game code — lives in
// website/src/lib/ so it can be extracted into oss-framework once mature.
// Unifies mouse/touch/pen via Pointer Events and reports the raw gestures a
// control scheme is built from: hold state (steering), mouse hover position
// (cursor-follow steering), taps with their finger count (jump vs
// two-finger actions), and button-press edges (click actions).

export type PointerState = {
  /** Exactly one pointer is down. (Two-finger gestures pause steering.) */
  held: boolean;
  /** A mouse is over the element — its position is live without buttons. */
  hovering: boolean;
  /** Position in CSS px relative to the element's top-left. */
  x: number;
  y: number;
};

export type PointerTap = {
  /** Simultaneous pointers at the gesture's widest (1 = plain tap). */
  fingers: number;
  /** The primary pointer's type: "mouse" | "touch" | "pen". */
  pointerType: string;
};

export type PointerTracker = {
  /** Live state — read it every simulation tick; never replaced. */
  state: PointerState;
  dispose: () => void;
};

export type PointerOptions = {
  /** Called on a quick press-and-release that barely moved — a tap. */
  onTap?: (tap: PointerTap) => void;
  /** Called on every pointer-down edge (a mouse click's press half). */
  onPress?: (press: { pointerType: string }) => void;
  /** Maximum press duration for a tap (ms). */
  tapMaxMs?: number;
  /** Maximum pointer travel for a tap (CSS px). */
  tapMaxDistance?: number;
};

export function trackPointer(
  element: HTMLElement,
  { onTap, onPress, tapMaxMs = 220, tapMaxDistance = 12 }: PointerOptions = {},
): PointerTracker {
  const state: PointerState = { held: false, hovering: false, x: 0, y: 0 };
  const active = new Set<number>();
  let primaryId: number | null = null;
  let primaryType = "mouse";
  let downAt = 0;
  let downX = 0;
  let downY = 0;
  let maxFingers = 0;

  const update = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    state.x = event.clientX - rect.left;
    state.y = event.clientY - rect.top;
  };

  const down = (event: PointerEvent) => {
    // Capture so steering keeps tracking when the pointer leaves the canvas.
    element.setPointerCapture(event.pointerId);
    active.add(event.pointerId);
    maxFingers = Math.max(maxFingers, active.size);
    if (active.size === 1) {
      primaryId = event.pointerId;
      primaryType = event.pointerType;
      update(event);
      downAt = performance.now();
      downX = state.x;
      downY = state.y;
    }
    // A second finger pauses steering (it is a gesture, not a destination).
    state.held = active.size === 1;
    onPress?.({ pointerType: event.pointerType });
  };

  const move = (event: PointerEvent) => {
    // Mouse position is live even with no buttons down — cursor-follow
    // steering reads it every tick.
    if (event.pointerType === "mouse") state.hovering = true;
    if (active.size === 0 && event.pointerType !== "mouse") return;
    if (primaryId === null || event.pointerId === primaryId) update(event);
  };

  const up = (event: PointerEvent) => {
    if (!active.has(event.pointerId)) return;
    active.delete(event.pointerId);
    if (active.size === 0) {
      if (
        onTap &&
        performance.now() - downAt <= tapMaxMs &&
        Math.hypot(state.x - downX, state.y - downY) <= tapMaxDistance
      ) {
        onTap({ fingers: maxFingers, pointerType: primaryType });
      }
      maxFingers = 0;
      primaryId = null;
    }
    state.held = active.size === 1;
  };

  const enter = (event: PointerEvent) => {
    if (event.pointerType === "mouse") state.hovering = true;
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && active.size === 0) {
      state.hovering = false;
    }
  };

  // Long-press context menus would interrupt touch steering.
  const contextmenu = (event: Event) => event.preventDefault();

  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("pointerenter", enter);
  element.addEventListener("pointerleave", leave);
  element.addEventListener("contextmenu", contextmenu);

  return {
    state,
    dispose() {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("pointerenter", enter);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("contextmenu", contextmenu);
    },
  };
}

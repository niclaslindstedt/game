// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pointer tracking for canvas games. Generic React/UI game code — lives in
// pwa/src/lib/, the pool a later game keeps as-is.
// Unifies mouse/touch/pen via Pointer Events and reports the raw gestures a
// control scheme is built from: hold state with its anchor point (virtual
// dpad/joystick steering), mouse hover position (cursor-follow steering),
// taps with their finger count (jump vs second-hand actions), EXTRA FINGERS
// STILL DOWN (a second thumb as a lever — a handbrake, a horn), and
// button-press edges (click actions).

export type PointerState = {
  /** The primary pointer is down. Extra fingers never pause the hold —
   * each is a gesture of its own (see PointerTap.fingers). */
  held: boolean;
  /** A mouse is over the element — its position is live without buttons. */
  hovering: boolean;
  /** Position in CSS px relative to the element's top-left. */
  x: number;
  y: number;
  /** Where the current hold began — the virtual-dpad anchor (CSS px). */
  originX: number;
  originY: number;
  /**
   * How many EXTRA pointers are down right now, on top of the primary.
   *
   * The second hand as a HOLD rather than as a tap. `onTap({fingers: 2})`
   * already reports the second thumb pressing and releasing, which is the right
   * shape for a discrete action and the wrong one for a lever somebody keeps
   * hold of — a game with a handbrake, a horn or a sprint needs to know the
   * finger is still down, not that it once went down. Counted rather than
   * flagged so a third finger arriving does not clear the second one's hold on
   * its way out.
   */
  extras: number;
  /** The current/last primary pointer's type: "mouse" | "touch" | "pen". */
  pointerType: string;
};

export type PointerTap = {
  /** 1 = the primary pointer tapped; 2 = a second finger tapped while the
   * primary kept holding (steering continues through it). */
  fingers: number;
  /** The tapping pointer's type: "mouse" | "touch" | "pen". */
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
  const state: PointerState = {
    held: false,
    hovering: false,
    x: 0,
    y: 0,
    originX: 0,
    originY: 0,
    extras: 0,
    pointerType: "mouse",
  };
  let primaryId: number | null = null;
  let downAt = 0;
  // Fingers pressed while the primary holds, keyed by pointer id — each can
  // tap on its own (the second hand's jump button).
  const extras = new Map<number, { at: number; x: number; y: number }>();

  const localPos = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const down = (event: PointerEvent) => {
    // Retire a WEDGED primary before deciding what this press is. The primary
    // is normally cleared by its own pointerup/pointercancel, but a release the
    // element never hears about — an OS gesture claiming the touch mid-drag, a
    // pointer that ends while the tab is backgrounded — would leave `held`
    // latched true forever and demote every later finger to a mere "extra", so
    // steering silently dies for the rest of the run. Its pointer capture is
    // the tell: the browser releases capture implicitly when a pointer ends, so
    // a primary the element no longer captures is a ghost.
    if (primaryId !== null && !element.hasPointerCapture(primaryId)) {
      primaryId = null;
      state.held = false;
      extras.clear();
      state.extras = 0;
    }
    // Capture so steering keeps tracking when the pointer leaves the canvas.
    element.setPointerCapture(event.pointerId);
    const p = localPos(event);
    if (primaryId === null) {
      primaryId = event.pointerId;
      state.pointerType = event.pointerType;
      state.x = p.x;
      state.y = p.y;
      state.originX = p.x;
      state.originY = p.y;
      state.held = true;
      downAt = performance.now();
    } else {
      extras.set(event.pointerId, { at: performance.now(), x: p.x, y: p.y });
      state.extras = extras.size;
    }
    onPress?.({ pointerType: event.pointerType });
  };

  const move = (event: PointerEvent) => {
    // Mouse position is live even with no buttons down — cursor-follow
    // steering reads it every tick.
    if (event.pointerType === "mouse") state.hovering = true;
    if (primaryId === null && event.pointerType !== "mouse") return;
    if (primaryId === null || event.pointerId === primaryId) {
      const p = localPos(event);
      state.x = p.x;
      state.y = p.y;
    }
  };

  const up = (event: PointerEvent) => {
    if (event.pointerId === primaryId) {
      const p = localPos(event);
      if (
        onTap &&
        performance.now() - downAt <= tapMaxMs &&
        Math.hypot(p.x - state.originX, p.y - state.originY) <= tapMaxDistance
      ) {
        onTap({ fingers: 1, pointerType: state.pointerType });
      }
      // A leftover extra finger never inherits the hold — a new press
      // re-anchors deliberately instead of steering from a stale origin.
      primaryId = null;
      state.held = false;
      return;
    }
    const extra = extras.get(event.pointerId);
    if (extra) {
      extras.delete(event.pointerId);
      state.extras = extras.size;
      const p = localPos(event);
      if (
        onTap &&
        performance.now() - extra.at <= tapMaxMs &&
        Math.hypot(p.x - extra.x, p.y - extra.y) <= tapMaxDistance
      ) {
        onTap({ fingers: 2, pointerType: event.pointerType });
      }
    }
  };

  const enter = (event: PointerEvent) => {
    if (event.pointerType === "mouse") state.hovering = true;
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && primaryId === null) {
      state.hovering = false;
    }
  };

  // Long-press context menus would interrupt touch steering.
  const contextmenu = (event: Event) => event.preventDefault();

  // iOS interprets a quick double-tap (routine here — a tap jumps) as the
  // start of a text-selection gesture and pops the selection loupe/magnifier
  // over the game, even with user-select:none. Only preventing the touch
  // default suppresses it. Native Pointer Events fire independently of the
  // touch default action (their gestures are governed by touch-action, set to
  // none on the canvas), so steering, taps, and pointer capture are unaffected.
  const suppressTouch = (event: TouchEvent) => event.preventDefault();

  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("pointerenter", enter);
  element.addEventListener("pointerleave", leave);
  element.addEventListener("contextmenu", contextmenu);
  element.addEventListener("touchstart", suppressTouch, { passive: false });

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
      element.removeEventListener("touchstart", suppressTouch);
    },
  };
}

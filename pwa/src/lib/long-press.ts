// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PRESS-AND-HOLD GESTURE, as one state machine instead of one per surface.
// Generic React/UI game code — lives in pwa/src/lib/, the pool a later game
// keeps as-is.
//
// Every surface that wants a hold has the same three problems, and they are
// exactly the ones a naive `setTimeout` in `onPointerDown` gets wrong:
//
//   • A DRAG IS NOT A HOLD. The finger that travels is going somewhere; the
//     timer has to die the moment it leaves the slop circle, or the bag's
//     drag-to-equip fires a hold on the way past.
//   • A HOLD IS NOT A TAP. Once it fires, the pointerup that follows must be
//     swallowed by the caller — otherwise the gesture reads as both, and in the
//     inventory that means "copy the card AND equip it". `fired` is what the
//     up-handler asks.
//   • A PRESS THAT GOES AWAY TAKES ITS TIMER WITH IT. pointercancel, a lost
//     capture, an unmount mid-hold: `cancel` is idempotent and safe to call
//     from all of them, and calling it after the fire is a no-op.
//
// DOM-free on purpose (it takes coordinates, not events), so the machine is
// unit-testable without a browser.

/**
 * How long the finger has to stay put. Long enough that the drag-to-equip
 * gesture never trips it by accident, short enough that a deliberate hold does
 * not feel broken — the platform conventions cluster at 500ms and this sits
 * just inside them.
 */
export const LONG_PRESS_MS = 450;

/**
 * How far the pointer may wander and still count as held, in CSS px. A finger
 * on a phone never rests perfectly still; the inventory's own drag threshold is
 * 8px, so this sits a touch above it — a press that has already committed to a
 * drag can never also be a hold.
 */
export const LONG_PRESS_SLOP_PX = 10;

export type LongPressWatch = {
  /** Feed the pointer's latest position; leaving the slop circle cancels. */
  moved: (x: number, y: number) => void;
  /** Drop the timer. Idempotent, and a no-op once the hold has fired. */
  cancel: () => void;
  /** Whether the hold fired — the up-handler's cue to swallow the release. */
  readonly fired: boolean;
};

/**
 * Arm a hold at `origin`, calling `onFire` once if the pointer stays inside the
 * slop circle for `ms`. The caller owns the pointer events: feed `moved` from
 * pointermove and call `cancel` from pointerup / pointercancel / cleanup.
 */
export function watchLongPress(
  origin: { x: number; y: number },
  onFire: () => void,
  options: { ms?: number; slopPx?: number } = {},
): LongPressWatch {
  const slop = options.slopPx ?? LONG_PRESS_SLOP_PX;
  let fired = false;
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    fired = true;
    onFire();
  }, options.ms ?? LONG_PRESS_MS);

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    moved(x, y) {
      if (timer === null) return;
      if (Math.hypot(x - origin.x, y - origin.y) > slop) cancel();
    },
    cancel,
    get fired() {
      return fired;
    },
  };
}

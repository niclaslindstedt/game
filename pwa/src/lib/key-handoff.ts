// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KEY THAT OPENED THE SCREEN IS NOT A PRESS ON IT. Generic React/UI code
// (usable by any game) — lives in pwa/src/lib/, the pool a later game keeps
// as-is.
//
// A screen that hands over to another one ON A KEYSTROKE leaves that keystroke
// still travelling: the React handler that ran it sits on the root container,
// so the native event has the whole way up to `document` and `window` left to
// go, and the arriving screen's own `window` keydown listener is installed
// (React flushes the effect synchronously for a discrete event) BEFORE the
// event gets there. The DOM then does exactly what it promises — a listener
// added to `window` while an event is below it IS called when the event
// arrives — and one press acts twice, on two different screens.
//
// It is not hypothetical: pressing Enter to name a new hero committed the hero,
// mounted the title on the difficulty ladder, and the same Enter confirmed the
// row the cursor happened to be on — so the run started on MEDIUM and the
// player never saw the ladder at all. Keyboard players (every desktop build)
// hit it every time; a phone taps CREATE and never sees it.
//
// Every window keydown listener that can be installed by a keystroke gets this
// wrapper. The complementary half is the handing-over screen consuming its own
// key (`stopPropagation` on the field that owns it) — do both: the field's is
// exact, and this one holds for a hand-off nobody thought about yet.

/**
 * Whether `event` was already travelling when a listener installed at
 * `installedAt` (a `performance.now()` reading) came up — i.e. the listener was
 * added mid-flight and this press belongs to the screen that handed over.
 *
 * Both readings are DOMHighResTimeStamps off the same time origin, so the
 * comparison is exact. A host that stamps events any other way reads as "not a
 * hand-off" and the guard simply does nothing, which is where it was before.
 */
export function isHandoffKey(
  event: { timeStamp: number },
  installedAt: number,
): boolean {
  return event.timeStamp < installedAt;
}

/**
 * Listen for keydown on `window`, ignoring the keystroke that installed the
 * listener. Returns the detach function, so an effect is one line:
 *
 * ```ts
 * useEffect(() => onFreshKeyDown(onKeyDown), [deps]);
 * ```
 *
 * `capture` is forwarded for listeners that need the key before the focused
 * element sees it. (A capture listener is not exposed to the hand-off in the
 * first place — `window` capture runs before the event ever reaches the field
 * that would hand over — but it costs nothing to pass through, and a listener
 * should not change phase to get the guard.)
 */
export function onFreshKeyDown(
  handler: (event: KeyboardEvent) => void,
  capture = false,
): () => void {
  const installedAt = performance.now();
  const listener = (event: KeyboardEvent) => {
    if (isHandoffKey(event, installedAt)) return;
    handler(event);
  };
  window.addEventListener("keydown", listener, capture);
  return () => window.removeEventListener("keydown", listener, capture);
}

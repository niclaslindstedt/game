// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTOFOCUS IS A REQUEST THE BROWSER IS ALLOWED TO REFUSE — AND PREACT ONLY
// EVER MAKES THE REQUEST. Generic React/UI code (usable by any game) — lives in
// pwa/src/lib/, the pool a later game keeps as-is.
//
// React implemented the `autoFocus` prop itself: it called `.focus()` on the
// element once it was in the document. Preact does not — it writes the
// `autofocus` ATTRIBUTE and leaves the rest to the HTML spec, whose own rule
// (flush autofocus candidates) is that every candidate is DROPPED the moment
// something else in the document already holds focus.
//
// So the same field behaves two ways depending on how it was opened. Mounted by
// a KEYBOARD press it focuses, because nothing but the body was focused; mounted
// by a CLICK on a menu row it does not, because that `<button>` is still the
// active element. The symptom is a text box that will not take a single letter:
// the caret never appears, the placeholder sits still, and every keystroke goes
// instead to whatever `window` listener the screen underneath installed — which
// on the title screen is the row-list steering, quietly walking the cursor about
// beneath the modal.
//
// A field that must own the keyboard the moment it appears therefore asks for
// focus imperatively, which no rule refuses.

import { useEffect, type RefObject } from "react";

/**
 * Focus `ref`'s element as soon as it mounts — what React's `autoFocus` prop
 * did, and what the attribute Preact writes in its place cannot be relied on to
 * do (see the header).
 *
 * ```ts
 * const inputRef = useRef<HTMLInputElement>(null);
 * useAutoFocus(inputRef);
 * ```
 *
 * @param ref the field to focus
 * @param active focus only while true — for a field that appears before it is
 *   meant to be typed into (defaults to true, the ordinary case)
 */
export function useAutoFocus(ref: RefObject<HTMLElement>, active = true): void {
  useEffect(() => {
    if (!active) return;
    ref.current?.focus();
  }, [ref, active]);
}

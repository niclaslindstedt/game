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
    // …and if a press armed the on-screen keyboard on this field's behalf, the
    // hand-over happens here, the instant the field it was armed for exists.
    releaseSoftKeyboard();
  }, [ref, active]);
}

// ── AND FOCUS IS NOT THE SAME THING AS A KEYBOARD ───────────────────────────
// A FIELD CAN HOLD FOCUS ON A PHONE WITH NO KEYBOARD UNDER IT, and that is the
// second half of the same problem the header describes. Mobile browsers raise
// the software keyboard only for a `focus()` made WHILE A USER GESTURE IS BEING
// HANDLED — a rule with no way around it, and a deliberate one: a page that
// could pop the keyboard whenever it liked would pop it on load.
//
// A form reached by pressing a menu row cannot meet that rule on its own. The
// press mounts the screen, the screen mounts the field, and the field asks for
// focus from an EFFECT — which runs after the commit, one turn of the event loop
// past the gesture that caused it. So the caret appears, the field is genuinely
// focused, the player taps it anyway (nothing happens, it already has focus) and
// the only way in is to tap something else and back.
//
// SO THE PRESS ARMS IT AND THE FIELD TAKES IT OVER. `armSoftKeyboard` is called
// from inside the tap handler and focuses a throwaway text input that exists
// right then — which is what actually raises the keyboard — and the real field's
// `useAutoFocus` moves focus onto itself as soon as it mounts. Moving focus
// between two text inputs leaves the keyboard up; it only comes down when
// nothing wants it. The decoy is thrown away in the same breath.
//
// IT IS INERT ON A DESKTOP, where the keyboard is a keyboard: a decoy focused
// and dropped inside one task is invisible, and the real field ends up with
// focus either way.

/** The armed decoy, if a press is currently holding the keyboard open for a
 * field that has not mounted yet. At most one, ever. */
let armed: HTMLInputElement | null = null;
/** How long a decoy may wait for its field before it is thrown away regardless
 * (ms) — a press whose screen never opened must not leave a live text box in
 * the page. Generously longer than a mount, far shorter than a thought. */
const ARM_TIMEOUT_MS = 4000;

/**
 * Raise the on-screen keyboard from inside a tap, for a field that does not
 * exist yet — see the block above.
 *
 * MUST BE CALLED SYNCHRONOUSLY FROM THE GESTURE (a `click`/`pointerdown`
 * handler). Deferring it by so much as a `setTimeout(0)` spends the user
 * activation and leaves this doing nothing at all.
 *
 * ```ts
 * onClick={() => { armSoftKeyboard(); openTheFormWithTheField(); }}
 * ```
 */
export function armSoftKeyboard(): void {
  if (typeof document === "undefined") return;
  releaseSoftKeyboard();
  const decoy = document.createElement("input");
  decoy.type = "text";
  decoy.tabIndex = -1;
  decoy.setAttribute("aria-hidden", "true");
  // RENDERED, THOUGH INVISIBLE. `display:none` and `visibility:hidden` cannot
  // take focus at all, so the decoy is a real one-pixel box pinned under the
  // top-left corner at the 16px iOS refuses to zoom in on.
  decoy.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;" +
    "padding:0;border:0;outline:0;z-index:-1;font-size:16px;";
  document.body.appendChild(decoy);
  // `preventScroll`, or the page jumps to the corner the decoy is pinned in.
  decoy.focus({ preventScroll: true });
  armed = decoy;
  window.setTimeout(() => {
    if (armed === decoy) releaseSoftKeyboard();
  }, ARM_TIMEOUT_MS);
}

/**
 * Throw the decoy away — called by `useAutoFocus` once the real field has taken
 * focus, and safe to call at any time (it is a no-op with nothing armed).
 */
export function releaseSoftKeyboard(): void {
  const decoy = armed;
  armed = null;
  decoy?.remove();
}

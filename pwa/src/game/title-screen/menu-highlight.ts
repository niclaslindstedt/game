// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH ROW IS LIT, and what that answer is allowed to be used for.
//
// Two surfaces need it and they must not drift: the rows themselves
// (MenuList paints the lit one amber and shows the wisp beside it) and the
// settings tree's single bottom help line (TitleScreen), which SPEAKS FOR the
// lit row. A help line describing a row nothing is pointing at is the bug this
// module exists to make impossible — the DEVELOPER index opened on a phone
// with PLAYGROUND's help under a column where no row was highlighted.
//
// The predicate is deliberately about the INPUT rather than the cursor: a
// mouse hovers and the arrow keys step, so both leave a RESTING selection; a
// touch has neither and lights a row only while the finger is down.

import { useEffect, useState } from "react";

import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import type { MenuEntry } from "./menu-model.ts";

/** The keys that STEER the menu (TitleScreen owns the handlers). A press on one
 * means the player is navigating without a pointer, so the highlighted row has
 * to stay lit between presses. */
const STEER_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
]);

/** Does this row carry a CONTROL — a switch, slider, tick-box, bound key or
 * cycled value? Two rules turn on the answer: such a row keeps its highlight
 * after a touch (`latches`), and a screen holding one renders as the fixed
 * width settings FORM so the controls share a right edge (see MenuList). */
export function hasControl(entry: MenuEntry): boolean {
  return (
    !!entry.slider ||
    !!entry.toggle ||
    !!entry.check ||
    !!entry.binding ||
    entry.value !== undefined
  );
}

/** Whether a row may keep its highlight after a TOUCH lets go of it.
 *
 * A tap on a phone is a press, not a hover: leaving the tapped row lit is a
 * stale cursor parked wherever the last finger landed. The one exception is a
 * row that has something left to say once the finger is gone — a CONTROL that
 * carries HELP TEXT: there the highlight names the row the help line below is
 * describing and the state the player just changed. A row that merely opens
 * another menu explains nothing, so it lights only while pressed. */
export function latches(entry: MenuEntry): boolean {
  return hasControl(entry) && !!entry.blurb;
}

/** Does the player steer with something that leaves a RESTING selection? A
 * mouse hovers, and arrow keys move a highlight that must stay visible between
 * presses; a touch has neither, so it only lights what it holds.
 *
 * Both callers derive from the same two global facts — the pointer media query
 * and a window keydown — so calling this hook twice can never disagree with
 * itself the way two copies of the rule would. */
export function useRestingCursor(): boolean {
  const finePointer = useMediaQuery("(any-pointer: fine)");
  const [keySteering, setKeySteering] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (STEER_KEYS.has(e.key)) setKeySteering(true);
    };
    // A FINGER is back in charge: the highlight goes back to marking what is
    // pressed rather than where a key press left off. Listened for on the
    // window rather than on a row, so every copy of the hook hears the same
    // handover and the two can't disagree about who is steering.
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") setKeySteering(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);
  return finePointer || keySteering;
}

/** Whether the cursor RESTS visibly on this row — the row is lit with no
 * finger on it, so the help line has a subject to speak for. */
export function cursorRests(entry: MenuEntry | undefined, resting: boolean) {
  return !!entry && (resting || latches(entry));
}

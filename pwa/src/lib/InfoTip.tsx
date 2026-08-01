// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A HOVER-OR-TAP explainer: wrap anything that shows a number without saying
// what the number IS, and the player can ask it. On a desktop the pointer
// hovering the trigger raises the note; on a phone — where there is no hover at
// all, which is the reference device — a TAP raises it and the next tap
// anywhere puts it away.
//
// It exists because the game is full of surfaces that print a figure and an
// icon and nothing else: the ammunition pouch's sockets, the character sheet's
// sixteen rows. Every one of them was legible only to somebody who already knew
// what it meant.
//
// The note is PORTALED to <body> and placed by the shared anchor rule
// (`@ui/lib/anchor-box.ts`), so it escapes the modal's scroll box, never covers
// the thing that raised it, and lands on screen on a 390px-wide phone. It is
// pointer-transparent: a tap "on" the note falls through to the dismissal.
//
// Content-agnostic on purpose — it knows nothing about the pixel font or the
// game's panels, so it lives in the generic pool as `@ui/lib/InfoTip.tsx`.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { placeBeside, type BoxPos } from "./anchor-box.ts";

export function InfoTip({
  tip,
  children,
  className,
  tipClassName,
  label,
}: {
  /** The note's body. Rendered only while the note is up, so a caller may
   * derive it lazily. Nullish means the trigger explains nothing and behaves as
   * a plain wrapper — the natural shape when a row's help is optional. */
  tip: ReactNode;
  /** What the note explains — the trigger. */
  children: ReactNode;
  /** Class for the trigger wrapper (a `<span>`). */
  className?: string;
  /** Class for the portaled note box. */
  tipClassName?: string;
  /** Accessible name for the trigger, e.g. `"explain-armor"`. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<BoxPos | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  // Measure and place once the note has painted. Re-measured whenever it
  // reopens (the anchor may have scrolled) — the note is hidden until then, so
  // a mis-placed first frame never flashes.
  useLayoutEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    const anchor = anchorRef.current;
    if (!box || !anchor) return;
    setPos(
      placeBeside(anchor.getBoundingClientRect(), {
        width: box.offsetWidth,
        height: box.offsetHeight,
      }),
    );
  }, [open, tip]);

  // A TAP-raised note is dismissed by the next tap anywhere, by Escape, and by
  // anything that scrolls the anchor out from under it. Bound only while the
  // note is up, and on the CAPTURE phase so a tap on a busy panel (the bag's
  // drag machinery, a modal's backdrop) still puts the note away first.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, close]);

  if (tip == null) return <span className={className}>{children}</span>;

  // A mouse OPENS on hover and closes on leave; a touch toggles, because a
  // finger has no hover to leave with. Both read `pointerType` rather than a
  // media query: a laptop with a touchscreen genuinely has both, and the
  // gesture in hand is the honest answer to which one this is.
  const onPointerEnter = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") setOpen(true);
  };
  const onPointerLeave = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") close();
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") return;
    // Swallow the touch so the surface underneath (a modal backdrop's
    // tap-to-close, the bag's drag start) never also acts on it.
    event.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <span
      ref={anchorRef}
      className={className}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={open}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      // Keyboard reaches it the same way: tabbing to the trigger raises the
      // note, and Enter/Space toggles it — the activation `role="button"`
      // promises. Escape (handled above, while it is up) puts it away.
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setOpen((v) => !v);
      }}
      onFocus={() => setOpen(true)}
      onBlur={close}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={boxRef}
            // `.info-tip-box` carries the fixed positioning, the stacking order
            // that clears the modal band, and the pointer-transparency — the
            // portal escapes the overlay's stacking context, so a note without
            // it paints UNDER the panel that raised it.
            className={`info-tip-box${tipClassName ? ` ${tipClassName}` : ""}`}
            role="tooltip"
            style={{
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            {tip}
          </div>,
          document.body,
        )}
    </span>
  );
}

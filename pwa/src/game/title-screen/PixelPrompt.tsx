// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE LINE OF TEXT, ASKED OVER THE MENU — a session password, a port, an
// address to join.
//
// **IT IS A MODAL, NOT AN INLINE ROW**, and that is forced by the menu itself:
// the column is a list of rows the arrow keys walk, and a row that swallowed
// the keyboard would take the navigation with it — including the gamepad, which
// reaches every menu in this game by dispatching those very keys
// (`@ui/lib/gamepad-keys.ts`). So the field takes the whole screen's input
// while it is up, and hands it back on ENTER or ESCAPE.
//
// **THE FIELD IS THE ONE `NewGame.tsx` ALREADY SOLVED.** A real `<input>` sits
// transparent over a `PixelText` of what has been typed: the input owns focus,
// the caret, IME and the mobile keyboard, and the visible glyphs are the game's
// own font rather than a browser textbox's. That arrangement carries hard-won
// iOS predictive-text handling (see `hero-name.ts`) which nobody wants to
// rediscover, so this reuses the same `.pixel-input` skin rather than inventing
// a second one.
//
// **A VALUE THE FIELD CAN ALREADY REFUSE IS REFUSED HERE.** An address is
// parsed by the wire's own parser as it is typed, so a typo is caught while the
// player is still looking at what they typed — not ten seconds later as "could
// not connect", which is the worst possible answer because it blames the
// network for a missing digit.
//
// **AND IT TAKES FOCUS IMPERATIVELY** (`useAutoFocus`), never with the
// `autoFocus` prop: the modal is opened by a press on a menu row, that row is a
// `<button>` and a click leaves it holding focus, and the browser drops an
// autofocus candidate whenever anything else already has one. The prop's
// failure is silent and total — the field will not take a single letter, and
// the keystrokes go to the row list underneath instead
// (see `@ui/lib/auto-focus.ts`).

import { useEffect, useRef, useState } from "react";

import { useAutoFocus } from "@ui/lib/auto-focus.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useCenterWhileFocused } from "@ui/lib/visual-viewport.ts";

import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import type { PromptSpec } from "./menu-model.ts";

export function PixelPrompt({
  font,
  spec,
  onClose,
}: {
  font: PixelFont;
  spec: PromptSpec;
  onClose: () => void;
}) {
  const [value, setValue] = useState(spec.value);
  // Whether the field ACTUALLY holds focus, rather than the assumption that it
  // must: the lit border and the caret are the player's only evidence that
  // typing will land, so they follow the real thing.
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useAutoFocus(inputRef);
  useCenterWhileFocused(boxRef, focused);
  const ok = value.trim() ? (spec.validate?.(value.trim()) ?? true) : false;
  // The caret marks the INSERTION POINT, which on an empty field is the left
  // edge — BEFORE the grey hint, not stranded after it.
  const caret = focused ? <span className="pixel-caret" /> : null;

  const submit = () => {
    if (!ok) {
      playUiSound(synth, "back");
      return;
    }
    playUiSound(synth, "confirm");
    spec.onSubmit(value.trim());
    onClose();
  };

  // ESCAPE closes it, and is caught HERE rather than by the menu underneath:
  // while the prompt is up it owns the keyboard, and the menu's own Escape
  // would otherwise walk the player up a screen out from under the field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      playUiSound(synth, "back");
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="pixel-prompt" role="dialog" aria-label={spec.title}>
      <div className="pixel-prompt-box">
        <PixelText font={font} text={spec.title} scale={3} color="#7ef0c8" />
        <div
          ref={boxRef}
          className={`pixel-input${focused ? " focused" : ""}${ok || !value ? "" : " invalid"}`}
        >
          <div className="pixel-input-display" aria-hidden="true">
            {value ? (
              <>
                <PixelText
                  font={font}
                  text={value.toUpperCase()}
                  scale={3}
                  color={ok ? "#ffd75e" : "#ff6d6d"}
                />
                {caret}
              </>
            ) : (
              <>
                {caret}
                <PixelText
                  font={font}
                  text={spec.placeholder}
                  scale={3}
                  color="#4a515c"
                />
              </>
            )}
          </div>
          <input
            ref={inputRef}
            className="pixel-input-field"
            aria-label={spec.title.toLowerCase()}
            value={value}
            maxLength={spec.maxLength}
            spellcheck={false}
            inputMode={spec.digits ? "numeric" : "text"}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // `currentTarget`, not `target`: the element the handler is
            // attached to is the one being typed into, and it is the half the
            // event type actually knows is an <input>. `target` is a bare
            // EventTarget that happened to be typed for us before.
            onChange={(e) =>
              setValue(
                spec.digits
                  ? e.currentTarget.value.replace(/[^0-9]/g, "")
                  : e.currentTarget.value,
              )
            }
            onKeyDown={(e) => {
              // The field owns the keyboard while the prompt is up — the same
              // promise the Escape handler above makes, kept for every other
              // key: the menu underneath must not walk its cursor on the
              // arrows, nor fire the row it lands on when Enter submits this.
              e.stopPropagation();
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <div className="character-actions">
          <button
            type="button"
            className="pixel-button"
            aria-label="prompt-confirm"
            onClick={submit}
          >
            <PixelText font={font} text="OK" scale={3} color="#0b0d10" />
          </button>
          <button
            type="button"
            className="pixel-button secondary"
            aria-label="prompt-cancel"
            onClick={() => {
              playUiSound(synth, "back");
              onClose();
            }}
          >
            <PixelText font={font} text="CANCEL" scale={3} color="#9aa3ad" />
          </button>
        </div>
      </div>
    </div>
  );
}

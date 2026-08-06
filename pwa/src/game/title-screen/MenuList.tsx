// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style menu column: one button per MenuEntry, the wisp sprite as
// the selection cursor (mouse) or the row's own hovering icon (touch), and the
// per-row controls (slider / switch / tick-box / bound key / cycled value)
// pinned to a shared right edge. Purely presentational — the rows and the
// cursor live in TitleScreen; keyboard steering stays there too.
//
// WHEN a row lights up depends on the input. A mouse hovers and the arrow keys
// step, so both leave a resting highlight on the row they are on. A touch has
// neither: it lights a row while the finger is DOWN and lets go with it, the one
// exception being a help-carrying control, which keeps the highlight because the
// help line below needs to name whose help it is showing (see `latches`).

import {
  useEffect,
  useState,
  type CSSProperties,
  type ElementType,
  type RefObject,
} from "react";

import { PixelCheckbox } from "@ui/lib/PixelCheckbox.tsx";
import { PixelShinyText } from "@ui/lib/PixelShinyText.tsx";
import { PixelSlider } from "@ui/lib/PixelSlider.tsx";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { PixelToggle } from "@ui/lib/PixelToggle.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import { spriteMonoUrl, type Sprites } from "../assets.ts";
import { synth } from "../audio.ts";
import { playMenuHaptic } from "../haptics.ts";
import { bindingLabel } from "../keybindings.ts";
import { playUiSound } from "../sfx/ui.ts";
import { coinPile } from "./coin-pile.ts";
import type { MenuEntry } from "./menu-model.ts";

/** A stable 32-bit hash of a row's id — the seed a per-row animation draws its
 * rate and phase from. Not `Math.random`, which would re-roll on every
 * re-render (prices arriving, the cursor moving) and snap an icon mid-bob. */
function rowHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0 || 1;
  }
  return h;
}

/** The touch-side row icons: each hovers at its own rate and phase, so a
 * column of them breathes like a row of separate sprites instead of one strip
 * pumping in lockstep. */
function bobStyle(id: string): CSSProperties {
  const h = rowHash(id);
  // 0.9s..1.65s per bob, started up to a full cycle ago.
  const bob = 0.9 + (h % 16) * 0.05;
  return {
    "--bob": `${bob.toFixed(2)}s`,
    "--bob-delay": `${(-(((h >>> 8) % 32) / 32) * bob).toFixed(2)}s`,
  } as CSSProperties;
}

/** The keys that STEER the menu (TitleScreen owns the handlers). A press on one
 * means the player is navigating without a pointer, so the highlighted row has
 * to stay lit between presses — see `hovers`. */
const STEER_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
]);

/** Whether a row may keep its highlight after a TOUCH lets go of it.
 *
 * A tap on a phone is a press, not a hover: leaving the tapped row lit is a
 * stale cursor parked wherever the last finger landed. The one exception is a
 * row that has something left to say once the finger is gone — a CONTROL (a
 * switch, slider, tick-box, bound key, or cycled value) that carries HELP TEXT:
 * there the highlight names the row the help line below is describing and the
 * state the player just changed. A row that merely opens another menu explains
 * nothing, so it lights only while pressed. */
function latches(entry: MenuEntry): boolean {
  const control =
    !!entry.slider ||
    !!entry.toggle ||
    !!entry.check ||
    !!entry.binding ||
    entry.value !== undefined;
  return control && !!entry.blurb;
}

export function MenuList({
  font,
  sprites,
  entries,
  cursor,
  setCursor,
  cursorSprite,
  blurbMaxWidth,
  useHelpLine,
  scrollable,
  menuRef,
  selectedRowRef,
  ariaLabel = "main menu",
}: {
  font: PixelFont;
  /** The sprite set, for resolving each row's `icon` to a drawable image. */
  sprites: Sprites;
  entries: MenuEntry[];
  cursor: number;
  setCursor: (at: number) => void;
  /** The wisp sprite playing the part of Doom's skull cursor. */
  cursorSprite: string;
  /** Cap (in font units) a long blurb wraps at on narrow screens; undefined
   * keeps the roomy single-line look. */
  blurbMaxWidth: number | undefined;
  /** The settings tree hoists per-row blurbs to the bottom help line — rows
   * then render without their inline blurb (see TitleScreen `.menu-help`). */
  useHelpLine: boolean;
  /** A tall list (levels, BALANCE) that measured as genuinely overflowing:
   * cap the column and let it scroll (see useMenuOverflow). */
  scrollable: boolean;
  menuRef: RefObject<HTMLElement | null>;
  /** The row the selection cursor is on, so cursor moves can keep it in view
   * (the scrolling itself lives in a TitleScreen effect keyed on the cursor —
   * a mount-time scrollIntoView would fight the scroll-to-top on screen
   * entry). */
  selectedRowRef: RefObject<HTMLElement | null>;
  /** What the nav announces itself as. Defaults to the title menu's own name;
   * a screen that borrows the column for a single row (the roster's BACK)
   * names itself so a page never has two navs called "main menu". */
  ariaLabel?: string;
}) {
  // Which row a finger (or a mouse button) is holding down, by row id rather
  // than index: a press that changes screens unmounts the row before it is
  // released, and an index would carry the pressed look over to whatever row
  // took that slot on the next screen.
  const [pressedRow, setPressedRow] = useState<string | null>(null);
  // Does the player steer with something that leaves a RESTING selection? A
  // mouse hovers, and arrow keys move a highlight that must stay visible
  // between presses; a touch has neither, so it only lights what it holds.
  const finePointer = useMediaQuery("(any-pointer: fine)");
  const [keySteering, setKeySteering] = useState(false);
  const hovers = finePointer || keySteering;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (STEER_KEYS.has(e.key)) setKeySteering(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  // Release on the WINDOW, not the row: a press that navigates away takes its
  // row's own pointerup with it, which would leave the look latched on.
  useEffect(() => {
    if (pressedRow === null) return;
    const clear = () => setPressedRow(null);
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, [pressedRow]);
  return (
    <nav
      ref={menuRef}
      className={`title-menu${useHelpLine ? " settings-menu" : ""}${scrollable ? " scrollable" : ""}`}
      aria-label={ariaLabel}
    >
      {entries.map((entry, i) => {
        const atCursor = i === cursor;
        // The cursor rests on a row only where the input has a resting cursor
        // to give — or on a help-carrying control, the one row a touch leaves
        // lit behind it (see `latches`).
        const selected = atCursor && (hovers || latches(entry));
        // Lit while held, whatever the input: on touch this IS the highlight.
        const highlighted = selected || pressedRow === entry.aria;
        const baseColor = entry.color ?? "#ffd75e";
        const color = highlighted
          ? baseColor
          : entry.locked
            ? "#5a6068"
            : "#9aa3ad";
        // A row that leaves the app for a URL is an ANCHOR; every other row is
        // a button. The distinction is not cosmetic — see `MenuEntry.href`.
        const Row: ElementType = entry.href ? "a" : "button";
        return (
          <Row
            key={entry.aria}
            {...(entry.href
              ? {
                  href: entry.href,
                  // Off-site rows open in a new tab so a run in this document
                  // survives the trip — see `MenuEntry.external`.
                  ...(entry.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {}),
                }
              : { type: "button" })}
            ref={
              // Keyed on the CURSOR, not the highlight: this is what keyboard
              // steering scrolls back into view, and it must follow the cursor
              // even on the rows a touch device leaves unlit.
              atCursor
                ? (el: HTMLElement | null) => {
                    selectedRowRef.current = el;
                  }
                : undefined
            }
            className={`menu-item${highlighted ? " selected" : ""}${entry.locked ? " locked" : ""}${entry.shiny ? " shiny" : ""}`}
            aria-label={entry.aria}
            onPointerEnter={(e) => {
              // Hover steers the cursor — for a MOUSE only. `pointerenter`
              // fires on a touch down too, which used to park the selection on
              // the tapped row long after the finger had gone.
              if (e.pointerType === "touch") return;
              if (i !== cursor) {
                playUiSound(synth, "move");
                setCursor(i);
              }
            }}
            onPointerDown={(e) => {
              setPressedRow(entry.aria);
              if (e.pointerType !== "touch") return;
              // A finger is back in charge: the highlight goes back to marking
              // what is pressed rather than where a key press left off.
              setKeySteering(false);
              // Only a help-carrying control takes the cursor with it, so the
              // help line has a subject once the press is over.
              if (i !== cursor && latches(entry)) setCursor(i);
            }}
            onPointerLeave={() => {
              setPressedRow((at) => (at === entry.aria ? null : at));
            }}
            onClick={() => {
              // A light tap under every menu press — felt on touch
              // (where each tap IS the activation) and on click alike.
              playMenuHaptic();
              entry.action();
            }}
          >
            {/* Two takes on the same slot, swapped by pointer type in CSS.
                A mouse gets the wisp on the hovered row (hidden, not unmounted,
                so every row reserves the width and the labels stay aligned); a
                touch device — where nothing ever hovers — gets the row's own
                icon instead, bobbing beside its label so the row reads as
                something to press. A row with no icon still renders the empty
                slot, keeping that same alignment. */}
            <img
              src={cursorSprite}
              alt=""
              className="menu-cursor"
              style={{ visibility: highlighted ? "visible" : "hidden" }}
            />
            {entry.icon ? (
              // Drawn in the row label's OWN color — grey until the row is
              // selected, then the label's amber — so the icon and the words
              // read as one unit rather than a colorful sprite pinned beside
              // dim text. Single-hue, not flat: the sprite keeps its shading
              // (see monochromeDataUrl).
              <img
                src={spriteMonoUrl(sprites, entry.icon, color) ?? ""}
                alt=""
                aria-hidden="true"
                className="menu-icon"
                style={bobStyle(entry.aria)}
              />
            ) : (
              <span className="menu-icon" aria-hidden="true" />
            )}
            <span className="menu-item-text">
              <span className="menu-item-headline">
                {/* A shiny row leads with the pack's take STACKED like poker
                    chips — more coins the bigger the pack, never a fatter
                    coin — stirred up off the columns while the row is
                    highlighted. Pure CSS — no sprite. */}
                {entry.shiny && entry.coinTier ? (
                  <span className="menu-coins" aria-hidden="true">
                    {coinPile(entry.aria, entry.coinTier).map((chip) => (
                      <span
                        key={chip.key}
                        className={`${chip.className}${chip.still ? " still" : ""}`}
                        style={chip.style}
                      />
                    ))}
                  </span>
                ) : null}
                {/* A shiny row's label is struck out of metal rather than
                    printed: the bevel and the travelling highlight are masked
                    to the glyphs themselves, so the shine is IN the letters
                    (see PixelShinyText). The sweep is staggered down the list
                    so the glint rolls one row at a time. */}
                {entry.shiny ? (
                  <PixelShinyText
                    font={font}
                    text={entry.label}
                    scale={3}
                    color={color}
                    sweepDelay={(i % 6) * 0.55}
                  />
                ) : (
                  // `menu-label` is the glow's hook: the highlighted row's
                  // LABEL throws amber light (see styles.css). Pinned to the
                  // label, never to the headline around it — a filter pulls its
                  // whole subtree into one rendering group, and the headline
                  // also holds the coin pile.
                  <PixelText
                    font={font}
                    text={entry.label}
                    scale={3}
                    color={color}
                    className="menu-label"
                  />
                )}
              </span>
              {entry.subtitle && (
                // Row-bound DATA (the EXPORT picker's per-hero level +
                // standing): always a second line in the row — the
                // right-hand control centres against both lines.
                <span className="menu-item-subtitle">
                  <PixelText
                    font={font}
                    text={entry.subtitle}
                    scale={2}
                    color={highlighted ? "#9aa3ad" : "#6b7178"}
                    maxWidth={blurbMaxWidth}
                  />
                </span>
              )}
              {entry.slider && (
                <PixelSlider
                  pos={entry.slider.pos}
                  onChange={entry.slider.set}
                />
              )}
              {entry.blurb && !useHelpLine && (
                // Off the settings tree the help line shows on every row,
                // always — a dim gray subtitle under the label. On the
                // settings tree it is hoisted to the bottom help line
                // (see `.menu-help`) so a changing blurb never reflows
                // the row.
                <span className="menu-item-blurb">
                  <PixelText
                    font={font}
                    text={entry.blurb}
                    scale={2}
                    color={highlighted ? "#9aa3ad" : "#6b7178"}
                    maxWidth={blurbMaxWidth}
                  />
                </span>
              )}
            </span>
            {/* The row's control sits OUTSIDE the text column, as a
                direct flex child of the button, so `align-items: center`
                centres it vertically across the whole row (both lines of
                a two-line EXPORT row) and `margin-left: auto` pins it to
                the row's right edge. */}
            {(entry.toggle ||
              entry.value !== undefined ||
              entry.check ||
              entry.binding) && (
              <span className="menu-item-control">
                {entry.toggle && <PixelToggle on={entry.toggle.on} />}
                {entry.value !== undefined && (
                  <PixelText
                    font={font}
                    text={entry.value}
                    scale={3}
                    color={highlighted ? baseColor : "#9aa3ad"}
                  />
                )}
                {entry.check && <PixelCheckbox checked={entry.check.checked} />}
                {entry.binding && (
                  <PixelText
                    font={font}
                    text={
                      entry.binding.capturing
                        ? "PRESS A KEY"
                        : bindingLabel(entry.binding.code)
                    }
                    scale={3}
                    color={
                      entry.binding.capturing
                        ? "#7ef0c8"
                        : highlighted
                          ? "#ffd75e"
                          : "#9aa3ad"
                    }
                  />
                )}
              </span>
            )}
          </Row>
        );
      })}
    </nav>
  );
}

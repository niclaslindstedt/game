// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style menu column: one button per MenuEntry, the wisp sprite as
// the selection cursor (mouse) or the row's own hovering icon (touch), and the
// per-row controls (slider / switch / tick-box / bound key / cycled value)
// pinned to a shared right edge. Purely presentational — the rows and the
// cursor live in TitleScreen; keyboard steering stays there too. The one
// gesture it owns is a row's secret long-press (MenuEntry.hold — the DEVELOPER
// unlock hides behind the main menu's ACHIEVEMENTS row), since the timer
// belongs with the pointer handlers.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { PixelCheckbox } from "@ui/lib/PixelCheckbox.tsx";
import { PixelShinyText } from "@ui/lib/PixelShinyText.tsx";
import { PixelSlider } from "@ui/lib/PixelSlider.tsx";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { PixelToggle } from "@ui/lib/PixelToggle.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteMonoUrl, type Sprites } from "../assets.ts";
import { synth } from "../audio.ts";
import { playMenuHaptic } from "../haptics.ts";
import { bindingLabel } from "../keybindings.ts";
import { playUiSound } from "../sfx/index.ts";
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
  selectedRowRef: RefObject<HTMLButtonElement | null>;
  /** What the nav announces itself as. Defaults to the title menu's own name;
   * a screen that borrows the column for a single row (the roster's BACK)
   * names itself so a page never has two navs called "main menu". */
  ariaLabel?: string;
}) {
  // A row's secret long-press (MenuEntry.hold): which row is charging right now
  // — it wears the charge glow for as long as the press lasts — plus the pending
  // timer and the "the hold already fired" latch that swallows the click the
  // release ends in (so a completed hold never also opens the row).
  const [holding, setHolding] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  const holdFired = useRef(false);
  const cancelHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHolding(null);
  }, []);
  // Drop a pending charge if the menu unmounts (or swaps screens) mid-hold.
  useEffect(() => cancelHold, [cancelHold]);
  const startHold = useCallback(
    (entry: MenuEntry, event: ReactPointerEvent) => {
      // Every press clears the latch, so a hold whose click never arrived
      // (the pointer left the row) can't swallow a later, unrelated tap.
      holdFired.current = false;
      const hold = entry.hold;
      if (!hold) return;
      // Only a primary press charges; a mouse right/middle button is ignored.
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (holdTimer.current !== null) return;
      setHolding(entry.aria);
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        setHolding(null);
        holdFired.current = true;
        hold.onHold();
      }, hold.ms);
    },
    [],
  );

  return (
    <nav
      ref={menuRef}
      className={`title-menu${useHelpLine ? " settings-menu" : ""}${scrollable ? " scrollable" : ""}`}
      aria-label={ariaLabel}
    >
      {entries.map((entry, i) => {
        const selected = i === cursor;
        const baseColor = entry.color ?? "#ffd75e";
        const color = selected
          ? baseColor
          : entry.locked
            ? "#5a6068"
            : "#9aa3ad";
        return (
          <button
            key={entry.aria}
            type="button"
            ref={
              selected
                ? (el) => {
                    selectedRowRef.current = el;
                  }
                : undefined
            }
            className={`menu-item${selected ? " selected" : ""}${entry.locked ? " locked" : ""}${entry.shiny ? " shiny" : ""}${entry.hold ? " holdable" : ""}${holding === entry.aria ? " holding" : ""}`}
            aria-label={entry.aria}
            // The charge animation runs for exactly the row's own hold time.
            style={
              entry.hold
                ? ({ "--hold-ms": `${entry.hold.ms}ms` } as CSSProperties)
                : undefined
            }
            onPointerEnter={() => {
              if (i !== cursor) {
                playUiSound(synth, "move");
                setCursor(i);
              }
            }}
            onPointerDown={(event) => startHold(entry, event)}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            // A long touch-press on a holdable row must not raise the platform
            // context menu / text selection halfway through the gesture.
            onContextMenu={
              entry.hold ? (event) => event.preventDefault() : undefined
            }
            onClick={() => {
              // The press that just completed a secret long-press ends in a
              // click too — swallow it, so the hold's payoff isn't followed by
              // the row opening. A short tap is unaffected.
              if (holdFired.current) {
                holdFired.current = false;
                return;
              }
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
              style={{ visibility: selected ? "visible" : "hidden" }}
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
                  <PixelText
                    font={font}
                    text={entry.label}
                    scale={3}
                    color={color}
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
                    color={selected ? "#9aa3ad" : "#6b7178"}
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
                    color={selected ? "#9aa3ad" : "#6b7178"}
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
                    color={selected ? baseColor : "#9aa3ad"}
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
                        : selected
                          ? "#ffd75e"
                          : "#9aa3ad"
                    }
                  />
                )}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

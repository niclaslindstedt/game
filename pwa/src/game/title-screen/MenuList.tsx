// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style menu column: one button per MenuEntry, the wisp sprite as
// the selection cursor (mouse) or the row's own hovering icon (touch), and the
// per-row controls (slider / switch / tick-box / bound key / cycled value)
// pinned to a shared right edge. Purely presentational — the rows and the
// cursor live in TitleScreen; keyboard steering stays there too.

import type { CSSProperties, RefObject } from "react";

import { PixelCheckbox } from "@ui/lib/PixelCheckbox.tsx";
import { PixelSlider } from "@ui/lib/PixelSlider.tsx";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { PixelToggle } from "@ui/lib/PixelToggle.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "../assets.ts";
import { synth } from "../audio.ts";
import { playMenuHaptic } from "../haptics.ts";
import { bindingLabel } from "../keybindings.ts";
import { playUiSound } from "../sfx/index.ts";
import type { MenuEntry } from "./menu-model.ts";

/** A stable 32-bit hash of a row's id — the seed both per-row animations draw
 * their rate and phase from. Not `Math.random`, which would re-roll on every
 * re-render (prices arriving, the cursor moving) and make a coin jump mid-turn
 * or an icon snap mid-bob. */
function rowHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0 || 1;
  }
  return h;
}

/** Give each shiny row's coin its OWN turn rate and starting phase, so a
 * column of coin packs never spins in lockstep (which reads as one animated
 * strip rather than a shelf of separate coins). */
function coinSpinStyle(id: string): CSSProperties {
  const h = rowHash(id);
  // 2.0s..3.5s per turn, started up to a full turn ago.
  const spin = 2 + (h % 16) * 0.1;
  return {
    "--spin": `${spin.toFixed(2)}s`,
    "--spin-delay": `${(-(((h >>> 8) % 32) / 32) * spin).toFixed(2)}s`,
  } as CSSProperties;
}

/** Same trick for the touch-side row icons: each hovers at its own rate and
 * phase, so a column of them breathes like a row of separate sprites instead
 * of one strip pumping in lockstep. */
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
}) {
  return (
    <nav
      ref={menuRef}
      className={`title-menu${useHelpLine ? " settings-menu" : ""}${scrollable ? " scrollable" : ""}`}
      aria-label="main menu"
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
            className={`menu-item${selected ? " selected" : ""}${entry.locked ? " locked" : ""}${entry.shiny ? " shiny" : ""}${entry.glow ? " glow" : ""}`}
            aria-label={entry.aria}
            onPointerEnter={() => {
              if (i !== cursor) {
                playUiSound(synth, "move");
                setCursor(i);
              }
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
              style={{ visibility: selected ? "visible" : "hidden" }}
            />
            {entry.icon ? (
              <img
                src={spriteDataUrl(sprites, entry.icon) ?? ""}
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
                {/* A shiny row leads with a minted 3D coin, fattened by its
                    tier (bigger packs, fatter coin), each turning at its own
                    rate and phase. Pure CSS — no sprite. */}
                {entry.shiny && entry.coinTier ? (
                  <span
                    className={`menu-coin menu-coin-t${entry.coinTier}`}
                    aria-hidden="true"
                    style={coinSpinStyle(entry.aria)}
                  >
                    <span className="menu-coin-rim" />
                    <span className="menu-coin-face" />
                  </span>
                ) : null}
                <PixelText
                  font={font}
                  text={entry.label}
                  scale={3}
                  color={color}
                />
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

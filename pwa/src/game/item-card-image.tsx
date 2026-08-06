// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CARD AS A PICTURE — what a long press on an item card puts on the
// clipboard, so a find can be pasted straight into a chat window.
//
// THE CARD IS RENDERED FRESH, OFF SCREEN, rather than photographed where it
// stands, and that is the whole design:
//
//   • The one on screen is not always reachable. The inventory's card is a
//     tooltip, and a tooltip is `pointer-events: none` — it exists to be read,
//     not touched, and the finger that "long-presses the card" is physically on
//     the BAG CELL underneath it. Every surface would otherwise need its own
//     handle on its own card element.
//   • The one on screen carries furniture the picture should not. The tooltip
//     wears a USE button, the shop's wears a BUY row, the arsenal's is docked
//     into a column. A fresh render is the card and nothing else.
//   • It cannot drift. The picture is drawn from the SAME `ItemCard` component
//     every surface renders, with the same props, so a change to how a stat is
//     worded lands in the pasted image the same day it lands in the game.
//
// The rasterizer that turns that DOM into pixels is `@ui/lib/dom-raster.ts` —
// see the note there for why this cannot be html2canvas or a foreignObject.

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import { equipmentName, type Equipment, type GameState } from "@game/core";

import { canvasToPng, rasterizeElement } from "@ui/lib/dom-raster.ts";
import { flashPixelNote } from "@ui/lib/pixel-flash.ts";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import type { RelicTier, Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { playMenuHaptic } from "./haptics.ts";
import { ItemCard } from "./ItemCard.tsx";
import { playUiSound } from "./sfx/ui.ts";

/**
 * Output pixels per ART pixel — the nearest-neighbour blow-up the copied image
 * gets. The card's text is drawn at one bitmap pixel per art pixel, which lands
 * in a chat window as a postage stamp; ×3 puts the card at ~770px, big enough
 * to read in a Discord message without being something to click through.
 */
const CARD_IMAGE_MAGNIFICATION = 3;

/** Transparent margin, in OUTPUT pixels, so a legendary's outer halo isn't
 * sheared off at the edge. */
const CARD_IMAGE_PAD_PX = 36;

/**
 * How many CSS px the browser is currently showing per art pixel. On a large
 * screen the root font-size is bumped and the whole rem-sized UI grows with it,
 * the card's text canvases included — so this is 1 on the reference phone and
 * ~1.75 on a desktop.
 *
 * DIVIDING IT BACK OUT is what makes the copied picture the SAME picture
 * everywhere: the image comes out one size rather than tracking whatever screen
 * happened to take it, and every art pixel lands on an exact 3×3 block instead
 * of the ragged 5.25 a desktop would otherwise blit. Measured off the card's own
 * first text canvas — PixelText sizes those in rem over a fixed-pixel bitmap, so
 * the ratio between the two IS the bump.
 */
function cssPxPerArtPx(card: HTMLElement): number {
  const canvas = card.querySelector("canvas");
  if (!canvas || canvas.width <= 0) return 1;
  const shown = canvas.getBoundingClientRect().width;
  return shown > 0 ? shown / canvas.width : 1;
}

/** Everything the card needs to draw itself, which is exactly ItemCard's props. */
export type ItemCardImageProps = {
  font: PixelFont;
  relicFonts?: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  state: GameState;
  item: Equipment;
  /** The piece worn in the same slot, for the green/red deltas. */
  compareTo?: Equipment | null;
  /** The small grey kicker above the name ("EQUIPPED"). */
  subtitle?: string;
};

/** A file name a chat client and a file manager both read: the item's own name,
 * lowercased and hyphenated. */
export function itemCardImageName(item: Equipment): string {
  const slug = equipmentName(item)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "item"}-card.png`;
}

/**
 * Mount the card in a laid-out but off-screen host, hand it to `capture`, then
 * take it down again. Off-screen rather than hidden: `display: none` has no layout,
 * and every position the rasterizer reads is the browser's own.
 *
 * `width: max-content` reproduces the tooltip's shrink-to-fit — the card's own
 * `max-width: 16rem` still caps it, and its lines already wrap inside that.
 */
async function withOffscreenCard<T>(
  props: ItemCardImageProps,
  capture: (card: HTMLElement) => Promise<T>,
): Promise<T> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    // flushSync so the card is laid out and its PixelText canvases painted (a
    // layout effect) by the time this returns — a concurrent render would leave
    // us rasterizing an empty box.
    flushSync(() => {
      root.render(
        <ItemCard
          font={props.font}
          relicFonts={props.relicFonts}
          sprites={props.sprites}
          state={props.state}
          item={props.item}
          compareTo={props.compareTo ?? null}
          subtitle={props.subtitle}
          style={{ width: "max-content" }}
        />,
      );
    });
    const card = host.firstElementChild;
    if (!(card instanceof HTMLElement)) {
      throw new Error("item card did not render");
    }
    // The icons are data URLs and so are never fetched, but they are still
    // DECODED asynchronously — drawing before that lands an empty frame.
    await Promise.all(
      [...card.querySelectorAll("img")].map((img) =>
        img.decode ? img.decode().catch(() => undefined) : Promise.resolve(),
      ),
    );
    return await capture(card);
  } finally {
    root.unmount();
    host.remove();
  }
}

/** The card as a PNG blob, at {@link CARD_IMAGE_MAGNIFICATION}. */
export function itemCardPng(props: ItemCardImageProps): Promise<Blob> {
  return withOffscreenCard(props, (card) => {
    const scale = CARD_IMAGE_MAGNIFICATION / cssPxPerArtPx(card);
    return canvasToPng(
      rasterizeElement(card, { scale, padPx: CARD_IMAGE_PAD_PX / scale }),
    );
  });
}

/** Where the picture ended up — what the flash note tells the player. */
export type CardCopyResult = "clipboard" | "download";

/**
 * Put the card's picture on the clipboard, falling back to saving it as a file
 * where an image clipboard isn't on offer (an older WebView, a page without the
 * permission).
 *
 * The `ClipboardItem` is built around the still-PENDING blob and handed to
 * `write` immediately, which is not a stylistic choice: Safari only honours a
 * write that is issued in the same turn as the gesture that caused it, so
 * awaiting the render first would lose the clipboard on exactly the platform
 * where the fallback is least useful. Browsers that reject a promise-valued
 * item get a second, awaited attempt.
 */
export async function copyItemCardImage(
  props: ItemCardImageProps,
): Promise<CardCopyResult> {
  const png = itemCardPng(props);
  const clipboard = navigator.clipboard;
  if (clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await clipboard.write([new ClipboardItem({ "image/png": png })]);
      return "clipboard";
    } catch {
      try {
        await clipboard.write([new ClipboardItem({ "image/png": await png })]);
        return "clipboard";
      } catch {
        // Fall through to the file.
      }
    }
  }
  const url = URL.createObjectURL(await png);
  const link = document.createElement("a");
  link.href = url;
  link.download = itemCardImageName(props.item);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "download";
}

/** What the flash note says. Three outcomes and three words: the picture is on
 * the clipboard, the picture became a file instead, or neither happened. */
const COPY_NOTE: Record<CardCopyResult, string> = {
  clipboard: "CARD COPIED",
  download: "CARD SAVED",
};
const COPY_FAILED_NOTE = "COPY FAILED";

/** Green for a copy that landed, the card's own downgrade red for one that
 * didn't — the two colours the item card already uses to mean yes and no. */
const COPY_OK_COLOR = "#7ef0c8";
const COPY_FAIL_COLOR = "#e06a6a";

/**
 * One press can be in flight at a time. A hold that fires while the previous
 * render is still going would mount a second off-screen root and race it onto
 * the clipboard; the second press is simply ignored.
 */
let copying = false;

/**
 * The whole gesture: copy the card, then say so where the finger is. Shared by
 * every surface that raises a card, so the sound, the haptic and the wording of
 * the confirmation can't drift between them.
 */
export function copyItemCardAt(
  props: ItemCardImageProps,
  at: { x: number; y: number },
): void {
  if (copying) return;
  copying = true;
  playUiSound(synth, "blip");
  playMenuHaptic();
  void copyItemCardImage(props)
    .then((result) => {
      flashPixelNote(props.font, COPY_NOTE[result], at, {
        color: COPY_OK_COLOR,
      });
      playUiSound(synth, "confirm");
    })
    .catch(() => {
      flashPixelNote(props.font, COPY_FAILED_NOTE, at, {
        color: COPY_FAIL_COLOR,
      });
      playUiSound(synth, "back");
    })
    .finally(() => {
      copying = false;
    });
}

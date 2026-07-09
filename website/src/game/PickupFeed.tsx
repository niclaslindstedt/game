// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pickup feed: WoW-style "PICKED UP X" lines that stack in the lower corner
// opposite the powerup dock as loot and powerups are scooped up. Newest sits at
// the bottom; each line lives for PICKUP_TTL_MS and fades out on its own timer
// (the removal is driven by GameScreen, which owns the list and schedules each
// expiry).
//
// Long item names ("JAGGED STAR WAND OF DEADLINESS") would otherwise sprawl
// across the whole bottom edge and collide with the powerup dock in the far
// corner, so each line word-wraps into a column that grows upward. Because
// PixelText paints a fixed-size canvas (CSS can't reflow it), the wrap is
// computed here in JS against the container's max-width — the "container" being
// the .pickup-feed box, whose cap differs for portrait vs landscape (styles.css)
// since the dock is half-size on a vertical phone.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** How long a pickup line stays on screen before it is dropped, in ms. */
export const PICKUP_TTL_MS = 10_000;

/** Integer pixel scale the feed renders its text at (matches PixelText usage). */
const FEED_SCALE = 2;

/** CSS px per rem at the default root font-size — the 1:1 reference. */
const REM_BASE_PX = 16;

/** The constant lead-in shown before every picked-up item name. */
const PICKUP_PREFIX = "PICKED UP";

export type PickupMessage = {
  id: number;
  text: string;
  /**
   * Quality color for the ITEM NAME only, set for special items (magic/rare/…
   * gear, plot pieces). Left undefined for ordinary loot, which stays neutral.
   */
  color?: string;
  /**
   * Lead-in words rendered in the neutral color before `text`. Undefined
   * means the classic "PICKED UP"; an empty string drops the lead-in
   * entirely (the level-up stat lines are the whole message themselves).
   */
  prefix?: string;
};

/** The "PICKED UP" prefix and ordinary items share this neutral off-white. */
const NEUTRAL_COLOR = "#f4f4f4";

/** One word plus whether it renders in the neutral prefix color. */
type FeedWord = { text: string; neutral: boolean };

/**
 * Resolve the container's max-width into a wrap budget expressed in the same
 * units as `font.measure(text) * FEED_SCALE` (unscaled font px × scale). The
 * canvas paints at that many device px and displays at `devicePx / 16` rem, so a
 * line fits when `measure * scale <= maxWidthPx * 16 / rootFontPx`. Reading the
 * resolved max-width (px) and the root font-size keeps the budget correct across
 * the portrait/landscape caps and the large-screen root-font doubling.
 */
function useWrapBudget(ref: RefObject<HTMLElement | null>): number {
  const [budget, setBudget] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const recompute = () => {
      const rootPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        REM_BASE_PX;
      const maxPx = parseFloat(getComputedStyle(el).maxWidth);
      setBudget(
        Number.isFinite(maxPx)
          ? (maxPx * REM_BASE_PX) / rootPx
          : Number.POSITIVE_INFINITY,
      );
    };
    recompute();
    // The cap is driven by viewport width/orientation (and, on large screens, a
    // root-font bump that rides the same media query), so re-measure whenever
    // the document box resizes.
    const observer = new ResizeObserver(recompute);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [ref]);
  return budget;
}

/** Split a message into its neutral prefix words plus its item-name words. */
function messageWords(m: PickupMessage): FeedWord[] {
  const itemNeutral = m.color == null;
  const prefix = m.prefix ?? PICKUP_PREFIX;
  return [
    ...prefix
      .split(" ")
      .filter(Boolean)
      .map((text) => ({ text, neutral: true })),
    ...m.text
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text, neutral: itemNeutral })),
  ];
}

/** Greedily pack words into lines no wider than `budget` (in measure×scale). */
function wrapWords(
  words: FeedWord[],
  font: PixelFont,
  budget: number,
): FeedWord[][] {
  if (!Number.isFinite(budget)) return [words];
  const lines: FeedWord[][] = [];
  let line: FeedWord[] = [];
  for (const word of words) {
    const candidate = [...line, word];
    const width =
      font.measure(candidate.map((w) => w.text).join(" ")) * FEED_SCALE;
    // Keep a lone over-long word on its own line rather than dropping it.
    if (line.length > 0 && width > budget) {
      lines.push(line);
      line = [word];
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/**
 * One wrapped visual row. The color changes at most once across the whole
 * message (neutral prefix → tinted item name), so any row splits into an
 * optional neutral run followed by an optional tinted run. A trailing space on
 * the neutral run supplies the gap when both are present.
 */
function FeedRow({
  words,
  font,
  color,
}: {
  words: FeedWord[];
  font: PixelFont;
  color: string;
}) {
  const neutral = words.filter((w) => w.neutral).map((w) => w.text);
  const tinted = words.filter((w) => !w.neutral).map((w) => w.text);
  const neutralText =
    neutral.length > 0
      ? neutral.join(" ") + (tinted.length > 0 ? " " : "")
      : "";
  return (
    <div className="pickup-line-row">
      {neutralText && (
        <PixelText
          font={font}
          text={neutralText}
          scale={FEED_SCALE}
          color={NEUTRAL_COLOR}
        />
      )}
      {tinted.length > 0 && (
        <PixelText
          font={font}
          text={tinted.join(" ")}
          scale={FEED_SCALE}
          color={color}
        />
      )}
    </div>
  );
}

export function PickupFeed({
  font,
  messages,
  side = "right",
}: {
  font: PixelFont;
  messages: PickupMessage[];
  /** Which bottom corner the feed hugs (opposite the powerup dock). */
  side?: "left" | "right";
}) {
  // The container stays mounted even when empty so the wrap budget keeps
  // tracking orientation/resize between bursts of pickups.
  const ref = useRef<HTMLDivElement>(null);
  const budget = useWrapBudget(ref);
  return (
    <div ref={ref} className={`pickup-feed pickup-${side}`} aria-live="polite">
      {messages.map((m) => {
        const color = m.color ?? NEUTRAL_COLOR;
        const lines = wrapWords(messageWords(m), font, budget);
        return (
          <div key={m.id} className="pickup-line">
            {lines.map((line, i) => (
              <FeedRow key={i} words={line} font={font} color={color} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

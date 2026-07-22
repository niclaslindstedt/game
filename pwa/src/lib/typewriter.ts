// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Letter-by-letter text reveal — the scrolling-dialogue effect of 16-bit RPGs.
// Characters appear one at a time with punctuation buying dramatic pauses, so
// a line lands with the timing it was written for. Generic React/UI game code:
// lives in pwa/src/lib/ (imported as @ui/lib/*) so it can be extracted
// into oss-framework once mature. The renderer is anything that can show a
// growing prefix of each line (PixelText here); this module owns only the
// timing.

import { useCallback, useEffect, useRef, useState } from "react";

/** Base gap between plain characters, ms — a brisk but readable crawl. */
const BASE_CHAR_MS = 30;

/**
 * How long to hold AFTER revealing `text[i]`, before the next character
 * appears. Punctuation is the dramatic beat: a full stop or the tail of an
 * ellipsis lands with real silence, a comma or dash with a shorter breath, so
 * a dying elite's "ONE SMALL... STEP..." reads with the pauses baked into the
 * writing — no markup, the content's own punctuation drives the drama.
 */
export function pauseAfter(text: string, i: number): number {
  const ch = text[i];
  const next = text[i + 1];
  switch (ch) {
    case "\n":
      return 180; // a breath between rows
    case ".":
      // Keep the dots of an ellipsis ticking, then hold hard on its tail; a
      // lone full stop gets an ordinary sentence beat.
      if (next === ".") return 45;
      return text[i - 1] === "." ? 440 : 260;
    case "!":
    case "?":
      return 320;
    case ":":
    case ";":
      return 190;
    case ",":
      return 170;
    case "-":
      // A free-standing dash (`HAND -`) is a spoken beat; a hyphen inside a
      // compound word (`REVERSE-ENGINEERING`, `1969-002`) is not — only pause
      // when the dash ends a token.
      return next === undefined || next === " " || next === "\n" ? 220 : 30;
    default:
      return BASE_CHAR_MS; // letters, spaces, apostrophes: no drama
  }
}

/** Does the viewer ask us to cut motion? Then print the whole page at once. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type TypewriterReveal = {
  /** The revealed prefix of each input row, aligned by index. */
  rows: string[];
  /** True once every character of the page is on screen. */
  done: boolean;
  /** Reveal the whole page now (a tap while it types). Stable identity. */
  skip: () => void;
};

/**
 * Drive a letter-by-letter reveal of `page` (one string per line). Restarts
 * whenever the page text changes — pass a fresh page per dialogue turn and the
 * crawl begins again. `onType(visibleIndex, char)` fires once per printed
 * non-blank character, so the caller can voice the letter-print blip; spaces
 * and line breaks are silent.
 */
export function useTypewriter(
  page: readonly string[],
  onType?: (visibleIndex: number, char: string) => void,
): TypewriterReveal {
  const full = page.join("\n");
  // The viewer's motion preference, read once — a reduced-motion reader gets
  // the whole page immediately, no crawl, no blips.
  const [reduced] = useState(prefersReducedMotion);

  // Reveal count, reset whenever the page text changes. Resetting during
  // render (React's supported "adjust state on prop change" pattern) keeps the
  // displayed prefix in step with the new page without a stale frame.
  const [prevFull, setPrevFull] = useState(full);
  const [count, setCount] = useState(reduced ? full.length : 0);
  if (full !== prevFull) {
    setPrevFull(full);
    setCount(reduced ? full.length : 0);
  }

  // Keep the latest onType reachable from the timer without re-arming it when
  // the caller passes a fresh closure each render.
  const onTypeRef = useRef(onType);
  useEffect(() => {
    onTypeRef.current = onType;
  });

  // skip() reaches the running reveal through a ref so its identity stays
  // stable for callers wiring it to a keyboard/gamepad handler.
  const skipRef = useRef<() => void>(() => {});
  const skip = useCallback(() => skipRef.current(), []);

  useEffect(() => {
    if (reduced || full.length === 0) return;
    let i = 0;
    let visible = 0;
    let timer = 0;
    let cancelled = false;

    const finish = () => {
      cancelled = true;
      window.clearTimeout(timer);
      setCount(full.length);
    };
    skipRef.current = finish;

    const tick = () => {
      if (cancelled) return;
      i += 1;
      setCount(i);
      const ch = full[i - 1];
      if (ch && ch !== " " && ch !== "\n") {
        onTypeRef.current?.(visible, ch);
        visible += 1;
      }
      if (i < full.length) {
        timer = window.setTimeout(tick, pauseAfter(full, i - 1));
      }
    };
    timer = window.setTimeout(tick, BASE_CHAR_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [full, reduced]);

  // Slice the revealed prefix back into per-row strings. The join/split on
  // "\n" round-trips the original rows: a prefix that stops mid-page yields
  // the completed rows plus the partially-typed one, and "" for the rest.
  const shown = full.slice(0, count);
  const parts = shown.split("\n");
  const rows = page.map((_, index) => parts[index] ?? "");
  return { rows, done: count >= full.length, skip };
}

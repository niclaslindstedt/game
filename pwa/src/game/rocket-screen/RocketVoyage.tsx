// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CROSSING, FROM INSIDE — the two cabin beats between orbit and the drop:
// Earth going small in the porthole while he says why he is coming back, then
// the moon filling it while he faces what comes next.
//
// A NEW KIND OF SCENE, ON PURPOSE. The stage cutscenes place actors on a
// floor; this one is a WINDOW with a depth illusion behind it (`voyage-art.ts`
// owns the picture), so it is its own component rather than a `CutsceneState`
// — there is no floor to stand anybody on. What it keeps from the scene
// vocabulary is the contract: it PARKS the sky (the screen's loop breaks on
// it), a tap turns the page, Escape cuts to the drop, and every line is
// authored content (`content/thoughts.yaml`, the flight's own ids) so the
// manuscript governs it like everything else the game says.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { withHeroNameLines } from "@game/core";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { usePixelWrapRem } from "@ui/lib/pixel-wrap.ts";

import type { GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import { viewScaleFor } from "../render/view.ts";

import { flightThoughtPages } from "./voice.ts";
import { drawVoyage, type VoyageKind } from "./voyage-art.ts";

/** The two beats, in trip order, each with its thought id. */
const BEATS: readonly { kind: VoyageKind; thought: string }[] = [
  { kind: "earthAway", thought: "flight_earth_away" },
  { kind: "moonClose", thought: "flight_moon_close" },
];

/** Ms a page holds before turning itself — long enough to read twice and
 * watch the window; a tap is always faster. */
const AUTO_PAGE_MS = 4800;

export function RocketVoyage({
  assets,
  heroName,
  onDone,
}: {
  assets: GameAssets;
  heroName?: string;
  /** The cabin is behind us: hand the drop over. Called exactly once. */
  onDone: () => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [beat, setBeat] = useState(0);
  const [page, setPage] = useState(0);
  // Each beat's clock starts at its own first frame — the window's travel and
  // the drifters all run off it. Null until the first frame stamps it, so the
  // render stays pure.
  const beatStartRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const pages = useMemo(() => {
    const id = BEATS[Math.min(beat, BEATS.length - 1)]!.thought;
    return flightThoughtPages(id).map((p) => [
      ...withHeroNameLines(p, heroName),
    ]);
  }, [beat, heroName]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  /** One step forward: the next page, the next beat, or out. */
  const advance = useCallback(() => {
    if (doneRef.current) return;
    playUiSound(synth, "move");
    if (page + 1 < pages.length) {
      setPage(page + 1);
      return;
    }
    if (beat + 1 < BEATS.length) {
      beatStartRef.current = null; // the next frame stamps the new beat's clock
      setBeat(beat + 1);
      setPage(0);
      return;
    }
    finish();
  }, [beat, finish, page, pages.length]);

  // The page turns itself if nobody does — an unattended thumb still gets the
  // whole crossing, at reading pace.
  useEffect(() => {
    const id = window.setTimeout(advance, AUTO_PAGE_MS);
    return () => window.clearTimeout(id);
  }, [advance, beat, page]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        advance();
        return;
      }
      if (event.key !== "Escape") return;
      playUiSound(synth, "back");
      finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, finish]);

  // The picture — its own little loop on its own canvas, over the parked sky.
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const scale = viewScaleFor(cssW, cssH);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const unit = scale * dpr;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(unit, 0, 0, unit, 0, 0);
      const kind = BEATS[Math.min(beat, BEATS.length - 1)]!.kind;
      beatStartRef.current ??= performance.now();
      drawVoyage(
        ctx,
        kind,
        performance.now() - beatStartRef.current,
        w / unit,
        h / unit,
        assets,
      );
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [assets, beat]);

  const lines = pages[Math.min(page, pages.length - 1)] ?? [];
  // MEASURED, NOT AUTHORED. A fixed rem cap is a share of the root font size
  // and no share at all of the screen, so 26rem is 416 px on a phone that is
  // 390 px wide — a caption centred on nothing, spilling off both edges. 26 is
  // the ceiling for a screen with room for it.
  const wrapRem = usePixelWrapRem(0.84, 26);
  return (
    <div style={SHELL} onPointerDown={advance} role="presentation">
      <canvas ref={canvasRef} style={CANVAS} />
      {/* His own head, over the console — the flight's thought voice, paged. */}
      <div
        key={`${beat}:${page}`}
        style={THOUGHT}
        className="rocket-voyage-thought"
        aria-live="polite"
      >
        {lines.map((line, i) => (
          <PixelText
            key={i}
            font={assets.font}
            text={line}
            scale={2}
            color="#9fe8d2"
            maxWidth={wrapRem}
            align="center"
          />
        ))}
      </div>
      <div style={HINT} aria-hidden="true">
        <PixelText font={assets.font} text="▶ TAP" scale={1} color="#4c5568" />
      </div>
    </div>
  );
}

const SHELL: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#070911",
  overflow: "hidden",
  touchAction: "none",
};
const CANVAS: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  imageRendering: "pixelated",
};
const THOUGHT: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "16%",
  transform: "translateX(-50%)",
  // The same share the wrap is measured against, so a line the font could not
  // break (one very long word) is clipped by the box rather than by the screen.
  width: "84vw",
  maxWidth: "26rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  textAlign: "center",
  pointerEvents: "none",
};
const HINT: CSSProperties = {
  position: "absolute",
  right: "12px",
  bottom: "10px",
  opacity: 0.8,
  pointerEvents: "none",
};

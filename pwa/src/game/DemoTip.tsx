// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A teaching tooltip for the HOW TO PLAY demo (see GameScreen `demo`). It pops
// once per session anchored to where the autopilot just "tapped" — the steer
// pad, a jump on the field, a powerup / item slot — naming the control so a
// newcomer learns by watching. Purely presentational: GameScreen owns which
// tip shows, its anchor, and its lifetime; this just paints the callout with a
// caret pointing at the anchor point.

import { useLayoutEffect, useRef, type CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** A live demo tip: its message and the screen point (relative to the game
 * shell) its caret points at, with the caret above or below the box. */
export type DemoTipState = {
  /** Bumps each time a new tip is raised, so React remounts (re-animates) it. */
  id: number;
  /** Which taught action raised it (see DEMO_TIPS keys). Lets the render bind a
   * tip's visibility to the phase it belongs to — the "levelstat" tip only
   * shows while the level-up modal is up, so it never lingers over the field
   * after the modal closes. */
  key: string;
  text: string;
  /** Anchor point in game-shell CSS px. */
  x: number;
  y: number;
  /** Whether the box sits above the anchor (caret down) or below it (caret up).
   * Anchors near the top of the screen flip below so the box stays on-screen. */
  place: "above" | "below";
};

/** How much clear space to keep between the callout box and the shell edges. */
const EDGE_MARGIN_PX = 6;

export function DemoTip({ font, tip }: { font: PixelFont; tip: DemoTipState }) {
  const markerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The box is centered on the anchor; near a shell edge that would clip it
  // off-screen (the box is a fixed-px nowrap line, but its rem-based padding
  // doubles on large screens, so a static estimate can't keep it in bounds).
  // Measure the rendered box and slide ONLY the box back on-screen — the marker
  // and caret stay put at the true anchor, so the caret keeps pointing at the
  // control even when the box is nudged sideways. Positioned imperatively (no
  // React state) so the measure-then-place happens in one pre-paint pass.
  useLayoutEffect(() => {
    const marker = markerRef.current;
    const box = boxRef.current;
    const shell = marker?.offsetParent as HTMLElement | null;
    if (!marker || !box || !shell) return;
    const shellRect = shell.getBoundingClientRect();
    const anchorX = marker.getBoundingClientRect().left; // 0-width marker == anchor
    const half = box.offsetWidth / 2; // layout width, unaffected by the transform
    let shift = 0;
    if (anchorX - half < shellRect.left + EDGE_MARGIN_PX) {
      shift = shellRect.left + EDGE_MARGIN_PX - (anchorX - half);
    } else if (anchorX + half > shellRect.right - EDGE_MARGIN_PX) {
      shift = shellRect.right - EDGE_MARGIN_PX - (anchorX + half);
    }
    box.style.transform = `translate(calc(-50% + ${shift}px), 0)`;
  }, [tip.id, tip.text, tip.x, tip.y]);

  return (
    <div
      ref={markerRef}
      key={tip.id}
      className={`demo-tip demo-tip--${tip.place}`}
      style={{ left: `${tip.x}px`, top: `${tip.y}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div ref={boxRef} className="demo-tip-box">
        <PixelText font={font} text={tip.text} scale={2} color="#0b0d10" />
      </div>
      <span className="demo-tip-caret" />
    </div>
  );
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A teaching tooltip for the HOW TO PLAY demo (see GameScreen `demo`). It pops
// once per session anchored to where the autopilot just "tapped" — the steer
// pad, a jump on the field, a powerup / item slot — naming the control so a
// newcomer learns by watching. Purely presentational: GameScreen owns which
// tip shows, its anchor, and its lifetime; this just paints the callout with a
// caret pointing at the anchor point.

import type { CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** A live demo tip: its message and the screen point (relative to the game
 * shell) its caret points at, with the caret above or below the box. */
export type DemoTipState = {
  /** Bumps each time a new tip is raised, so React remounts (re-animates) it. */
  id: number;
  text: string;
  /** Anchor point in game-shell CSS px. */
  x: number;
  y: number;
  /** Whether the box sits above the anchor (caret down) or below it (caret up).
   * Anchors near the top of the screen flip below so the box stays on-screen. */
  place: "above" | "below";
};

export function DemoTip({ font, tip }: { font: PixelFont; tip: DemoTipState }) {
  return (
    <div
      key={tip.id}
      className={`demo-tip demo-tip--${tip.place}`}
      style={{ left: `${tip.x}px`, top: `${tip.y}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="demo-tip-box">
        <PixelText font={font} text={tip.text} scale={2} color="#0b0d10" />
      </div>
      <span className="demo-tip-caret" />
    </div>
  );
}

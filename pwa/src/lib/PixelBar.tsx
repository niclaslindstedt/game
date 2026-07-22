// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A thin amber progress bar — the rounded track + gold gradient fill first used
// as the level-up reveal-freeze "arming" timer. Two fill modes share one look:
//   - static: `fill` (0..1) sets the bar to a fixed fraction (a completion
//     meter, e.g. the achievements page's unlocked-percentage bar); and
//   - timed: `fillMs` fills the bar from empty to full over that many ms via a
//     CSS keyframe (the level-up lockout countdown).
// Purely presentational; the caller owns any click/label. Generic React/UI game
// code, so it lives in pwa/src/lib/ (imported as @ui/lib/PixelBar.tsx) for
// eventual extraction into oss-framework.

type Props = {
  /** Static fill fraction, 0..1 (clamped). Ignored when `fillMs` is set. */
  fill?: number;
  /** When set, the bar animates from empty to full over this many ms instead of
   * sitting at a static `fill` — the level-up arming countdown. */
  fillMs?: number;
  /** Extra classes for the track (state modifiers, layout tweaks). */
  className?: string;
  /** Hide from the a11y tree when the bar is decorative (the caller carries the
   * real progressbar role/label). */
  ariaHidden?: boolean;
};

export function PixelBar({ fill = 0, fillMs, className, ariaHidden }: Props) {
  const timed = fillMs != null;
  const style = timed
    ? { animationDuration: `${fillMs}ms` }
    : { transform: `scaleX(${Math.max(0, Math.min(1, fill))})` };
  return (
    <span
      className={`pixel-bar${className ? ` ${className}` : ""}`}
      aria-hidden={ariaHidden}
    >
      <span
        className={`pixel-bar-fill${timed ? " timed" : ""}`}
        style={style}
      />
    </span>
  );
}

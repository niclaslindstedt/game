// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The achievement unlock CELEBRATION, in two sizes — because a badge is not
// one moment, it is a ladder of them (achievement-tiers.ts holds the ladder).
//
// THE BANNER (every tier but the top): a framed slip that rises from the
// bottom edge — the star, "ACHIEVEMENT UNLOCKED", the badge's name and what it
// paid — with a sheen sweep and flecks riding the frame. Anchored
// bottom-center, under the pickup card's zone and clear of the HUD, and sized
// a deliberate notch below the level-up burn and the unique pickup card: an
// ordinary badge is a great moment, not the run's biggest one. The FRAME, the
// fleck count and the dwell all climb with the tier, so a hundred-point badge
// visibly outranks a ten-point one without needing to be read.
//
// THE REVEAL (the LEGEND tier alone): the badge takes the entire screen. Rays
// flare out of the dark, a card flies in out of depth and lands with a bloom
// and a shockwave, and the name burns in over it — the game's "you opened a
// legendary" moment, kept for the handful of feats that deserve to stop the
// player where they stand (the level cap, the campaign at its cruelest, every
// relic, every ally). It rhymes with the pickup card's legendary flourish on
// purpose and shares no CSS with it, for the reason the look module gives.
//
// One celebration at a time; GameScreen queues batched unlocks and keys the
// mount by `id` so each badge replays from the start, then clears it after the
// tier's own dwell (kept in sync with the CSS animations in styles.css).
//
// TAPPING the badge opens the ACHIEVEMENTS shelf over the (now paused) run —
// but not by taking the press itself: both presentations are inert in every
// state, and the canvas routes a tap landing over `toastRef` (see controls.ts)
// exactly as it does for the pickup card that shares this strip. In the reveal
// that ref goes on the CARD rather than the backdrop: the backdrop is the
// whole screen, and a full-screen tap target would turn every steering press
// for six seconds into a shelf.

import type { CSSProperties, Ref } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import {
  ACHIEVEMENT_POINTS,
  TIER_LOOK,
  tierStyle,
  type AchievementTier,
} from "./achievement-tiers.ts";
import { spriteDataUrl, type Sprites } from "./assets.ts";

/** How long a celebration of `tier` stays up before the next queued badge (or
 * nothing) takes over, in ms. Must match the tier's animation in styles.css. */
export function achievementToastTtlMs(tier: AchievementTier): number {
  return TIER_LOOK[tier].ttlMs;
}

/** Wrap width (rem) for the badge name — the pickup card's cap
 * (PICKUP_NAME_REM), which playtesting proved out: a long name (ARMED AND
 * DANGEROUS, GREAVES OF THE WALLED GARDEN) folds onto more lines and the
 * banner grows TALLER instead of spilling past its frame. Keep in step with
 * `.achievement-toast`'s max-width in styles.css. */
const NAME_REM = 9;

/** The same cap for the reveal, which is centered and has the whole width to
 * play with — so a name folds onto a second line rather than shrinking. */
const REVEAL_NAME_REM = 13;

/** The muted gold every celebration's kicker line is written in. */
const KICKER = "#c8b078";

export type AchievementToastData = {
  /** Bumped per unlock; keys the mount so every badge replays the pop. */
  id: number;
  /** The badge's display name. */
  name: string;
  /** The badge icon's sprite-atlas name (resolved here at render). */
  icon: string;
  /** The effort tier — what the whole celebration is sized and lit by. */
  tier: AchievementTier;
};

/** Flecks around the banner frame — fixed offsets (per the pickup card's
 * sparkles: no per-render randomness), staggered by `d` (ms). The tier decides
 * how many of them are used, front of the list first, so a richer badge
 * twinkles denser rather than differently. */
const SPARKLES = [
  { x: -2, y: 20, d: 0 },
  { x: 102, y: 30, d: 250 },
  { x: 8, y: 104, d: 500 },
  { x: 92, y: -6, d: 150 },
  { x: -4, y: 74, d: 650 },
  { x: 104, y: 88, d: 400 },
  { x: 26, y: -8, d: 820 },
  { x: 70, y: 106, d: 300 },
  { x: -6, y: 48, d: 980 },
  { x: 106, y: 58, d: 560 },
  { x: 46, y: -10, d: 120 },
  { x: 14, y: 110, d: 700 },
  { x: 98, y: 12, d: 880 },
  { x: 4, y: -4, d: 440 },
] as const;

export function AchievementToast({
  font,
  sprites,
  toast,
  toastRef,
}: {
  font: PixelFont;
  sprites: Sprites;
  toast: AchievementToastData;
  /** The badge element, handed to the run's control layer so a TAP over it
   * opens the trophy shelf. The celebration stays pointer-events:none (see
   * styles.css — it parks in the thumb's dpad zone and must never swallow a
   * steering press), so the canvas hit-tests this rect instead. */
  toastRef?: Ref<HTMLDivElement>;
}) {
  const look = TIER_LOOK[toast.tier];
  const icon = spriteDataUrl(sprites, toast.icon);
  const points = `${ACHIEVEMENT_POINTS[toast.tier]} PTS`;
  const style = tierStyle(toast.tier) as CSSProperties;

  if (look.reveal) {
    return (
      <div
        className="achievement-reveal"
        role="status"
        aria-live="polite"
        style={style}
      >
        {/* The light show, all of it behind the card and none of it in the
            flow: rays out of the dark, a bloom off the card's heart, a
            shockwave past its edges, and a single white blink on landing. */}
        <span className="achievement-reveal-rays" aria-hidden="true" />
        <span className="achievement-reveal-bloom" aria-hidden="true" />
        <span className="achievement-reveal-blast" aria-hidden="true" />
        <span className="achievement-reveal-flash" aria-hidden="true" />
        <div ref={toastRef} className="achievement-reveal-card">
          <span className="achievement-reveal-sheen" aria-hidden="true" />
          <Sparkles count={look.sparkles} className="achievement-reveal" />
          <PixelText
            font={font}
            text={look.label}
            scale={2}
            color={look.color}
          />
          {icon && (
            <img
              src={icon}
              alt=""
              className="pixel-img achievement-reveal-icon"
            />
          )}
          <PixelText
            font={font}
            text="ACHIEVEMENT UNLOCKED"
            scale={2}
            color={KICKER}
          />
          <PixelText
            font={font}
            text={toast.name}
            scale={4}
            color={look.color}
            maxWidth={REVEAL_NAME_REM}
          />
          <PixelText font={font} text={points} scale={2} color={KICKER} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={toastRef}
      className={`achievement-toast badge-tier-${toast.tier}`}
      role="status"
      aria-live="polite"
      style={style}
    >
      <span className="achievement-toast-sheen" aria-hidden="true" />
      <Sparkles count={look.sparkles} className="achievement-toast" />
      {icon && (
        <img src={icon} alt="" className="pixel-img achievement-toast-icon" />
      )}
      <div className="achievement-toast-body">
        <PixelText
          font={font}
          text={`ACHIEVEMENT UNLOCKED · ${points}`}
          scale={1}
          color={KICKER}
        />
        <PixelText
          font={font}
          text={toast.name}
          scale={2}
          color={look.color}
          maxWidth={NAME_REM}
        />
      </div>
    </div>
  );
}

/** The fleck layer, shared by both presentations — `className` picks which
 * one's CSS drives it, so the two keep their own sizes and timings while the
 * offsets and the tier's count stay stated in one place. */
function Sparkles({ count, className }: { count: number; className: string }) {
  if (count <= 0) return null;
  return (
    <span className={`${className}-sparkles`} aria-hidden="true">
      {SPARKLES.slice(0, count).map((s, i) => (
        <span
          key={i}
          className={`${className}-sparkle`}
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              "--spark-delay": `${s.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

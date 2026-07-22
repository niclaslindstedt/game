// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The achievement unlock TOAST: a gold-framed banner that rises from the
// bottom edge when a badge is earned — the star, "ACHIEVEMENT UNLOCKED", and
// the badge's name — with a sheen sweep and gold sparkles riding the frame.
// Anchored bottom-center, under the pickup card's zone and clear of the HUD. Sized
// a deliberate notch below the level-up burn and the unique pickup card: a
// badge is a great moment, not the run's biggest one. One toast at a time;
// GameScreen queues batched unlocks and keys the mount by `id` so each badge
// replays the pop, then clears it after ACHIEVEMENT_TOAST_TTL_MS (kept in
// sync with the CSS animation length in styles.css).

import type { CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";

/** How long a toast stays up before the next queued badge (or nothing) takes
 * over, in ms. Must match the `achievement-toast` animation in styles.css. */
export const ACHIEVEMENT_TOAST_TTL_MS = 4000;

/** Wrap width (rem) for the badge name — the pickup card's cap
 * (PICKUP_NAME_REM), which playtesting proved out: a long name (ARMED AND
 * DANGEROUS, GREAVES OF THE WALLED GARDEN) folds onto more lines and the
 * banner grows TALLER instead of spilling past its frame. Keep in step with
 * `.achievement-toast`'s max-width in styles.css. */
const NAME_REM = 9;

/** Achievement gold — the frame, the title, the sparkles. */
const GOLD = "#ffd75e";

export type AchievementToastData = {
  /** Bumped per unlock; keys the mount so every badge replays the pop. */
  id: number;
  /** The badge's display name. */
  name: string;
  /** The badge icon's sprite-atlas name (resolved here at render). */
  icon: string;
};

/** Gold flecks around the banner frame — fixed offsets (per the pickup card's
 * sparkles: no per-render randomness), staggered by `d` (ms). */
const SPARKLES = [
  { x: -2, y: 20, d: 0 },
  { x: 102, y: 30, d: 250 },
  { x: 8, y: 104, d: 500 },
  { x: 92, y: -6, d: 150 },
  { x: -4, y: 74, d: 650 },
  { x: 104, y: 88, d: 400 },
] as const;

export function AchievementToast({
  font,
  sprites,
  toast,
}: {
  font: PixelFont;
  sprites: Sprites;
  toast: AchievementToastData;
}) {
  const icon = spriteDataUrl(sprites, toast.icon);
  return (
    <div className="achievement-toast" role="status" aria-live="polite">
      <span className="achievement-toast-sheen" aria-hidden="true" />
      <span className="achievement-toast-sparkles" aria-hidden="true">
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className="achievement-toast-sparkle"
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
      {icon && (
        <img src={icon} alt="" className="pixel-img achievement-toast-icon" />
      )}
      <div className="achievement-toast-body">
        <PixelText
          font={font}
          text="ACHIEVEMENT UNLOCKED"
          scale={1}
          color="#c8b078"
        />
        <PixelText
          font={font}
          text={toast.name}
          scale={2}
          color={GOLD}
          maxWidth={NAME_REM}
        />
      </div>
    </div>
  );
}

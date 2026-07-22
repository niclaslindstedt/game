// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The achievement DETAIL card: the badge blown up big — its icon, category,
// name, condition and point value — and, for an earned badge, the trophy line:
// WHEN it dropped and WHICH hero was playing (captured at unlock time in the
// achievements store's `meta`). A locked badge shows its progress toward the
// goal instead.
//
// Two presentations share one body (`AchievementCardBody`), the way the arsenal
// reuses `ItemCardBody`:
//   - a docked SIDE PANEL beside the list on wide viewports (the arsenal shape),
//     driven by the selected row; and
//   - a centered POP-UP modal on narrow phones, opened by tapping a row
//     (`AchievementCard`), dismissed by the backdrop, the CLOSE button, or ESC.

import { useEffect } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { TIER_POINTS } from "@niclaslindstedt/oss-framework/achievements";

import { CATEGORY_LABELS, type AchievementDef } from "./achievement-defs.ts";
import type { AchievementUnlockMeta } from "./achievements.ts";
import type { LifetimeTotals } from "./achievement-totals.ts";
import { spriteDataUrl, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { playUiSound } from "./sfx/index.ts";

const GOLD = "#ffd75e";
const DIM = "#7a8088";
const BODY = "#9aa3ad";

/** Wrap width (rem) for the card's body lines. Widened to match the enlarged
 * card text (the body scales were doubled). */
const CARD_REM = 18;

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/** A pixel-font-safe date stamp: "13 JUL 2026" (glyphs the font ships). */
function formatUnlockDate(ts: number): string {
  const d = new Date(ts);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()] ?? "";
  return `${day} ${month} ${d.getFullYear()}`;
}

export type AchievementCardProps = {
  font: PixelFont;
  sprites: Sprites;
  def: AchievementDef;
  unlocked: boolean;
  /** Unlock timestamp (ms) — present only when `unlocked`. */
  unlockedAt: number | undefined;
  /** The hero-who-earned-it context, when we recorded it. */
  meta: AchievementUnlockMeta | undefined;
  totals: LifetimeTotals;
};

/** The card's inner content, layout-agnostic so the side panel and the pop-up
 * modal render it identically. */
export function AchievementCardBody({
  font,
  sprites,
  def,
  unlocked,
  unlockedAt,
  meta,
  totals,
}: AchievementCardProps) {
  const icon = spriteDataUrl(sprites, def.icon);
  const points = TIER_POINTS[def.tier];
  const progress = def.progress?.(totals);
  const character = meta?.character;

  return (
    <>
      <span className="achievement-card-cell">
        {icon && <img src={icon} alt="" className="pixel-img" />}
      </span>

      <PixelText
        font={font}
        text={CATEGORY_LABELS[def.category]}
        scale={2}
        color={DIM}
      />
      <PixelText
        font={font}
        text={def.name}
        scale={3}
        color={unlocked ? GOLD : DIM}
        maxWidth={CARD_REM}
      />
      <PixelText
        font={font}
        text={def.desc}
        scale={2}
        color={BODY}
        maxWidth={CARD_REM}
      />

      <div className="achievement-card-divider" />

      {unlocked ? (
        <div className="achievement-card-meta">
          <PixelText
            font={font}
            text={
              unlockedAt !== undefined
                ? `UNLOCKED ${formatUnlockDate(unlockedAt)}`
                : "UNLOCKED"
            }
            scale={2}
            color={BODY}
            maxWidth={CARD_REM}
          />
          <PixelText
            font={font}
            text={character ? `EARNED BY ${character}` : "EARNED BY A HERO"}
            scale={2}
            color={GOLD}
            maxWidth={CARD_REM}
          />
        </div>
      ) : (
        <div className="achievement-card-meta">
          <PixelText font={font} text="LOCKED" scale={2} color={DIM} />
          {progress && (
            <>
              <span
                className="achievement-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.goal}
                aria-valuenow={progress.have}
              >
                <span
                  className="achievement-progress-fill"
                  style={{
                    width: `${(100 * progress.have) / progress.goal}%`,
                  }}
                />
              </span>
              <PixelText
                font={font}
                text={`${progress.have}/${progress.goal}`}
                scale={2}
                color={DIM}
              />
            </>
          )}
        </div>
      )}

      <PixelText
        font={font}
        text={`${points} PTS`}
        scale={2}
        color={unlocked ? "#c8b078" : DIM}
      />
    </>
  );
}

/** The pop-up modal: a centered, gold-framed window over the shelf a tapped
 * badge opens on narrow phones. Backdrop / CLOSE / ESC dismiss it. */
export function AchievementCard({
  onClose,
  ...body
}: AchievementCardProps & { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Capture-phase, so ESC dismisses the card before the shelf's own ESC
        // handler (which would otherwise close the whole browser underneath).
        event.stopPropagation();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="achievement-card-overlay"
      onClick={() => {
        playUiSound(synth, "back");
        onClose();
      }}
    >
      <div
        className={`achievement-card ${body.unlocked ? "unlocked" : "locked"}`}
        role="dialog"
        aria-label={`achievement-card-${body.def.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <AchievementCardBody {...body} />

        <button
          type="button"
          className="pixel-button achievement-card-close"
          aria-label="achievement-card-close"
          onClick={() => {
            playUiSound(synth, "back");
            onClose();
          }}
        >
          <PixelText font={body.font} text="CLOSE" scale={2} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}

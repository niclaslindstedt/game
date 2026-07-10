// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ACHIEVEMENTS browser: a full-screen gallery of every badge, grouped by
// category, each row showing its icon, name, condition, and (for counter
// ladders) live progress — earned badges framed in gold, locked ones dimmed.
// Reached from the title menu's ACHIEVEMENTS row and from the in-run HUD star
// (which appears only while new badges wait). Opening it acknowledges the
// unseen queue, dimming the star. Follows the arsenal viewer's shape: a
// scrollable list, ESC/BACK out, pointer or arrow keys to walk rows.

import { useEffect, useMemo, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { TIER_POINTS } from "@niclaslindstedt/oss-framework/achievements";

import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENTS,
  CATEGORY_LABELS,
  type AchievementDef,
} from "./achievement-defs.ts";
import { acknowledgeAchievements, getAchievements } from "./achievements.ts";
import { spriteDataUrl, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { playUiSound } from "./sfx/index.ts";

/** Achievement gold (earned) and the muted slate for locked rows. */
const GOLD = "#ffd75e";
const DIM = "#7a8088";
const BODY = "#9aa3ad";

/** Wrap width (rem) for a row's condition line. */
const DESC_REM = 16;

type Row =
  | { kind: "header"; label: string; earned: number; total: number }
  | { kind: "badge"; def: AchievementDef; unlocked: boolean };

export function AchievementsScreen({
  font,
  sprites,
  onClose,
}: {
  font: PixelFont;
  sprites: Sprites;
  onClose: () => void;
}) {
  // Opening the shelf IS the acknowledgement — the HUD star dims. Snapshot
  // the save after that so the render reads the acknowledged state.
  const save = useMemo(() => {
    acknowledgeAchievements();
    return getAchievements();
  }, []);

  const { rows, badges, earned, points, maxPoints } = useMemo(() => {
    const rows: Row[] = [];
    const badges: AchievementDef[] = [];
    let earned = 0;
    let points = 0;
    let maxPoints = 0;
    for (const category of ACHIEVEMENT_CATEGORIES) {
      const defs = ACHIEVEMENTS.filter((a) => a.category === category);
      if (defs.length === 0) continue;
      const done = defs.filter((a) => save.unlocked[a.id] !== undefined);
      rows.push({
        kind: "header",
        label: CATEGORY_LABELS[category],
        earned: done.length,
        total: defs.length,
      });
      for (const def of defs) {
        const unlocked = save.unlocked[def.id] !== undefined;
        rows.push({ kind: "badge", def, unlocked });
        badges.push(def);
        maxPoints += TIER_POINTS[def.tier];
        if (unlocked) {
          earned++;
          points += TIER_POINTS[def.tier];
        }
      }
    }
    return { rows, badges, earned, points, maxPoints };
  }, [save]);

  // The keyboard cursor walks BADGE rows (headers are skipped); pointer
  // hovering moves it too, like the arsenal list.
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (badges.length === 0) return;
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c + delta + badges.length) % badges.length);
      } else if (
        event.key === "Escape" ||
        event.key === "y" ||
        event.key === "Y"
      ) {
        // ESC backs out; Y toggles the shelf shut (the WoW binding that
        // opened it mid-run).
        event.preventDefault();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [badges.length, onClose]);

  let badgeIndex = -1;
  return (
    <div className="achievements-overlay">
      <div className="achievements-panel">
        <PixelText font={font} text="ACHIEVEMENTS" scale={3} color={GOLD} />
        <PixelText
          font={font}
          text={`${earned}/${badges.length} UNLOCKED · ${points}/${maxPoints} PTS`}
          scale={1}
          color={BODY}
        />

        <div className="achievements-list">
          {rows.map((row) => {
            if (row.kind === "header") {
              return (
                <div key={`h-${row.label}`} className="achievements-header">
                  <PixelText
                    font={font}
                    text={row.label}
                    scale={2}
                    color="#c7a25a"
                  />
                  <PixelText
                    font={font}
                    text={`${row.earned}/${row.total}`}
                    scale={1}
                    color={DIM}
                  />
                </div>
              );
            }
            const { def, unlocked } = row;
            badgeIndex++;
            const i = badgeIndex;
            const selected = i === cursor;
            const icon = spriteDataUrl(sprites, def.icon);
            const progress = def.progress?.(save.totals);
            return (
              <div
                key={def.id}
                ref={
                  selected
                    ? (el) => el?.scrollIntoView({ block: "nearest" })
                    : undefined
                }
                className={`achievement-row ${unlocked ? "unlocked" : "locked"}${
                  selected ? " selected" : ""
                }`}
                aria-label={`achievement-${def.id}`}
                onPointerEnter={() => setCursor(i)}
              >
                <span className="achievement-cell">
                  {icon && <img src={icon} alt="" className="pixel-img" />}
                </span>
                <span className="achievement-row-text">
                  <PixelText
                    font={font}
                    text={def.name}
                    scale={2}
                    color={unlocked ? GOLD : DIM}
                  />
                  <PixelText
                    font={font}
                    text={def.desc}
                    scale={1}
                    color={unlocked ? BODY : DIM}
                    maxWidth={DESC_REM}
                  />
                  {progress && !unlocked && (
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
                        scale={1}
                        color={DIM}
                      />
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="pixel-button achievements-close"
          aria-label="achievements-back"
          onClick={() => {
            playUiSound(synth, "back");
            onClose();
          }}
        >
          <PixelText font={font} text="BACK" scale={2} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}

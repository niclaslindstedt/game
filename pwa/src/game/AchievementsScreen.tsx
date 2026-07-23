// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ACHIEVEMENTS browser: a full-screen gallery of every badge, grouped by
// category, each row showing its icon, name, condition, and (for counter
// ladders) live progress — earned badges framed in gold, locked ones dimmed.
// Reached from the title menu's ACHIEVEMENTS row and from the in-run HUD star
// (which appears only while new badges wait). Opening it acknowledges the
// unseen queue, dimming the star. Follows the arsenal viewer's shape: a
// scrollable list, ESC/BACK out, pointer or arrow keys to walk rows.

import { useEffect, useMemo, useState } from "react";

import { PixelBar } from "@ui/lib/PixelBar.tsx";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import { TIER_POINTS } from "@niclaslindstedt/oss-framework/achievements";

import { AchievementCard, AchievementCardBody } from "./AchievementCard.tsx";
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

/** The shelf can show every badge, only the ones already earned (what the
 * player HAS done), or only the locked ones (what's left to chase). */
type Filter = "all" | "unlocked" | "locked";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "unlocked", label: "UNLOCKED" },
  { id: "locked", label: "LOCKED" },
];

/** The completion bar reads either the badge count or the point total; a tap
 * flips between them. */
type Meter = "count" | "points";

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

  // Which slice to show, and what the completion bar reads. The bar and its
  // percentages always reflect the WHOLE catalog — the filter only narrows the
  // list below it.
  const [filter, setFilter] = useState<Filter>("all");
  const [meter, setMeter] = useState<Meter>("count");

  // Group every badge by category once (full totals for the header + the bar),
  // independent of the active filter.
  const { categories, earned, total, points, maxPoints } = useMemo(() => {
    const categories: {
      label: string;
      badges: { def: AchievementDef; unlocked: boolean }[];
      earned: number;
      total: number;
    }[] = [];
    let earned = 0;
    let total = 0;
    let points = 0;
    let maxPoints = 0;
    for (const category of ACHIEVEMENT_CATEGORIES) {
      const defs = ACHIEVEMENTS.filter((a) => a.category === category);
      if (defs.length === 0) continue;
      const badges = defs.map((def) => ({
        def,
        unlocked: save.unlocked[def.id] !== undefined,
      }));
      const done = badges.filter((b) => b.unlocked).length;
      categories.push({
        label: CATEGORY_LABELS[category],
        badges,
        earned: done,
        total: defs.length,
      });
      earned += done;
      total += defs.length;
      for (const def of defs) {
        maxPoints += TIER_POINTS[def.tier];
        if (save.unlocked[def.id] !== undefined)
          points += TIER_POINTS[def.tier];
      }
    }
    return { categories, earned, total, points, maxPoints };
  }, [save]);

  // The visible list: apply the earned/locked filter, dropping any category
  // header left with no matching badge. `badges` is the flat cursor track, so
  // it must line up with the rows actually rendered.
  const { rows, badges } = useMemo(() => {
    const rows: Row[] = [];
    const badges: AchievementDef[] = [];
    for (const cat of categories) {
      const shown = cat.badges.filter(
        (b) =>
          filter === "all" ||
          (filter === "unlocked" ? b.unlocked : !b.unlocked),
      );
      if (shown.length === 0) continue;
      rows.push({
        kind: "header",
        label: cat.label,
        earned: cat.earned,
        total: cat.total,
      });
      for (const b of shown) {
        rows.push({ kind: "badge", def: b.def, unlocked: b.unlocked });
        badges.push(b.def);
      }
    }
    return { rows, badges };
  }, [categories, filter]);

  // The completion bar's fill + readout for the active meter.
  const meterFraction =
    meter === "points"
      ? maxPoints > 0
        ? points / maxPoints
        : 0
      : total > 0
        ? earned / total
        : 0;
  const meterPct = Math.round(100 * meterFraction);
  const meterLabel =
    meter === "points"
      ? `${meterPct}% · ${points}/${maxPoints} PTS`
      : `${meterPct}% · ${earned}/${total} UNLOCKED`;

  // Wide viewports (the arsenal's breakpoint) dock the detail card BESIDE the
  // list, always showing the selected badge; narrow phones pop it up as a modal
  // on tap instead. Tracked live so a rotate/resize re-homes the card.
  const wide = useMediaQuery("(min-aspect-ratio: 4/3)");

  // The keyboard cursor walks BADGE rows (headers are skipped); a MOUSE hover
  // moves it too, like the arsenal list. Touch does NOT — a finger dragging to
  // scroll would otherwise light up every row it passes (see the pointer-enter
  // guard on the rows).
  const [cursor, setCursor] = useState(0);
  // Narrow-only: the badge whose pop-up card is open (index into `badges`), or
  // null. On wide viewports the side panel follows `cursor` and this stays null.
  const [openBadge, setOpenBadge] = useState<number | null>(null);

  // Switching the filter reshuffles the badge list, so the old cursor/pop-up
  // index no longer points at the same badge — snap back to the top.
  const pickFilter = (id: Filter) => {
    playUiSound(synth, "move");
    setFilter(id);
    setCursor(0);
    setOpenBadge(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While a pop-up card is open it owns the keyboard (its own ESC closes
      // it); the shelf's shortcuts stand down.
      if (openBadge !== null) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (badges.length === 0) return;
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c + delta + badges.length) % badges.length);
      } else if (event.key === "Enter" || event.key === " ") {
        // On wide the card is always docked beside the list — Enter is a no-op;
        // on narrow it pops the focused badge's card open.
        event.preventDefault();
        if (badges.length === 0 || wide) return;
        playUiSound(synth, "confirm");
        setOpenBadge(cursor);
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
  }, [badges.length, cursor, openBadge, wide, onClose]);

  let badgeIndex = -1;
  return (
    <div className="achievements-overlay">
      <div className="achievements-panel">
        <PixelText font={font} text="ACHIEVEMENTS" scale={3} color={GOLD} />

        {/* Completion meter: a filled amber bar (the same @ui/lib/PixelBar as
            the level-up lockout timer) reading how much of the catalog is done.
            A tap flips it between badge count and point total. */}
        <button
          type="button"
          className="achievements-meter"
          aria-label={`completion ${meterLabel} — tap to toggle count and points`}
          onClick={() => {
            playUiSound(synth, "move");
            setMeter((m) => (m === "count" ? "points" : "count"));
          }}
        >
          <PixelBar fill={meterFraction} />
          <PixelText font={font} text={meterLabel} scale={1} color={BODY} />
        </button>

        <div className="achievements-filter" role="group" aria-label="filter">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`pixel-button achievements-filter-btn${
                filter === id ? " active" : ""
              }`}
              aria-pressed={filter === id}
              onClick={() => pickFilter(id)}
            >
              <PixelText
                font={font}
                text={label}
                scale={1}
                color={filter === id ? "#0b0d10" : BODY}
              />
            </button>
          ))}
        </div>

        <div className="achievements-body">
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
                  role="button"
                  tabIndex={-1}
                  aria-label={`achievement-${def.id}`}
                  // Only a MOUSE hover moves the cursor — a touch drag to scroll
                  // must not light up every row the finger passes over.
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setCursor(i);
                  }}
                  // Tap/click selects the badge. A scroll-drag is not a click
                  // (the browser cancels it), so this never fires while flicking
                  // the list. On narrow phones it also pops the card open; on wide
                  // the docked side panel just follows the selection.
                  onClick={() => {
                    playUiSound(synth, "confirm");
                    setCursor(i);
                    if (!wide) setOpenBadge(i);
                  }}
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
            {rows.length === 0 && (
              <div className="achievements-empty">
                <PixelText
                  font={font}
                  text={
                    filter === "unlocked"
                      ? "NOTHING UNLOCKED YET"
                      : "ALL ACHIEVEMENTS UNLOCKED"
                  }
                  scale={2}
                  color={DIM}
                />
              </div>
            )}
          </div>

          {wide && badges[cursor] && (
            <div
              className={`achievements-detail ${
                save.unlocked[badges[cursor].id] !== undefined
                  ? "unlocked"
                  : "locked"
              }`}
            >
              <AchievementCardBody
                font={font}
                sprites={sprites}
                def={badges[cursor]}
                unlocked={save.unlocked[badges[cursor].id] !== undefined}
                unlockedAt={save.unlocked[badges[cursor].id]}
                meta={save.meta[badges[cursor].id]}
                totals={save.totals}
              />
            </div>
          )}
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

      {!wide && openBadge !== null && badges[openBadge] && (
        <AchievementCard
          font={font}
          sprites={sprites}
          def={badges[openBadge]}
          unlocked={save.unlocked[badges[openBadge].id] !== undefined}
          unlockedAt={save.unlocked[badges[openBadge].id]}
          meta={save.meta[badges[openBadge].id]}
          totals={save.totals}
          onClose={() => setOpenBadge(null)}
        />
      )}
    </div>
  );
}

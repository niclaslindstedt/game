// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HIGH SCORES board: hardcore-only campaign rankings, steered on two axes
// rather than a cursor list — left/right walks the difficulty ladder, up/down
// flips between the four rankings — from arrows, swipes, or taps on the axis
// labels. A tapped row opens its full campaign breakdown card. The board owns
// its own keyboard listener while mounted; TitleScreen's menu navigation
// stays out of the way (its keydown handler skips the scores screen).

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

import {
  difficultyDef,
  DIFFICULTY_ORDER,
  levelDef,
  type Difficulty,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { synth } from "../audio.ts";
import {
  topCampaigns,
  type CampaignRow,
  type ScoreMetric,
} from "../highscores.ts";
import { playUiSound } from "../sfx/index.ts";
import { unlockAudio } from "./menu-model.ts";

/** The high-score board's rankings, in swipe/arrow order. */
const SCORE_METRICS: { id: ScoreMetric; label: string }[] = [
  { id: "kills", label: "MOBS KILLED" },
  { id: "time", label: "SURVIVAL TIME" },
  { id: "kpm", label: "KILLS / MIN" },
  { id: "menace", label: "PEAK MENACE" },
];

/** A minimum travel (CSS px) before a pointer drag counts as a swipe. */
const SWIPE_THRESHOLD = 36;

/** m:ss survival time (mirrors the HUD/splash formatter). */
const formatTime = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Kills-per-minute, kept to one decimal below 10 and whole above (a
 * double-digit rate reads cleaner without the noise of a trailing decimal). */
const formatKpm = (v: number): string =>
  v >= 10 ? String(Math.round(v)) : v.toFixed(1);

/** YYYY-MM-DD for a banked run's timestamp — the detail card's date line. */
const formatScoreDate = (at: number): string => {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function HighScoresBoard({
  font,
  difficulty,
  setDifficulty,
  metric,
  setMetric,
  detail,
  setDetail,
  onBack,
}: {
  font: PixelFont;
  /** The board's two axes and the opened breakdown card live in TitleScreen,
   * so leaving the board and coming back lands where the player left off. */
  difficulty: Difficulty;
  setDifficulty: Dispatch<SetStateAction<Difficulty>>;
  metric: ScoreMetric;
  setMetric: Dispatch<SetStateAction<ScoreMetric>>;
  detail: CampaignRow | null;
  setDetail: (row: CampaignRow | null) => void;
  /** Leave the board (Escape/Enter/Space or the BACK button); the caller
   * re-homes the cursor on the HIGH SCORES row of the main menu. */
  onBack: () => void;
}) {
  const stepDifficulty = useCallback(
    (delta: number) => {
      unlockAudio();
      playUiSound(synth, "move");
      setDetail(null);
      setDifficulty((d) => {
        const n = DIFFICULTY_ORDER.length;
        const i = (DIFFICULTY_ORDER.indexOf(d) + delta + n) % n;
        return DIFFICULTY_ORDER[i] as Difficulty;
      });
    },
    [setDetail, setDifficulty],
  );
  const stepMetric = useCallback(
    (delta: number) => {
      unlockAudio();
      playUiSound(synth, "move");
      setDetail(null);
      setMetric((m) => {
        const n = SCORE_METRICS.length;
        const i = (SCORE_METRICS.findIndex((x) => x.id === m) + delta + n) % n;
        return (SCORE_METRICS[i] as { id: ScoreMetric }).id;
      });
    },
    [setDetail, setMetric],
  );

  // The board reinterprets the menu arrows as its two axes; Enter/Space/Escape
  // leave (or, with a detail card open, close the card first).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While a detail card is open the whole board's navigation collapses to
      // "close it" — any steer/confirm/back key returns to the ranked list.
      if (detail) {
        if (
          event.key === "Escape" ||
          event.key === "Enter" ||
          event.key === " " ||
          event.key.startsWith("Arrow")
        ) {
          event.preventDefault();
          unlockAudio();
          playUiSound(synth, "back");
          setDetail(null);
        }
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        stepDifficulty(event.key === "ArrowRight" ? 1 : -1);
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        stepMetric(event.key === "ArrowDown" ? 1 : -1);
      } else if (
        event.key === "Escape" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "back");
        onBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detail, setDetail, stepDifficulty, stepMetric, onBack]);

  // Touch: a swipe on the board picks its axis by the dominant direction —
  // horizontal walks the difficulty ladder, vertical flips the ranking.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent) => {
    unlockAudio();
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    // A detail card owns its own BACK button; don't let a swipe behind it
    // quietly walk the difficulty ladder or flip the ranking.
    if (detail) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Swipe left advances the ladder (next difficulty), right steps back.
      stepDifficulty(dx < 0 ? 1 : -1);
    } else {
      // Swipe up advances the ranking, down steps back.
      stepMetric(dy < 0 ? 1 : -1);
    }
  };

  const scoreRows = topCampaigns(difficulty, metric);
  const scoreDef = difficultyDef(difficulty);

  return (
    <>
      <PixelText font={font} text="HIGH SCORES" scale={2} color="#d9a0f0" />
      <PixelText
        font={font}
        text="HARDCORE CAMPAIGNS"
        scale={1}
        color="#ff6d6d"
      />
      <div
        className="score-board"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <button
          type="button"
          className="score-axis score-bob"
          aria-label="score-difficulty"
          onClick={() => stepDifficulty(1)}
        >
          <PixelText
            font={font}
            text={scoreDef.name}
            scale={3}
            color={scoreDef.color}
          />
        </button>

        {detail ? (
          (() => {
            const survived = detail.outcome === "survived";
            const { name: levelName } = scoreLevelInfo(detail.levelId ?? "");
            // The whole campaign at a glance: the four ranked numbers
            // plus how far the hero got before beating it or falling.
            const lines: [string, string][] = [
              ["MOBS KILLED", String(detail.kills)],
              ["SURVIVAL TIME", formatTime(detail.combatMs)],
              ["KILLS / MIN", formatKpm(detail.kpm)],
              ["PEAK MENACE", `RAMPAGE ${detail.peakMenace}`],
              ["LEVELS CLEARED", String(detail.levels)],
            ];
            if (!survived && detail.levelId) {
              lines.push(["FELL ON", levelName]);
            }
            return (
              <div className="score-detail">
                <PixelText
                  font={font}
                  text={survived ? "SURVIVED" : "FELL"}
                  scale={3}
                  color={survived ? "#7ef0c8" : "#d83a3a"}
                />
                <PixelText font={font} text={detail.name} scale={2} />
                <PixelText
                  font={font}
                  text={formatScoreDate(detail.at)}
                  scale={1}
                  color="#7a8088"
                />
                <div className="score-detail-stats">
                  {lines.map(([label, value]) => (
                    <div className="score-detail-row" key={label}>
                      <PixelText
                        font={font}
                        text={label}
                        scale={1}
                        color="#9aa3ad"
                      />
                      <PixelText font={font} text={value} scale={2} />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="score-back"
                  aria-label="score-back"
                  onClick={() => {
                    playUiSound(synth, "back");
                    setDetail(null);
                  }}
                >
                  <PixelText
                    font={font}
                    text="BACK"
                    scale={3}
                    color="#ffd75e"
                  />
                </button>
              </div>
            );
          })()
        ) : (
          <>
            <button
              type="button"
              className="score-metric score-bob score-bob-delay"
              aria-label="score-metric"
              onClick={() => stepMetric(1)}
            >
              <PixelText
                font={font}
                text={SCORE_METRICS.find((m) => m.id === metric)?.label ?? ""}
                scale={2}
                color="#7ef0c8"
              />
            </button>

            <div className="score-list">
              {scoreRows.length === 0 ? (
                <PixelText
                  font={font}
                  text="NO CAMPAIGNS YET"
                  scale={2}
                  color="#5a6068"
                />
              ) : (
                scoreRows.map((row, i) => {
                  const medal =
                    ["#ffd75e", "#c8cdd4", "#cd7f4b"][i] ?? "#7ef0c8";
                  // Each ranking leads with its own metric; the smaller
                  // secondary line keeps the two headline numbers (kills
                  // and survival) cross-visible.
                  const metricValue = (m: ScoreMetric): string => {
                    switch (m) {
                      case "kills":
                        return `${row.kills} KILLS`;
                      case "time":
                        return formatTime(row.combatMs);
                      case "kpm":
                        return `${formatKpm(row.kpm)} KPM`;
                      case "menace":
                        return `RAMPAGE ${row.peakMenace}`;
                    }
                  };
                  const primary = metricValue(metric);
                  const secondary =
                    metric === "kills"
                      ? metricValue("time")
                      : metricValue("kills");
                  return (
                    <button
                      type="button"
                      className="score-row"
                      key={i}
                      aria-label={`score-row-${i + 1}`}
                      onClick={() => {
                        playUiSound(synth, "move");
                        setDetail(row);
                      }}
                    >
                      <PixelText
                        font={font}
                        text={`${i + 1}.`}
                        scale={3}
                        color={medal}
                      />
                      <PixelText font={font} text={primary} scale={3} />
                      <PixelText
                        font={font}
                        text={secondary}
                        scale={1}
                        color="#9aa3ad"
                      />
                      <PixelText
                        font={font}
                        text=">"
                        scale={2}
                        color="#5a6068"
                      />
                    </button>
                  );
                })
              )}
            </div>

            <PixelText
              font={font}
              text="SWIPE OR ARROWS TO SWITCH"
              scale={2}
              color="#7a8088"
            />
            <button
              type="button"
              className="score-back"
              aria-label="score-back"
              onClick={() => {
                playUiSound(synth, "back");
                onBack();
              }}
            >
              <PixelText font={font} text="BACK" scale={3} color="#ffd75e" />
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** Resolve a banked run's level id to its display name and hostile label,
 * tolerating an id a later content revision may have retired. */
function scoreLevelInfo(levelId: string): { name: string; foes: string } {
  try {
    const level = levelDef(levelId);
    return { name: level.name, foes: level.foes };
  } catch {
    return { name: levelId.toUpperCase(), foes: "FOES" };
  }
}

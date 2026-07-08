// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level-up chooser: shown while the engine pauses in the `levelup`
// phase. One button per stat; each click spends one banked point through
// `allocateStat`, and play resumes automatically when the last point is
// spent. Each button carries a short blurb; the (i) toggle opens a panel with
// the full per-stat effects (kept in sync with the engine's STATS rules).

import { useState } from "react";

import {
  allocateStat,
  effectiveStat,
  type GameState,
  type StatName,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

// The short blurb sits on each button; `info` is the full breakdown shown
// under the (i) toggle. Both must track what the stats actually do
// (src/game/config.ts STATS + src/game/items.ts) — every stat now touches
// more than damage, so keep these honest.
const CHOICES: {
  stat: StatName;
  label: string;
  blurb: string;
  info: string;
}[] = [
  {
    stat: "stamina",
    label: "STAMINA",
    blurb: "SPRINT + LEGS",
    info: "DEEPER SPRINT POOL, SLOWER DRAIN & FASTER RECOVERY. RUN AT FULL SPEED LONGER.",
  },
  {
    stat: "strength",
    label: "STRENGTH",
    blurb: "DAMAGE + BAG",
    info: "MELEE & RANGED WEAPON DAMAGE. +1 BAG SLOT EACH.",
  },
  {
    stat: "dexterity",
    label: "DEXTERITY",
    blurb: "ATTACK SPEED",
    info: "FASTER MELEE & RANGED ATTACK SPEED.",
  },
  {
    stat: "intelligence",
    label: "INTELLECT",
    blurb: "RANGE + AOE",
    info: "MAGIC POWER, LONGER RANGE & BIGGER AOE (HITS MORE).",
  },
  {
    stat: "speed",
    label: "SPEED",
    blurb: "MOVE SPEED",
    info: "+8% MOVE SPEED EACH.",
  },
  {
    stat: "luck",
    label: "LUCK",
    blurb: "CRIT + LOOT",
    info: "MORE CRITS, DODGE ENEMY CRITS, MORE & BETTER LOOT.",
  },
];

export function LevelUpOverlay({
  state,
  font,
  onChange,
}: {
  state: GameState;
  font: PixelFont;
  onChange: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const points = state.player.pendingStatPoints;
  return (
    <div className="game-overlay levelup-overlay">
      <div className="levelup-box">
        <div className="levelup-header">
          <PixelText font={font} text="LEVEL UP!" scale={5} color="#ffd75e" />
          <button
            type="button"
            className={`info-button${showInfo ? " active" : ""}`}
            aria-label="toggle-stat-info"
            onClick={() => setShowInfo((v) => !v)}
          >
            <PixelText font={font} text="i" scale={2} color="#0b0d10" />
          </button>
        </div>
        <PixelText
          font={font}
          text={
            points > 1 ? `CHOOSE A STAT (${points} POINTS)` : "CHOOSE A STAT"
          }
          scale={2}
          color="#9aa3ad"
        />
        {showInfo ? (
          <div className="stat-info">
            {CHOICES.map(({ stat, label, info }) => (
              <div key={stat} className="stat-info-row">
                <PixelText font={font} text={label} scale={2} color="#ffd75e" />
                <PixelText font={font} text={info} scale={1} color="#c7ccd1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="stat-buttons">
            {CHOICES.map(({ stat, label, blurb }) => (
              <button
                key={stat}
                type="button"
                className="pixel-button stat-button"
                aria-label={`stat-${stat}`}
                onClick={() => {
                  allocateStat(state, stat);
                  onChange();
                }}
              >
                <PixelText
                  font={font}
                  text={`${label} ${effectiveStat(state, stat)}`}
                  scale={2}
                  color="#0b0d10"
                />
                <PixelText font={font} text={blurb} scale={1} color="#3a4048" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

import { spriteDataUrl, type Sprites } from "./assets.ts";

// The short blurb sits on each button; `info` is the full breakdown shown
// under the (i) toggle. Both must track what the stats actually do
// (src/game/config.ts STATS + src/game/items.ts) — every stat now touches
// more than damage, so keep these honest. `icon` is the stat's pixel glyph
// (sprite-data/icons.mjs) shown on the button and in the info panel.
const CHOICES: {
  stat: StatName;
  label: string;
  blurb: string;
  info: string;
  icon: string;
}[] = [
  {
    stat: "stamina",
    label: "STAMINA",
    blurb: "SPRINT + HP",
    info: "DEEPER SPRINT POOL, SLOWER DRAIN & FASTER RECOVERY. ALSO RAISES MAX HP.",
    icon: "icon_stat_stamina",
  },
  {
    stat: "strength",
    label: "STRENGTH",
    blurb: "DAMAGE + BAG",
    info: "MELEE & RANGED WEAPON DAMAGE. +1 BAG SLOT EACH.",
    icon: "icon_stat_strength",
  },
  {
    stat: "dexterity",
    label: "DEXTERITY",
    blurb: "SPEED + CRIT",
    info: "FASTER MELEE & RANGED ATTACK SPEED, MORE MELEE & RANGED CRITS, AND MORE DODGE.",
    icon: "icon_stat_dexterity",
  },
  {
    stat: "intelligence",
    label: "INTELLECT",
    blurb: "MAGIC + AOE",
    info: "MAGIC POWER & CRITS. LONGER RANGE & A BIGGER MELEE AOE CONE (HITS MORE).",
    icon: "icon_stat_intelligence",
  },
  {
    stat: "speed",
    label: "SPEED",
    blurb: "MOVE SPEED",
    info: "+8% MOVE SPEED EACH.",
    icon: "icon_stat_speed",
  },
  {
    stat: "luck",
    label: "LUCK",
    blurb: "CRIT + LOOT",
    info: "A LITTLE MORE CRIT & DODGE, DODGE ENEMY CRITS, MORE & BETTER LOOT.",
    icon: "icon_stat_luck",
  },
];

/** The stat's pixel glyph, or nothing if the sprite is missing. */
function StatGlyph({ sprites, icon }: { sprites: Sprites; icon: string }) {
  const src = spriteDataUrl(sprites, icon);
  if (!src) return null;
  return (
    <img src={src} alt="" className="pixel-img stat-icon" draggable={false} />
  );
}

export function LevelUpOverlay({
  state,
  font,
  sprites,
  onChange,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
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
            {CHOICES.map(({ stat, label, info, icon }) => (
              <div key={stat} className="stat-info-row">
                <div className="stat-info-head">
                  <StatGlyph sprites={sprites} icon={icon} />
                  <PixelText
                    font={font}
                    text={label}
                    scale={2}
                    color="#ffd75e"
                  />
                </div>
                <PixelText font={font} text={info} scale={1} color="#c7ccd1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="stat-buttons">
            {CHOICES.map(({ stat, label, blurb, icon }) => (
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
                <StatGlyph sprites={sprites} icon={icon} />
                <span className="stat-button-text">
                  <PixelText
                    font={font}
                    text={`${label} ${effectiveStat(state, stat)}`}
                    scale={2}
                    color="#0b0d10"
                  />
                  <PixelText
                    font={font}
                    text={blurb}
                    scale={1}
                    color="#3a4048"
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

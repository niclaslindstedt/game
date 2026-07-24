// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The TALENT PICKER — shown above the level-up chooser whenever the hero has an
// unspent talent point (the engine queues one per ×10 tree milestone in
// `pendingTalentPoints`; see reconcileTalentPoints). It reveals the WHOLE tree
// of the earning stat — one row per talent, its filled rank pips, its blurb —
// and a tap spends the point into that talent (`spendTalentPoint`), ranking it
// up and lifting the level-up pause once the last point is spent. A tree's
// points are drained one at a time; a fresh remount (keyed on the front tree)
// re-arms the reveal lockout each time the earning tree changes.
//
// Reveal freeze mirrors the level-up chooser: a short arm lockout during which
// the rows are inert, so a stray steering tap can't burn a permanent pick.
//
// Keyboard: up/down move a cursor over the trainable talents, Enter/Space spends
// on the highlighted one. GameScreen cedes the keyboard while `levelup` is up.

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  spendTalentPoint,
  talentRank,
  talentsForTree,
  TALENT_STAT_CLASS,
  type GameState,
  type TalentClass,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useArmDelay } from "@ui/lib/use-arm-delay.ts";

// Kept in sync with the CSS `talent-arming` fill — the rows stay inert this long
// after the picker reveals.
const TALENT_ARM_MS = 800;

/** The tree's display persona + accent, keyed by weapon-class tree. */
const TREE_LOOK: Record<
  TalentClass,
  { title: string; kicker: string; accent: string; deep: string }
> = {
  melee: {
    title: "WARLORD",
    kicker: "STRENGTH TALENT",
    accent: "#ff8a4c",
    deep: "#7a2a12",
  },
  ranged: {
    title: "WINDRUNNER",
    kicker: "DEXTERITY TALENT",
    accent: "#7ef0a0",
    deep: "#155036",
  },
  magic: {
    title: "ARCHON",
    kicker: "INTELLIGENCE TALENT",
    accent: "#8ab4ff",
    deep: "#1c2c6e",
  },
};

export function TalentPickerOverlay({
  state,
  font,
  onChange,
}: {
  state: GameState;
  font: PixelFont;
  onChange: () => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(false);
  const armed = useArmDelay(TALENT_ARM_MS);

  const stat = state.pendingTalentPoints[0];
  const tree = stat ? TALENT_STAT_CLASS[stat] : undefined;
  // The tree's talent list is stable for a given tree — memoize it so it doesn't
  // re-trigger the keyboard effect every render.
  const talents = useMemo(() => (tree ? talentsForTree(tree) : []), [tree]);
  const points = state.pendingTalentPoints.length;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!armed) {
        event.preventDefault();
        return;
      }
      const n = talents.length;
      if (n === 0) return;
      const code = event.code;
      const step = (delta: number) => {
        event.preventDefault();
        setActive(true);
        setCursor((c) => (c + delta + n) % n);
      };
      if (code === "ArrowUp" || code === "KeyW") step(-1);
      else if (code === "ArrowDown" || code === "KeyS") step(1);
      else if (code === "ArrowLeft" || code === "KeyA") step(-1);
      else if (code === "ArrowRight" || code === "KeyD") step(1);
      else if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
        const def = talents[cursor];
        if (!def) return;
        event.preventDefault();
        if (spendTalentPoint(state, def.id)) onChange();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armed, cursor, talents, state, onChange]);

  if (!tree) return null;
  const look = TREE_LOOK[tree];

  return (
    <div className="game-overlay talent-overlay">
      <div
        className={`talent-box${armed ? "" : " arming"}`}
        style={
          {
            "--talent-accent": look.accent,
            "--talent-deep": look.deep,
          } as CSSProperties
        }
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="talent-header">
          <PixelText
            font={font}
            text={`${look.kicker} EARNED`}
            scale={2}
            color={look.accent}
          />
          <PixelText font={font} text={look.title} scale={4} />
          <PixelText
            font={font}
            text={
              points > 1 ? `SPEND A POINT (${points} LEFT)` : "SPEND YOUR POINT"
            }
            scale={2}
            color="#9aa3ad"
          />
        </div>
        <div className="talent-rows">
          {talents.map((def, i) => {
            const rank = talentRank(state, def.id);
            const maxed = rank >= def.maxRank;
            const highlighted = active && cursor === i;
            return (
              <button
                key={def.id}
                type="button"
                className={`pixel-button talent-row${
                  highlighted ? " selected" : ""
                }${maxed ? " maxed" : ""}`}
                aria-label={`talent-${def.id}`}
                disabled={maxed}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setActive(true);
                  setCursor(i);
                }}
                onClick={() => {
                  if (!armed || maxed) return;
                  setCursor(i);
                  if (spendTalentPoint(state, def.id)) onChange();
                }}
              >
                <span className="talent-row-text">
                  <span className="talent-row-top">
                    <PixelText
                      font={font}
                      text={def.name}
                      scale={2}
                      color="#0b0d10"
                    />
                    <span className="talent-pips" aria-hidden>
                      {Array.from({ length: def.maxRank }, (_, r) => (
                        <span
                          key={r}
                          className={`talent-pip${r < rank ? " lit" : ""}`}
                        />
                      ))}
                    </span>
                  </span>
                  <PixelText
                    font={font}
                    text={def.blurb.toUpperCase()}
                    scale={2}
                    color="#3a4048"
                    maxWidth={28}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

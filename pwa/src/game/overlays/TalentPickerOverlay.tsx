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

import { localHero } from "../local-seat.ts";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  talentRank,
  talentIcon,
  talentsForTree,
  TALENT_STAT_CLASS,
  type GameState,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useArmDelay } from "@ui/lib/use-arm-delay.ts";

import { spriteDataUrl, type Sprites } from "../assets.ts";
import { TREE_LOOK } from "../talent-look.ts";

import { runCommandOk } from "../run-commands.ts";

// Kept in sync with the CSS `talent-arming` fill — the rows stay inert this long
// after the picker reveals.
const TALENT_ARM_MS = 800;

/** CSS px per rem at the default root font-size — the 1:1 reference. */
const REM_BASE_PX = 16;

/** Fallback blurb wrap width (rem) for the first paint, before the row width is
 * measured — sized to the narrowest phone row so text never spills on frame 1. */
const BLURB_FALLBACK_REM = 14;

export function TalentPickerOverlay({
  state,
  font,
  sprites,
  onChange,
  demoFocusTalent = null,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
  onChange: () => void;
  /** HOW TO PLAY demo only: the talent the autopilot is about to tap. When
   * set, that row carries the selection ring (the same highlight a human
   * cursor gives) so a viewer can SEE which talent the bot picks. Null in
   * normal play, where the cursor/hover drives the highlight instead. */
  demoFocusTalent?: string | null;
}) {
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(false);
  const armed = useArmDelay(TALENT_ARM_MS);

  // A row's blurb is a fixed-size PixelText canvas, so it can't reflow with CSS
  // — it must be told how wide to wrap. Measure the actual row text column and
  // hand each blurb that width in rem, so a long blurb wraps to fit the box
  // instead of spilling off both edges (the narrow portrait box is the pinch).
  // Measured, not a constant, so it adapts to orientation AND the large-screen
  // rem bump. `PixelText` reads `maxWidth` in rem-at-16, and rem = px / rootPx.
  const rowsRef = useRef<HTMLDivElement>(null);
  const [blurbRem, setBlurbRem] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    const measure = () => {
      const text = el.querySelector<HTMLElement>(".talent-row-text");
      const w = text?.clientWidth ?? 0;
      const rootPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        REM_BASE_PX;
      if (w > 0 && rootPx > 0) {
        const next = w / rootPx;
        setBlurbRem((prev) =>
          prev !== null && Math.abs(prev - next) < 0.25 ? prev : next,
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stat = localHero(state).pendingTalentPoints[0];
  const tree = stat ? TALENT_STAT_CLASS[stat] : undefined;
  // The tree's talent list is stable for a given tree — memoize it so it doesn't
  // re-trigger the keyboard effect every render.
  const talents = useMemo(() => (tree ? talentsForTree(tree) : []), [tree]);
  const points = localHero(state).pendingTalentPoints.length;

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
        if (runCommandOk(state, "spendTalentPoint", def.id)) onChange();
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
        <div className="talent-rows" ref={rowsRef}>
          {talents.map((def, i) => {
            const rank = talentRank(state, localHero(state), def.id);
            const maxed = rank >= def.maxRank;
            // The demo's bot-focus highlight overrides the cursor/hover one so
            // the picked talent lights up as the autopilot taps it.
            const highlighted =
              demoFocusTalent != null
                ? def.id === demoFocusTalent
                : active && cursor === i;
            const icon = spriteDataUrl(sprites, talentIcon(def));
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
                  if (runCommandOk(state, "spendTalentPoint", def.id))
                    onChange();
                }}
              >
                {icon && (
                  <img
                    className="talent-row-icon"
                    src={icon}
                    alt=""
                    aria-hidden
                  />
                )}
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
                    className="talent-row-blurb"
                    font={font}
                    text={def.blurb.toUpperCase()}
                    scale={2}
                    color="#3a4048"
                    maxWidth={blurbRem ?? BLURB_FALLBACK_REM}
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

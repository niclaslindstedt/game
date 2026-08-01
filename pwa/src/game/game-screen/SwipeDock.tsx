// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SWIPE BARS (SETTINGS → GAMEPLAY, touch only): the item and powerup bars,
// summoned by an edge swipe instead of parked in the corners. Three invisible
// strips hug the left, right and bottom screen edges; a touch that lands on
// one and pulls inward past the threshold opens ONE bar — both slot groups,
// with larger icons than the fixed docks wear — centred on the swipe itself,
// so the bar opens under the thumb that asked for it (vertical off a side
// edge, horizontal off the bottom). Pressing a slot spends it and the bar
// folds away; a tap anywhere else folds it away unspent. Built for one-handed
// play: any reachable stretch of any edge summons everything, so nobody has
// to reach a corner.
//
// The geometry (what counts as "in", where the bar fits) is the pure module
// swipe-bar.ts; this component owns the pointers, the animation and the DOM.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

import { abilityDef } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import {
  medkitColorFor,
  medkitIconFor,
  REPAIR_KIT_COLOR,
  REPAIR_KIT_ICON,
  STAMINA_POTION_COLOR,
  STAMINA_POTION_ICON,
} from "../consumables.ts";
import type { ConsumableKind } from "./ConsumableDock.tsx";
import type { Hud } from "./hud-model.ts";
import {
  clampBarCenter,
  inwardTravel,
  SWIPE_OPEN_PX,
  type SwipeEdge,
} from "./swipe-bar.ts";

// How long the fold-away animation runs before the bar unmounts (ms) — a hair
// past the CSS `swipe-bar-out` duration so the last frame is never cut short.
const BAR_CLOSE_MS = 160;

/** The one open bar: which edge it came off, and where along that edge its
 * centre sits (the swipe's own cross-axis coordinate, in viewport CSS px —
 * clamped once the bar has been measured). */
type OpenBar = { edge: SwipeEdge; at: number; closing: boolean };

/** A touch mid-swipe on an edge strip, before it has committed. */
type SwipeTrack = { edge: SwipeEdge; id: number; x: number; y: number };

export function SwipeDock({
  hud,
  assets,
  font,
  dockRef,
  onSpend,
  onUse,
}: {
  /** The HUD snapshot while playing, or null — the strips retire and any open
   * bar folds away (an overlay or the pause screen owns the field now). */
  hud: Hud | null;
  assets: GameAssets;
  font: PixelFont;
  /** Forwarded to the powerup slot group while the bar is open — the render
   * loop writes each running slot's cooldown sweep/countdown here, exactly as
   * it does into the fixed dock (it null-checks, so a closed bar costs it
   * nothing). */
  dockRef: RefObject<HTMLDivElement | null>;
  /** Spend exactly this powerup slot on the next sim tick. */
  onSpend: (index: number) => void;
  /** Queue one use of this consumable for the next sim tick. */
  onUse: (kind: ConsumableKind) => void;
}) {
  const [bar, setBar] = useState<OpenBar | null>(null);
  const trackRef = useRef<SwipeTrack | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const playing = hud !== null;

  // Fold the bar away (animated); the unmount happens on the timer so the
  // fold-out plays through. Re-entrant safe: a second ask while closing is a
  // no-op, and the timer is cleared on unmount.
  const closeBar = () => {
    setBar((open) => {
      if (!open || open.closing) return open;
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setBar(null);
      }, BAR_CLOSE_MS);
      return { ...open, closing: true };
    });
  };
  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  // The field changed hands (pause, an overlay, the run ended): drop the bar
  // on the spot — there is nothing to animate over any more. A render-time
  // reset (the derived-state pattern), not an effect: the stale bar must never
  // paint, and React re-renders immediately when state is set during render.
  if (!playing && bar !== null) {
    setBar(null);
  }

  // Once the bar has painted, clamp its centre so it fits the viewport — the
  // swipe's own coordinate is honored everywhere it can be (see swipe-bar.ts).
  // A layout effect so the correction lands before the frame is shown.
  useLayoutEffect(() => {
    if (!bar || bar.closing) return;
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const horizontal = bar.edge === "bottom";
    const span = horizontal ? window.innerWidth : window.innerHeight;
    const size = horizontal ? rect.width : rect.height;
    const clamped = clampBarCenter(bar.at, size, span);
    if (Math.abs(clamped - bar.at) > 0.5) {
      setBar({ ...bar, at: clamped });
    }
  }, [bar]);

  // The edge strips' gesture: only TOUCH pointers count (the setting is a
  // touch accessibility mode — a mouse has the whole screen and hover), and
  // only an inward pull commits. The strip captures the pointer so the swipe
  // keeps tracking once the finger leaves the narrow strip — which it does
  // almost immediately, that being the gesture.
  const startSwipe = (edge: SwipeEdge) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    trackRef.current = { edge, id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const moveSwipe = (e: ReactPointerEvent) => {
    const t = trackRef.current;
    if (!t || t.id !== e.pointerId) return;
    const pulled = inwardTravel(t.edge, t, { x: e.clientX, y: e.clientY });
    if (pulled < SWIPE_OPEN_PX) return;
    trackRef.current = null;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // The bar opens where the swipe BEGAN — the thumb's own seat on the edge —
    // not where the pull ended up.
    setBar({
      edge: t.edge,
      at: t.edge === "bottom" ? t.x : t.y,
      closing: false,
    });
  };
  const endSwipe = (e: ReactPointerEvent) => {
    const t = trackRef.current;
    if (t && t.id === e.pointerId) trackRef.current = null;
  };

  const spendSlot = (index: number) => {
    onSpend(index);
    closeBar();
  };
  const spendConsumable = (kind: ConsumableKind) => {
    onUse(kind);
    closeBar();
  };

  // One consumable slot — the fixed dock's own classes (so a filled slot
  // glows in its quality accent there and here alike), sized up by the
  // .swipe-bar styles.
  const consumableSlot = (
    kind: ConsumableKind,
    count: number,
    icon: string,
    accent: string,
  ) => (
    <button
      type="button"
      className={`consumable-slot${count > 0 ? " filled" : ""}`}
      style={
        count > 0 ? ({ "--slot-accent": accent } as CSSProperties) : undefined
      }
      aria-label={count > 0 ? `swipe-use-${kind}` : `swipe-${kind}-empty`}
      disabled={count === 0}
      onPointerDown={count > 0 ? () => spendConsumable(kind) : undefined}
    >
      {count > 0 && (
        <img
          src={spriteDataUrl(assets.sprites, icon) ?? ""}
          alt=""
          className="pixel-img consumable-icon"
        />
      )}
      {count > 0 && (
        <span className="consumable-count">
          <PixelText
            font={font}
            text={String(count)}
            scale={2}
            color="#f4f4f4"
          />
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* The invisible edge strips, up only while the run is playable. */}
      {playing &&
        (["left", "right", "bottom"] as const).map((edge) => (
          <div
            key={edge}
            className={`swipe-bar-zone zone-${edge}`}
            aria-hidden="true"
            onPointerDown={startSwipe(edge)}
            onPointerMove={moveSwipe}
            onPointerUp={endSwipe}
            onPointerCancel={endSwipe}
          />
        ))}

      {bar && hud && (
        <>
          {/* A tap anywhere off the bar folds it away unspent. The backdrop
              eats that one press (it must — letting it through would steer
              the hero toward wherever the player dismissed the bar). */}
          <div
            className="swipe-bar-backdrop"
            aria-label="close-swipe-bar"
            style={bar.closing ? { pointerEvents: "none" } : undefined}
            onPointerDown={closeBar}
          />
          <div
            ref={anchorRef}
            className={`swipe-bar-anchor bar-${bar.edge}`}
            style={bar.edge === "bottom" ? { left: bar.at } : { top: bar.at }}
          >
            <div className={`swipe-bar${bar.closing ? " closing" : ""}`}>
              {/* The item slots — same trio as the fixed consumable dock. */}
              <div className="swipe-bar-group">
                {consumableSlot(
                  "medkit",
                  hud.medkitCount,
                  medkitIconFor(hud.medkitTier),
                  medkitColorFor(hud.medkitTier),
                )}
                {consumableSlot(
                  "stamina",
                  hud.staminaPotions,
                  STAMINA_POTION_ICON,
                  STAMINA_POTION_COLOR,
                )}
                {consumableSlot(
                  "repair",
                  hud.repairKits,
                  REPAIR_KIT_ICON,
                  REPAIR_KIT_COLOR,
                )}
              </div>
              {/* The powerup slots. The render loop writes each running
                  slot's cooldown sweep/countdown through dockRef, exactly as
                  on the fixed dock (same [data-slot] contract). */}
              <div className="swipe-bar-group" ref={dockRef}>
                {[0, 1, 2].map((i) => {
                  const defId = hud.heldAbilities[i];
                  const active = defId ? hud.activeSlots.includes(i) : false;
                  const icon = defId
                    ? spriteDataUrl(assets.sprites, abilityDef(defId).icon)
                    : undefined;
                  if (active) {
                    return (
                      <div
                        key={i}
                        className="powerup-slot active"
                        data-slot={i}
                        aria-label={`swipe-active-powerup-${i}`}
                      >
                        {icon && (
                          <img
                            src={icon}
                            alt=""
                            className="pixel-img powerup-icon"
                          />
                        )}
                        <span className="active-powerup-sweep" />
                        <span className="active-powerup-secs" />
                      </div>
                    );
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`powerup-slot${defId ? " filled" : ""}`}
                      aria-label={
                        defId
                          ? `swipe-use-powerup-${i}`
                          : `swipe-powerup-slot-${i}-empty`
                      }
                      disabled={!defId}
                      onPointerDown={defId ? () => spendSlot(i) : undefined}
                    >
                      {icon && (
                        <img
                          src={icon}
                          alt=""
                          className="pixel-img powerup-icon"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

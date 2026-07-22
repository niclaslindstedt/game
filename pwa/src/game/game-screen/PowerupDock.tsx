// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The powerup dock: three big, thumb-sized slots. Oldest sits leftmost and
// fills rightward; tapping a slot spends exactly that powerup, which then
// STAYS in its slot and counts down like a WoW cooldown — the icon glows
// amber and a translucent radial sweep unwinds over its duration, the
// remaining seconds in the corner (animated by the render loop straight on
// the DOM via the forwarded dock ref). A banked slot can also be dragged
// clear of the dock to trash it in a poof of smoke; a running one can't
// (it's spent). This component owns the whole drag gesture: the ghost that
// follows the pointer, the "DRAG OFF TO DISCARD" hint, and the smoke poofs
// left where discarded powerups vanished.

import { useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

import { abilityDef } from "@game/core";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import type { Hud } from "./hud-model.ts";

// A powerup mid-drag out of its dock slot. `moved` flips once the pointer
// travels past the tap threshold, which is what tells a discard drag apart
// from a plain tap that spends the powerup.
type DockDrag = {
  index: number;
  defId: string;
  rect: DOMRect;
  x: number;
  y: number;
  moved: boolean;
};

// A one-shot smoke poof anchored (in viewport px) to where a discarded powerup
// vanished.
type Poof = { id: number; x: number; y: number };

// How far a powerup must be dragged off its dock slot's center before the
// gesture counts as a drag-to-discard rather than a tap that spends it (CSS px).
const DOCK_DRAG_THRESHOLD_PX = 16;
// How long a discard smoke poof lives before it clears itself (ms) — matches
// the .powerup-poof CSS animation.
const POOF_TTL_MS = 600;

export function PowerupDock({
  hud,
  assets,
  font,
  keyHints,
  weaponMenuOpen,
  side,
  dockRef,
  onSpend,
  onDiscard,
}: {
  /** The HUD snapshot while playing, or null (the dock hides; ghost/poofs
   * still render so a phase flip doesn't cut a poof short). */
  hud: Hud | null;
  assets: GameAssets;
  font: PixelFont;
  /** Show the 1/2/3 key caps (desktop keyboard controls on). */
  keyHints: boolean;
  /** While the weapon stack is open the number keys select weapons, so the
   * dock's key hints move over there. */
  weaponMenuOpen: boolean;
  /** Which bottom corner the dock lives in (settings.powerupSide). */
  side: "left" | "right";
  /** Forwarded to the dock element — the render loop writes each running
   * slot's cooldown sweep/countdown here, and BOT VIEW ripples index it. */
  dockRef: RefObject<HTMLDivElement | null>;
  /** Spend exactly this dock slot on the next sim tick (a plain tap). */
  onSpend: (index: number) => void;
  /** Discard the banked powerup in this slot; returns whether the engine
   * actually dropped one (drives the smoke poof). */
  onDiscard: (index: number) => boolean;
}) {
  // Mirrored into a ref so the pointer-up handler reads the freshest value
  // without re-subscribing.
  const [dockDrag, setDockDrag] = useState<DockDrag | null>(null);
  const dockDragRef = useRef<DockDrag | null>(null);
  // Short-lived smoke poofs left where discarded powerups vanished; each
  // clears itself after the CSS animation (see the .powerup-poof layer).
  const [poofs, setPoofs] = useState<Poof[]>([]);
  const poofIdRef = useRef(0);

  // Powerup dock interaction. A filled slot is both a button and a drag
  // handle: a plain tap/click spends the powerup (queued for the sim loop),
  // while dragging it clear of the dock trashes it in a poof of smoke — a
  // quick way to clear a banked slot for fresh loot. The gesture captures the
  // pointer on the slot so a touch keeps tracking off the button, and never
  // reaches the steering canvas (a separate element).
  const startDockDrag =
    (index: number, defId: string) => (e: ReactPointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dockDragRef.current = {
        index,
        defId,
        rect: e.currentTarget.getBoundingClientRect(),
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      setDockDrag(dockDragRef.current);
    };

  const moveDockDrag = (e: ReactPointerEvent) => {
    const d = dockDragRef.current;
    if (!d) return;
    const moved =
      d.moved ||
      Math.hypot(
        e.clientX - (d.rect.left + d.rect.width / 2),
        e.clientY - (d.rect.top + d.rect.height / 2),
      ) > DOCK_DRAG_THRESHOLD_PX;
    dockDragRef.current = { ...d, x: e.clientX, y: e.clientY, moved };
    setDockDrag(dockDragRef.current);
  };

  const endDockDrag = (e: ReactPointerEvent) => {
    const d = dockDragRef.current;
    dockDragRef.current = null;
    setDockDrag(null);
    if (!d) return;
    if (!d.moved) {
      // Barely moved: treat as a tap/click that spends this exact slot (the
      // dock's original behavior), queued for the next sim tick.
      onSpend(d.index);
      return;
    }
    // A real drag: released clear of the dock discards the powerup. A release
    // back over the dock is a harmless cancel (keep the powerup).
    const overDock = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(".powerup-dock");
    if (!overDock && onDiscard(d.index)) {
      const id = poofIdRef.current++;
      const poof: Poof = {
        id,
        x: d.rect.left + d.rect.width / 2,
        y: d.rect.top + d.rect.height / 2,
      };
      setPoofs((prev) => [...prev, poof]);
      window.setTimeout(
        () => setPoofs((prev) => prev.filter((p) => p.id !== id)),
        POOF_TTL_MS,
      );
    }
  };

  // A cancelled pointer (OS gesture, focus loss) just drops the drag — never a
  // discard, since the release point is unknown.
  const cancelDockDrag = () => {
    dockDragRef.current = null;
    setDockDrag(null);
  };

  return (
    <>
      {hud && (
        <div ref={dockRef} className={`powerup-dock dock-${side}`}>
          {[0, 1, 2].map((i) => {
            const defId = hud.heldAbilities[i];
            const active = defId ? hud.activeSlots.includes(i) : false;
            const icon = defId
              ? spriteDataUrl(assets.sprites, abilityDef(defId).icon)
              : undefined;

            // A running powerup: inert, counting down in place. No taps, no
            // drag — it holds the slot until it lapses.
            if (active) {
              return (
                <div
                  key={i}
                  className="powerup-slot active"
                  data-slot={i}
                  aria-label={`active-powerup-${i}`}
                >
                  {icon && (
                    <img src={icon} alt="" className="pixel-img powerup-icon" />
                  )}
                  <span className="active-powerup-sweep" />
                  <span className="active-powerup-secs" />
                </div>
              );
            }

            const dragging = dockDrag?.moved && dockDrag.index === i;
            return (
              <button
                key={i}
                type="button"
                className={`powerup-slot${defId ? " filled" : ""}${
                  dragging ? " dragging" : ""
                }`}
                aria-label={
                  defId ? `use-powerup-${i}` : `powerup-slot-${i}-empty`
                }
                disabled={!defId}
                onPointerDown={defId ? startDockDrag(i, defId) : undefined}
                onPointerMove={defId ? moveDockDrag : undefined}
                onPointerUp={defId ? endDockDrag : undefined}
                onPointerCancel={defId ? cancelDockDrag : undefined}
              >
                {icon && !dragging && (
                  <img src={icon} alt="" className="pixel-img powerup-icon" />
                )}
                {/* 1/2/3 fire the dock — but while the weapon stack is open
                    those keys select weapons, so the hints move over there. */}
                {keyHints && !weaponMenuOpen && (
                  <span className="slot-key">
                    <PixelText
                      font={font}
                      text={String(i + 1)}
                      scale={1}
                      color="#0b0d10"
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* The powerup being dragged out follows the pointer as a ghost, with a
          "DRAG OFF TO DISCARD" hint so the destructive gesture reads clearly. */}
      {dockDrag?.moved &&
        (() => {
          const icon = spriteDataUrl(
            assets.sprites,
            abilityDef(dockDrag.defId).icon,
          );
          return (
            <>
              <div
                className="powerup-drag-ghost"
                style={{ left: dockDrag.x, top: dockDrag.y }}
              >
                {icon && (
                  <img src={icon} alt="" className="pixel-img powerup-icon" />
                )}
              </div>
              <div className={`powerup-discard-hint dock-${side}`}>
                <PixelText
                  font={font}
                  text="DRAG OFF TO DISCARD"
                  scale={2}
                  color="#e06a6a"
                />
              </div>
            </>
          );
        })()}

      {/* Smoke poofs where discarded powerups vanished. */}
      {poofs.map((poof) => (
        <div
          key={poof.id}
          className="powerup-poof"
          style={{ left: poof.x, top: poof.y }}
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <span
              key={n}
              className="poof-puff"
              style={{ "--puff": n } as CSSProperties}
            />
          ))}
        </div>
      ))}
    </>
  );
}

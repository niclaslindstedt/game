// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The consumable dock: three (four for a caster) slots the same width as the
// powerup slots, sitting just ABOVE them in the same corner. The medkit slot
// shows the best quality the hero holds (quality-tinted ring + count); the
// stamina slot shows the potion count; the repair slot shows the repair-kit
// count. Tapping a slot (or its bindable key, C / X / V on desktop) spends
// one — the engine no-ops when there's nothing to spend or mend so a mistap
// never wastes a kit. The tap area runs well past the slot art (a padded hit
// region) so the small icons are still easy to hit on a phone.

import type { CSSProperties } from "react";

import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import {
  MANA_POTION_COLOR,
  MANA_POTION_ICON,
  medkitColorFor,
  medkitIconFor,
  REPAIR_KIT_COLOR,
  REPAIR_KIT_ICON,
  STAMINA_POTION_COLOR,
  STAMINA_POTION_ICON,
} from "../consumables.ts";
import { bindingLabel } from "../keybindings.ts";
import { getSettings } from "../settings.ts";
import type { Hud } from "./hud-model.ts";

export type ConsumableKind = "medkit" | "mana" | "stamina" | "repair";

export function ConsumableDock({
  hud,
  assets,
  font,
  keyHints,
  side,
  wide,
  onUse,
}: {
  hud: Hud;
  assets: GameAssets;
  font: PixelFont;
  /** Show the bindable key caps (desktop keyboard controls on). */
  keyHints: boolean;
  /** Which bottom corner the dock sits in (see GameScreen's dock layout). */
  side: "left" | "right";
  /** Landscape split: the consumables cross to the corner opposite the
   * powerups so the two rows don't pile up on one side of the field. */
  wide: boolean;
  /** Queue one use of the tapped consumable for the next sim tick. */
  onUse: (kind: ConsumableKind) => void;
}) {
  return (
    <div className={`consumable-dock dock-${side}${wide ? " split" : ""}`}>
      <button
        type="button"
        className={`consumable-slot${hud.medkitCount > 0 ? " filled" : ""}`}
        style={
          hud.medkitCount > 0
            ? ({
                "--slot-accent": medkitColorFor(hud.medkitTier),
              } as CSSProperties)
            : undefined
        }
        aria-label={hud.medkitCount > 0 ? "use-medkit" : "medkit-slot-empty"}
        data-consumable="medkit"
        disabled={hud.medkitCount === 0}
        onPointerDown={() => onUse("medkit")}
      >
        {hud.medkitCount > 0 && (
          <img
            src={
              spriteDataUrl(assets.sprites, medkitIconFor(hud.medkitTier)) ?? ""
            }
            alt=""
            className="pixel-img consumable-icon"
          />
        )}
        {hud.medkitCount > 0 && (
          <span className="consumable-count">
            <PixelText
              font={font}
              text={String(hud.medkitCount)}
              scale={2}
              color="#f4f4f4"
            />
          </span>
        )}
        {keyHints && (
          <span className="slot-key consumable-key">
            <PixelText
              font={font}
              text={bindingLabel(getSettings().keybindings.medkit)}
              scale={1}
              color="#0b0d10"
            />
          </span>
        )}
      </button>
      {/* The blue-gatorade mana slot — right of the medkit, shown only for
          a caster (an INT-sized pool) so a melee build's dock stays lean. */}
      {hud.isCaster && (
        <button
          type="button"
          className={`consumable-slot${hud.manaPotions > 0 ? " filled" : ""}`}
          style={
            hud.manaPotions > 0
              ? ({ "--slot-accent": MANA_POTION_COLOR } as CSSProperties)
              : undefined
          }
          aria-label={
            hud.manaPotions > 0 ? "use-mana-potion" : "mana-slot-empty"
          }
          data-consumable="mana"
          disabled={hud.manaPotions === 0}
          onPointerDown={() => onUse("mana")}
        >
          {hud.manaPotions > 0 && (
            <img
              src={spriteDataUrl(assets.sprites, MANA_POTION_ICON) ?? ""}
              alt=""
              className="pixel-img consumable-icon"
            />
          )}
          {hud.manaPotions > 0 && (
            <span className="consumable-count">
              <PixelText
                font={font}
                text={String(hud.manaPotions)}
                scale={2}
                color="#f4f4f4"
              />
            </span>
          )}
          {keyHints && (
            <span className="slot-key consumable-key">
              <PixelText
                font={font}
                text={bindingLabel(getSettings().keybindings.mana)}
                scale={1}
                color="#0b0d10"
              />
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        className={`consumable-slot${hud.staminaPotions > 0 ? " filled" : ""}`}
        style={
          hud.staminaPotions > 0
            ? ({ "--slot-accent": STAMINA_POTION_COLOR } as CSSProperties)
            : undefined
        }
        aria-label={
          hud.staminaPotions > 0 ? "use-stamina-potion" : "stamina-slot-empty"
        }
        data-consumable="stamina"
        disabled={hud.staminaPotions === 0}
        onPointerDown={() => onUse("stamina")}
      >
        {hud.staminaPotions > 0 && (
          <img
            src={spriteDataUrl(assets.sprites, STAMINA_POTION_ICON) ?? ""}
            alt=""
            className="pixel-img consumable-icon"
          />
        )}
        {hud.staminaPotions > 0 && (
          <span className="consumable-count">
            <PixelText
              font={font}
              text={String(hud.staminaPotions)}
              scale={2}
              color="#f4f4f4"
            />
          </span>
        )}
        {keyHints && (
          <span className="slot-key consumable-key">
            <PixelText
              font={font}
              text={bindingLabel(getSettings().keybindings.stamina)}
              scale={1}
              color="#0b0d10"
            />
          </span>
        )}
      </button>
      <button
        type="button"
        className={`consumable-slot${hud.repairKits > 0 ? " filled" : ""}`}
        style={
          hud.repairKits > 0
            ? ({ "--slot-accent": REPAIR_KIT_COLOR } as CSSProperties)
            : undefined
        }
        aria-label={hud.repairKits > 0 ? "use-repair-kit" : "repair-slot-empty"}
        data-consumable="repair"
        disabled={hud.repairKits === 0}
        onPointerDown={() => onUse("repair")}
      >
        {hud.repairKits > 0 && (
          <img
            src={spriteDataUrl(assets.sprites, REPAIR_KIT_ICON) ?? ""}
            alt=""
            className="pixel-img consumable-icon"
          />
        )}
        {hud.repairKits > 0 && (
          <span className="consumable-count">
            <PixelText
              font={font}
              text={String(hud.repairKits)}
              scale={2}
              color="#f4f4f4"
            />
          </span>
        )}
        {keyHints && (
          <span className="slot-key consumable-key">
            <PixelText
              font={font}
              text={bindingLabel(getSettings().keybindings.repair)}
              scale={1}
              color="#0b0d10"
            />
          </span>
        )}
      </button>
    </div>
  );
}

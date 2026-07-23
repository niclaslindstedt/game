// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The companion equip screen (Diablo-2 mercenary style): shown while the
// engine pauses in the `companion` phase after tapping a party portrait.
// The companion's three slots — weapon, helmet, chest; never legs or feet —
// sit above the HERO's own bag, so dressing the companion is a tap on a bag
// item (equippable pieces highlight; the swapped-out piece drops into the
// same cell). Tap a worn armor piece to take it back. The panel mutates the
// (paused) engine state through the companion API and calls `onChange` so
// React re-reads it.

import {
  COMPANION_SLOTS,
  companionById,
  companionDef,
  companionPowerRank,
  companionWeaponDamage,
  equipCompanionFromInventory,
  equipmentIcon,
  itemLevelReq,
  equipmentName,
  meetsLevelReq,
  unequipCompanionToInventory,
  weaponDef,
  type CompanionSlot,
  type Equipment,
  type GameState,
} from "@game/core";

import { clamp01 } from "@game/lib/vec.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { playUiSound } from "./sfx/index.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

const SLOT_LABELS: Record<CompanionSlot, string> = {
  weapon: "WEAPON",
  head: "HELMET",
  chest: "CHEST",
};

/** Can this bag piece go onto a companion at all? */
function fitsCompanion(item: Equipment): boolean {
  return (
    item.slot === "weapon" || item.slot === "head" || item.slot === "chest"
  );
}

function ItemIcon({ sprites, item }: { sprites: Sprites; item: Equipment }) {
  const src = spriteDataUrl(sprites, equipmentIcon(item.defId));
  if (!src) return null;
  return (
    <img
      src={src}
      alt={equipmentName(item)}
      className="pixel-img inv-item-icon"
      draggable={false}
    />
  );
}

export function CompanionPanel({
  state,
  font,
  sprites,
  onChange,
  onClose,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
  onChange: () => void;
  onClose: () => void;
}) {
  // The engine may already be back in `playing` for a frame while React's
  // hud snapshot still says `companion` (the render loop throttles it) — a
  // stale focus renders nothing and the next hud tick unmounts the panel.
  // Never mutate state from render.
  const companion =
    state.companionFocus !== null
      ? companionById(state, state.companionFocus)
      : undefined;
  if (!companion) return null;
  const def = companionDef(companion.defId);
  const portrait = spriteDataUrl(sprites, `${def.sprite}_0`);
  const downed = companion.downedMs !== undefined;
  // The XP bar toward the next level, clamped for a clean fill.
  const xpFrac =
    companion.xpToNext > 0
      ? clamp01(companion.xp / companion.xpToNext)
      : 0;
  const powerRank = def.power ? companionPowerRank(def, companion.level) : 0;

  return (
    <div className="game-overlay companion-overlay">
      <div className="inventory-panel companion-panel">
        {/* The companion's card: face, name, health, and its three slots. */}
        <div className="companion-head">
          <span className="companion-face">
            {portrait ? (
              <img src={portrait} alt="" className="pixel-img" />
            ) : null}
          </span>
          <div className="companion-title">
            <PixelText font={font} text={def.name} scale={3} color="#ffd75e" />
            {/* Level + the XP bar toward the next one — a companion trains by
                fighting and levels on its own (see companion-stats.ts). */}
            <PixelText
              font={font}
              text={`LEVEL ${companion.level}`}
              scale={2}
              color="#7ef0c8"
            />
            <span className="companion-xp-bar" aria-label="companion-xp">
              <span
                className="companion-xp-fill"
                style={{ width: `${Math.round(xpFrac * 100)}%` }}
              />
            </span>
            <PixelText
              font={font}
              text={
                downed
                  ? "DOWN - GETTING BACK UP"
                  : `HP ${Math.ceil(companion.hp)}/${companion.maxHp}`
              }
              scale={2}
              color={downed ? "#d83a3a" : "#9aa3ad"}
            />
            {/* The signature POWER and its current rank — the trick that grows
                as the companion levels (more pellets, chain arcs, a wider
                nova, deeper luck). Falls back to the plain aura/nova/damage
                line for a companion with no scaling power. */}
            {def.power ? (
              <PixelText
                font={font}
                text={`${def.power.name} - RANK ${powerRank}`}
                scale={2}
                color="#ffcf6b"
              />
            ) : def.aura?.magicFind ? (
              <PixelText
                font={font}
                text={`AURA: +${Math.round(def.aura.magicFind * 100)}% MAGIC FIND`}
                scale={2}
                color="#7ef0c8"
              />
            ) : def.nova ? (
              <PixelText
                font={font}
                text="FROST NOVA - CHILLS THE HORDE"
                scale={2}
                color="#78c8f5"
              />
            ) : (
              <PixelText
                font={font}
                text={`DMG ${Math.round(companionWeaponDamage(companion))} - ${weaponDef(companion.equipment.weapon.defId).name}`}
                scale={2}
                color="#9aa3ad"
              />
            )}
          </div>
        </div>

        <div className="equip-slots companion-slots">
          {COMPANION_SLOTS.map((slot) => {
            const item = companion.equipment[slot];
            const border = item ? TIER_COLORS[item.tier] : "#3a4048";
            return (
              <button
                key={slot}
                type="button"
                className={`inv-cell equip-cell companion-cell${
                  item ? tierGlowClass(item.tier) : ""
                }`}
                aria-label={`companion-slot-${slot}`}
                style={{ borderColor: border }}
                onClick={() => {
                  // Worn armor comes back to the bag; the weapon only swaps.
                  if (slot === "weapon" || !item) return;
                  if (unequipCompanionToInventory(state, companion.id, slot)) {
                    playUiSound(synth, "confirm");
                    onChange();
                  }
                }}
              >
                {item ? (
                  <ItemIcon sprites={sprites} item={item} />
                ) : (
                  <PixelText
                    font={font}
                    text={SLOT_LABELS[slot]}
                    scale={1}
                    color="#5a626c"
                  />
                )}
              </button>
            );
          })}
        </div>

        <PixelText
          font={font}
          text="TAP BAG GEAR TO EQUIP - WEAPON, HELMET, CHEST"
          scale={2}
          color="#9aa3ad"
        />

        {/* The HERO's bag below, Diablo-2 style: equippable pieces light up. */}
        <div className="inv-grid companion-bag">
          {state.player.inventory.map((item, index) => {
            const usable =
              item !== null &&
              fitsCompanion(item) &&
              meetsLevelReq(state, item);
            const lowLevel =
              item !== null &&
              fitsCompanion(item) &&
              !meetsLevelReq(state, item);
            return (
              <button
                key={index}
                type="button"
                className={`inv-cell companion-bag-cell${usable ? " usable" : ""}${
                  item ? tierGlowClass(item.tier) : ""
                }`}
                aria-label={`companion-bag-${index}`}
                style={
                  item && fitsCompanion(item)
                    ? { borderColor: TIER_COLORS[item.tier] }
                    : undefined
                }
                onClick={() => {
                  if (!item || !usable) return;
                  if (equipCompanionFromInventory(state, companion.id, index)) {
                    playUiSound(synth, "confirm");
                    onChange();
                  }
                }}
              >
                {item ? (
                  <span className={usable ? undefined : "companion-bag-dim"}>
                    <ItemIcon sprites={sprites} item={item} />
                  </span>
                ) : null}
                {lowLevel ? (
                  <span className="companion-bag-req">
                    <PixelText
                      font={font}
                      text={`L${itemLevelReq(item)}`}
                      scale={1}
                      color="#d83a3a"
                    />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="pixel-button"
          aria-label="close-companion"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={2} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}

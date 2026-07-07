// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Diablo-style inventory: equipment slots (drag an item onto its slot to
// equip, tap to quick-equip/unequip), the character sheet, the bag grid, and
// an item card for whatever is hovered or dragged. The two sections sit side
// by side in landscape and stack in portrait (see styles.css). The panel
// mutates the (paused) engine state through the inventory API and calls
// `onChange` so React re-reads it.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  computeMaxHp,
  effectiveStat,
  equipFromInventory,
  equipmentIcon,
  equipmentName,
  gearDef,
  moveInventoryItem,
  playerCritChance,
  previewEquipped,
  unequipToInventory,
  weaponCooldownFor,
  weaponDamage,
  weaponDamageFor,
  weaponDef,
  WEAPON_DEFS,
  type Affix,
  type EquipSlot,
  type Equipment,
  type GameState,
  type StatName,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { playUiSound } from "./sfx/index.ts";
import { TIER_COLORS } from "./tiers.ts";

type DragSource =
  { type: "inv"; index: number } | { type: "slot"; slot: EquipSlot };

type Drag = {
  item: Equipment;
  from: DragSource;
  x: number;
  y: number;
  moved: boolean;
};

const SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: "weapon", label: "WEAPON" },
  { slot: "suit", label: "SUIT" },
  { slot: "charm", label: "CHARM" },
];

const STAT_LABELS: Record<StatName, string> = {
  health: "HEALTH",
  strength: "STRENGTH",
  dexterity: "DEXTERITY",
  intelligence: "INTELLECT",
  speed: "SPEED",
  luck: "LUCK",
};

function affixLine(affix: Affix): string {
  switch (affix.kind) {
    case "damagePct":
      return `+${Math.round(affix.value * 100)}% DAMAGE`;
    case "maxHp":
      return `+${affix.value} MAX HP`;
    case "crit":
      return `+${Math.round(affix.value * 100)}% CRIT`;
    case "stat":
      return `+${affix.value} ${STAT_LABELS[affix.stat]}`;
  }
}

function itemLines(state: GameState, item: Equipment): string[] {
  const lines: string[] = [];
  if (item.defId in WEAPON_DEFS) {
    const def = weaponDef(item.defId);
    lines.push(`${def.class.toUpperCase()} WEAPON`);
    // Show the damage this weapon would deal in the player's hands (stats +
    // affixes folded in), with the bonus over the raw base as a "+x" hint.
    const effective = Math.round(weaponDamageFor(state, item));
    const bonus = effective - def.damage;
    lines.push(
      bonus > 0 ? `DAMAGE ${effective} (+${bonus})` : `DAMAGE ${effective}`,
    );
    // Fire rate the same way: the governing stat (DEX/INT/STR) quickens the
    // cadence, so show the effective shots/sec with the bonus over base.
    const effRate = 1000 / weaponCooldownFor(state, item);
    const rateBonus = effRate - 1000 / def.cooldownMs;
    lines.push(
      rateBonus > 0.05
        ? `SPEED ${effRate.toFixed(1)}/S (+${rateBonus.toFixed(1)})`
        : `SPEED ${effRate.toFixed(1)}/S`,
    );
    lines.push(`RANGE ${def.range}`);
    lines.push(
      item.durability === undefined
        ? "UNBREAKABLE"
        : `DURABILITY ${item.durability}/${def.durability}`,
    );
  } else {
    const def = gearDef(item.defId);
    lines.push(def.slot === "suit" ? "SUIT ARMOR" : "CHARM");
    if (def.bonuses.maxHp) lines.push(`+${def.bonuses.maxHp} MAX HP`);
    if (def.bonuses.critChance) {
      lines.push(`+${Math.round(def.bonuses.critChance * 100)}% CRIT`);
    }
  }
  return lines;
}

/** Positive = upgrade (green), negative = downgrade (red). */
const DELTA_UP = "#5fd97a";
const DELTA_DOWN = "#e06a6a";

/**
 * Format a stat delta for the "(+3)" upgrade hint. `unit: "%"` renders the
 * change in percentage points (crit); everything else is a whole number.
 * Returns null when the change rounds to nothing, so unaffected stats stay
 * clean.
 */
function deltaChip(
  delta: number,
  unit: "" | "%" = "",
): { text: string; color: string } | null {
  const rounded = unit === "%" ? Math.round(delta * 100) : Math.round(delta);
  if (rounded === 0) return null;
  const sign = rounded > 0 ? "+" : "";
  return {
    text: `${sign}${rounded}${unit}`,
    color: rounded > 0 ? DELTA_UP : DELTA_DOWN,
  };
}

/** One row of the character sheet: `LABEL VALUE` with an optional green/red
 * upgrade delta trailing it. */
function StatLine({
  font,
  label,
  value,
  chip,
  color,
}: {
  font: PixelFont;
  label: string;
  value: string;
  chip: { text: string; color: string } | null;
  color?: string;
}) {
  return (
    <div className="stat-row">
      <PixelText
        font={font}
        text={`${label} ${value}`}
        scale={1}
        color={color}
      />
      {chip && (
        <PixelText
          font={font}
          text={`(${chip.text})`}
          scale={1}
          color={chip.color}
        />
      )}
    </div>
  );
}

function ItemIcon({
  sprites,
  item,
  size = 36,
}: {
  sprites: Sprites;
  item: Equipment;
  size?: number;
}) {
  const src = spriteDataUrl(sprites, equipmentIcon(item.defId));
  if (!src) return null;
  return (
    <img
      src={src}
      alt={equipmentName(item)}
      width={size}
      height={size}
      className="pixel-img"
      draggable={false}
    />
  );
}

export function InventoryPanel({
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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [inspected, setInspected] = useState<Equipment | null>(null);
  // Written only from event handlers (start/move/up), never during render:
  // the up-handler needs the freshest drag without re-subscribing per move.
  const dragRef = useRef<Drag | null>(null);
  const dragActive = drag !== null;

  // While dragging, follow the pointer globally and resolve the drop target
  // under the release point (works for touch and mouse alike).
  useEffect(() => {
    if (!dragActive) return;

    const applyDrop = (d: Drag, target: string | null) => {
      if (target) {
        const [kind, arg] = target.split(":");
        if (d.from.type === "inv" && kind === "inv") {
          moveInventoryItem(state, d.from.index, Number(arg));
        } else if (d.from.type === "inv" && kind === "slot") {
          if (d.item.slot === arg && equipFromInventory(state, d.from.index)) {
            playUiSound(synth, "equip");
          }
        } else if (d.from.type === "slot" && kind === "inv") {
          if (unequipToInventory(state, d.from.slot)) {
            const landed = state.player.inventory.findIndex(
              (i) => i?.id === d.item.id,
            );
            const wanted = Number(arg);
            if (landed >= 0 && state.player.inventory[wanted] === null) {
              moveInventoryItem(state, landed, wanted);
            }
          }
        }
      }
    };

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = {
        ...d,
        x: e.clientX,
        y: e.clientY,
        moved: d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8,
      };
      setDrag(dragRef.current);
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved) {
        // A tap: quick-equip from the bag, quick-unequip from a slot.
        const swapped =
          d.from.type === "inv"
            ? equipFromInventory(state, d.from.index)
            : unequipToInventory(state, d.from.slot);
        if (swapped) playUiSound(synth, "equip");
      } else {
        const el = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-drop]");
        applyDrop(d, el?.getAttribute("data-drop") ?? null);
      }
      dragRef.current = null;
      setDrag(null);
      onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragActive, state, onChange]);

  const startDrag =
    (item: Equipment, from: DragSource) => (e: ReactPointerEvent) => {
      e.preventDefault();
      setInspected(item);
      dragRef.current = {
        item,
        from,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      setDrag(dragRef.current);
    };

  const player = state.player;
  const shown = inspected;
  // Holding/hovering an item previews it in the character sheet: the stat
  // getters read a throwaway loadout with `shown` slotted in, and the
  // per-line difference from the live loadout drives the green/red upgrade
  // hints. Inspecting the piece already worn shows no deltas (it equals
  // itself).
  const preview = shown ? previewEquipped(state, shown) : null;

  return (
    <div className="game-overlay inventory-overlay">
      <div className="inventory-panel">
        <div className="inventory-columns">
          {/* Equipment slots + character sheet */}
          <div className="inventory-left">
            <PixelText font={font} text="EQUIPPED" scale={2} color="#9aa3ad" />
            <div className="equip-slots">
              {SLOTS.map(({ slot, label }) => {
                const item =
                  slot === "weapon"
                    ? player.equipment.weapon
                    : player.equipment[slot];
                return (
                  <div key={slot} className="equip-col">
                    <PixelText
                      font={font}
                      text={label}
                      scale={1}
                      color="#9aa3ad"
                    />
                    <div
                      className={`inv-cell equip-cell${
                        drag && drag.item.slot === slot ? " drop-ok" : ""
                      }`}
                      data-drop={`slot:${slot}`}
                      style={
                        item
                          ? { borderColor: TIER_COLORS[item.tier] }
                          : undefined
                      }
                      onPointerDown={
                        item
                          ? startDrag(item, { type: "slot", slot })
                          : undefined
                      }
                      onPointerEnter={() => item && setInspected(item)}
                    >
                      {item &&
                        !(
                          drag?.from.type === "slot" && drag.from.slot === slot
                        ) && <ItemIcon sprites={sprites} item={item} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="char-sheet">
              <PixelText font={font} text="STATS" scale={2} color="#9aa3ad" />
              {(Object.keys(STAT_LABELS) as StatName[]).map((stat) => (
                <StatLine
                  key={stat}
                  font={font}
                  label={STAT_LABELS[stat]}
                  value={String(effectiveStat(state, stat))}
                  chip={
                    preview
                      ? deltaChip(
                          effectiveStat(preview, stat) -
                            effectiveStat(state, stat),
                        )
                      : null
                  }
                />
              ))}
              <StatLine
                font={font}
                label="MAX HP"
                value={String(computeMaxHp(state))}
                chip={
                  preview
                    ? deltaChip(computeMaxHp(preview) - computeMaxHp(state))
                    : null
                }
              />
              <StatLine
                font={font}
                label="DMG"
                value={String(Math.round(weaponDamage(state)))}
                color="#7ef0c8"
                chip={
                  preview
                    ? deltaChip(weaponDamage(preview) - weaponDamage(state))
                    : null
                }
              />
              <StatLine
                font={font}
                label="CRIT"
                value={`${Math.round(playerCritChance(state) * 100)}%`}
                color="#7ef0c8"
                chip={
                  preview
                    ? deltaChip(
                        playerCritChance(preview) - playerCritChance(state),
                        "%",
                      )
                    : null
                }
              />
            </div>
          </div>

          {/* The bag */}
          <div className="inventory-right">
            <PixelText font={font} text="BAG" scale={2} color="#9aa3ad" />
            <div className="inv-grid">
              {player.inventory.map((item, index) => (
                <div
                  key={index}
                  className="inv-cell"
                  data-drop={`inv:${index}`}
                  style={
                    item ? { borderColor: TIER_COLORS[item.tier] } : undefined
                  }
                  onPointerDown={
                    item ? startDrag(item, { type: "inv", index }) : undefined
                  }
                  onPointerEnter={() => item && setInspected(item)}
                >
                  {item &&
                    !(
                      drag?.from.type === "inv" && drag.from.index === index
                    ) && <ItemIcon sprites={sprites} item={item} />}
                </div>
              ))}
            </div>

            {/* Item card */}
            <div className="item-card">
              {shown ? (
                <>
                  <PixelText
                    font={font}
                    text={equipmentName(shown)}
                    scale={2}
                    color={TIER_COLORS[shown.tier]}
                  />
                  {itemLines(state, shown).map((line) => (
                    <PixelText key={line} font={font} text={line} scale={1} />
                  ))}
                  {shown.affixes.map((affix, i) => (
                    <PixelText
                      key={i}
                      font={font}
                      text={affixLine(affix)}
                      scale={1}
                      color={TIER_COLORS[shown.tier]}
                    />
                  ))}
                </>
              ) : (
                <PixelText
                  font={font}
                  text="DRAG TO EQUIP - TAP TO QUICK-EQUIP"
                  scale={1}
                  color="#9aa3ad"
                />
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="pixel-button"
          aria-label="close-inventory"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={2} color="#0b0d10" />
        </button>
      </div>

      {/* Drag ghost following the pointer */}
      {drag && drag.moved && (
        <div
          className="drag-ghost"
          style={{ left: drag.x - 18, top: drag.y - 18 }}
        >
          <ItemIcon sprites={sprites} item={drag.item} />
        </div>
      )}
    </div>
  );
}

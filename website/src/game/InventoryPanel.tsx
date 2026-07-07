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
  discardFromInventory,
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
  weaponRangeFor,
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
import { AFFIX_COLORS, TIER_COLORS, WEAPON_CLASS_COLORS } from "./tiers.ts";

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

/** A stat line in the item card: text with an optional accent color (the
 * default white reads as a plain fact; a color flags a class or a bonus). */
type CardLine = { text: string; color?: string };

function itemLines(state: GameState, item: Equipment): CardLine[] {
  const lines: CardLine[] = [];
  if (item.defId in WEAPON_DEFS) {
    const def = weaponDef(item.defId);
    // The weapon's class, tinted by class (magic=purple, melee=gold,
    // ranged=orange) so it reads as "what kind of weapon" — never confused
    // with the blue MAGIC quality tier the name color carries.
    lines.push({
      text: `${def.class.toUpperCase()} WEAPON`,
      color: WEAPON_CLASS_COLORS[def.class].border,
    });
    // Show the damage this weapon would deal in the player's hands (stats +
    // affixes folded in), with the bonus over the raw base as a "+x" hint.
    const effective = Math.round(weaponDamageFor(state, item));
    const bonus = effective - def.damage;
    lines.push({
      text:
        bonus > 0 ? `DAMAGE ${effective} (+${bonus})` : `DAMAGE ${effective}`,
    });
    // Attack speed as plain seconds between attacks (lower is faster). The
    // unit is spelled " SEC" — never a bare trailing "S", which the pixel font
    // renders close enough to a "5" to read as part of the number. The speed
    // stat (DEX for melee & ranged, INT for magic) quickens the cadence, so
    // show the base-relative time shaved off as a "-X" hint.
    const secs = weaponCooldownFor(state, item) / 1000;
    const saved = def.cooldownMs / 1000 - secs;
    lines.push({
      text:
        saved > 0.005
          ? `SPEED ${secs.toFixed(2)} SEC (-${saved.toFixed(2)})`
          : `SPEED ${secs.toFixed(2)} SEC`,
    });
    // Reach the same way: INTELLIGENCE lengthens every weapon's range.
    const effRange = Math.round(weaponRangeFor(state, item));
    const rangeBonus = effRange - def.range;
    lines.push({
      text:
        rangeBonus > 0
          ? `RANGE ${effRange} (+${rangeBonus})`
          : `RANGE ${effRange}`,
    });
    lines.push(
      item.durability === undefined
        ? { text: "UNBREAKABLE" }
        : {
            text: `DURABILITY ${item.durability}/${def.durability}`,
            // A near-broken weapon warns in red.
            color:
              item.durability <= def.durability * 0.25 ? "#e06a6a" : undefined,
          },
    );
  } else {
    const def = gearDef(item.defId);
    lines.push({ text: def.slot === "suit" ? "SUIT ARMOR" : "CHARM" });
    if (def.bonuses.maxHp) {
      lines.push({
        text: `+${def.bonuses.maxHp} MAX HP`,
        color: AFFIX_COLORS.maxHp,
      });
    }
    if (def.bonuses.critChance) {
      lines.push({
        text: `+${Math.round(def.bonuses.critChance * 100)}% CRIT`,
        color: AFFIX_COLORS.crit,
      });
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
        if (kind === "ground") {
          // Dropped clear of the bag and slots: destroy a carried item. Only
          // bag pieces can be trashed this way (the equipped weapon is never
          // parked in the bag, and unequipping is the safe way off a slot).
          if (
            d.from.type === "inv" &&
            discardFromInventory(state, d.from.index)
          ) {
            playUiSound(synth, "back");
          }
        } else if (d.from.type === "inv" && kind === "inv") {
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

  // The backdrop is the "ground": releasing a bag item over it destroys the
  // item. The panel itself absorbs drops (data-drop="none") so a miss between
  // cells — or onto the stats/item card — is a harmless no-op, never a
  // discard; only a release out beyond the panel trashes the piece.
  return (
    <div className="game-overlay inventory-overlay" data-drop="ground">
      <div className="inventory-panel" data-drop="none">
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
                  <div className="item-card-header">
                    <ItemIcon sprites={sprites} item={shown} size={40} />
                    <PixelText
                      font={font}
                      text={equipmentName(shown)}
                      scale={2}
                      color={TIER_COLORS[shown.tier]}
                    />
                  </div>
                  {itemLines(state, shown).map((line) => (
                    <PixelText
                      key={line.text}
                      font={font}
                      text={line.text}
                      scale={1}
                      color={line.color}
                    />
                  ))}
                  {shown.affixes.map((affix, i) => (
                    <PixelText
                      key={i}
                      font={font}
                      text={affixLine(affix)}
                      scale={1}
                      color={AFFIX_COLORS[affix.kind]}
                    />
                  ))}
                </>
              ) : (
                <PixelText
                  font={font}
                  text="DRAG TO EQUIP - DROP OUTSIDE TO DESTROY"
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

      {/* Discard warning: only a bag item dragged clear of the panel is at
          risk, so only then does the "destroy" prompt appear. */}
      {drag && drag.moved && drag.from.type === "inv" && (
        <div className="discard-hint">
          <PixelText
            font={font}
            text="DROP OUTSIDE THE BAG TO DESTROY"
            scale={1}
            color="#e06a6a"
          />
        </div>
      )}

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

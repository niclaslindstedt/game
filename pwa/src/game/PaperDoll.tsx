// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The inventory's PAPER DOLL — Diablo 2's character panel: the equipment slots
// laid out in the shape of a body instead of strung along a row. The layout is
// a named-area grid (see `.paper-doll` in styles.css) and the areas ARE the
// anatomy: the weapon hangs down the left the way D2's weapon does, the OFF
// HAND balances it on the right where D2 puts the shield, the head/chest/legs/feet
// run down the middle, and the two narrow gutter columns carry the accessories
// — beside the collar for the amulet, at the hips for the rings.
//
// Two rules the row-of-cells version had no room for:
//
//   • A SLOT'S SIZE IS PART OF ITS MEANING. A ring is not a breastplate, so it
//     does not get a breastplate's frame: the weapon and the off hand are long 2x5
//     bays, the body plates 2x2, and the neck and fingers a single unit. Every
//     frame is measured in ONE unit (`--slot-u`) so the whole doll rescales
//     with a single number per breakpoint, and the item icon inside scales with
//     its frame (`--doll-icon`) — which is what makes a big slot read as more
//     than a big empty box around a small sprite.
//
//   • AN EMPTY SLOT SAYS WHAT IT WANTS. Each empty frame ghosts its own
//     `icon_slot_*` glyph, desaturated and dimmed to a hint — never a picture
//     competing with the loot — so the doll reads without the column of labels
//     the old strip needed.

import type { PointerEvent as ReactPointerEvent } from "react";

import {
  fitsEquipSlot,
  isArmorBroken,
  type EquipSlot,
  type Equipment,
  type GameState,
} from "@game/core";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { ItemIcon } from "./ItemCard.tsx";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

/**
 * The doll's slots, each pinned to its `grid-area` in `.paper-doll`. `glyph` is
 * the ghost drawn while the frame is empty; `icon` is how much of a unit the
 * worn piece's sprite fills, so a single-unit ring frame doesn't try to draw a
 * weapon-sized icon.
 */
const DOLL_SLOTS: {
  slot: EquipSlot;
  area: string;
  label: string;
  glyph: string;
  icon: number;
}[] = [
  {
    slot: "weapon",
    area: "wpn",
    label: "WEAPON",
    glyph: "icon_slot_weapon",
    icon: 1.75,
  },
  {
    slot: "head",
    area: "head",
    label: "HEAD",
    glyph: "icon_slot_head",
    icon: 1.5,
  },
  {
    slot: "amulet",
    area: "neck",
    label: "NECK",
    glyph: "icon_slot_amulet",
    icon: 0.78,
  },
  {
    slot: "chest",
    area: "chst",
    label: "CHEST",
    glyph: "icon_slot_chest",
    icon: 1.5,
  },
  {
    // The SECOND ARM. D2 puts the shield here and so does this doll — the
    // glyph is a shield rather than a pouch because a shield is what the frame
    // is SHAPED like, and a bag is the other thing that fits in it.
    slot: "offhand",
    area: "bag",
    label: "OFF HAND",
    glyph: "icon_slot_offhand",
    icon: 1.75,
  },
  // Both fingers are labelled RING — they are interchangeable, so numbering
  // them would imply an order the rules don't have.
  {
    slot: "ring1",
    area: "rng1",
    label: "RING",
    glyph: "icon_slot_ring",
    icon: 0.78,
  },
  {
    slot: "legs",
    area: "legs",
    label: "LEGS",
    glyph: "icon_slot_legs",
    icon: 1.5,
  },
  {
    slot: "ring2",
    area: "rng2",
    label: "RING",
    glyph: "icon_slot_ring",
    icon: 0.78,
  },
  {
    slot: "feet",
    area: "feet",
    label: "FEET",
    glyph: "icon_slot_feet",
    icon: 1.5,
  },
];

export function PaperDoll({
  state,
  sprites,
  /** The piece under the finger, so a compatible frame can light up and the
   * frame a drag STARTED from can go empty while the ghost carries it. */
  dragItem,
  dragFromSlot,
  onSlotDown,
  onSlotEnter,
  onSlotLeave,
}: {
  state: GameState;
  sprites: Sprites;
  dragItem: Equipment | null;
  dragFromSlot: EquipSlot | null;
  onSlotDown: (
    item: Equipment,
    slot: EquipSlot,
  ) => (e: ReactPointerEvent) => void;
  onSlotEnter: (item: Equipment) => (e: ReactPointerEvent) => void;
  onSlotLeave: (e: ReactPointerEvent) => void;
}) {
  const equipment = state.players[0].equipment;

  return (
    <div className="paper-doll">
      {DOLL_SLOTS.map(({ slot, area, label, glyph, icon }) => {
        const item = equipment[slot];
        const ghost = spriteDataUrl(sprites, glyph);
        return (
          <div
            key={slot}
            className={`inv-cell doll-slot${
              dragItem && fitsEquipSlot(dragItem.slot, slot) ? " drop-ok" : ""
            }${item && isArmorBroken(item) ? " broken" : ""}${
              item ? tierGlowClass(item.tier) : ""
            }`}
            style={{
              gridArea: area,
              borderColor: item ? TIER_COLORS[item.tier] : undefined,
              // The worn sprite scales with the frame — a long weapon bay draws
              // its blade big, a one-unit finger draws its band small.
              ["--doll-icon" as string]: `calc(var(--slot-u) * ${icon})`,
            }}
            data-drop={`slot:${slot}`}
            aria-label={label}
            onPointerDown={item ? onSlotDown(item, slot) : undefined}
            onPointerEnter={item ? onSlotEnter(item) : undefined}
            onPointerLeave={onSlotLeave}
          >
            {item && dragFromSlot !== slot ? (
              <ItemIcon sprites={sprites} item={item} />
            ) : (
              ghost && (
                <img
                  src={ghost}
                  alt=""
                  className="pixel-img doll-ghost"
                  draggable={false}
                />
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

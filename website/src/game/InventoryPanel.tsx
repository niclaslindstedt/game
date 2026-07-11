// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Diablo-style inventory: a character portrait + equipment slots (drag an
// item onto its slot to equip; on desktop a plain click quick-equips), the
// character sheet, and a compact bag grid. Hovering (desktop) or tapping
// (touch) an item raises a WoW-style tooltip next to it instead of a fixed
// item card. The two sections sit side by side in landscape and stack in
// portrait (see styles.css). The panel mutates the (paused) engine state
// through the inventory API and calls `onChange` so React re-reads it.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  armorReduction,
  autoEquipBest,
  autoEquipUpgradeCount,
  currentMobLevel,
  computeMaxHp,
  discardEquipped,
  discardFromInventory,
  effectiveStat,
  equipFromInventory,
  isArmorBroken,
  isScrappableLoot,
  scrapInferiorLoot,
  moveInventoryItem,
  playerAppearance,
  playerCritChance,
  playerDodgeChance,
  previewEquipped,
  totalArmor,
  unequipToInventory,
  weaponDamage,
  wouldUpgradeSlot,
  type EquipSlot,
  type Equipment,
  type GameState,
  type StatName,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { playEquipHaptic } from "./haptics.ts";
import {
  DELTA_DOWN,
  DELTA_UP,
  hitRate,
  ItemCardBody,
  ItemIcon,
  STAT_LABELS,
} from "./ItemCard.tsx";
import { dollDataUrl, playerDollLayers } from "./paper-doll.ts";
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
  // Whether this item's tooltip was already up when the press began. On touch
  // (no hover) that means the FIRST tap raised the tooltip and this is the
  // SECOND tap on the same item — the signal to commit the equip.
  wasInspected: boolean;
};

const SLOTS: { slot: EquipSlot; label: string }[] = [
  { slot: "weapon", label: "WEAPON" },
  { slot: "head", label: "HEAD" },
  { slot: "chest", label: "CHEST" },
  { slot: "legs", label: "LEGS" },
  { slot: "feet", label: "FEET" },
  { slot: "charm", label: "CHARM" },
  { slot: "bag", label: "BAG" },
];

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

/**
 * Wrap width for the tooltip's text, in rem: the `.item-tooltip` box caps at
 * 16rem, less its 0.7rem side padding and 2px borders — so the longest,
 * affix-built weapon name folds onto extra lines instead of spilling off the
 * card's edge. Keep in step with `.item-tooltip` in styles.css.
 */
const TOOLTIP_TEXT_REM = 14.3;

const clampNum = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(v, hi));

/**
 * WoW-style item tooltip: name (in tier color) plus the stat/affix lines,
 * floated next to the item that raised it. Portaled to <body> and positioned
 * in viewport coordinates from the anchoring cell's rect. The card NEVER
 * covers the cell that raised it — the icon must stay visible so the second
 * touch tap that commits the equip lands on something the player can see —
 * so it sits to the right, flips left, and on narrow screens drops below or
 * above the cell instead of clamping over it.
 *
 * Inspecting a bag piece whose slot already wears something ALSO raises the
 * worn piece's card, anchored over its own equip slot (covering THAT icon is
 * fine — the card repeats the icon in its header) and dodging the main card;
 * it carries an EQUIPPED kicker so the two cards can't be confused. Hidden on
 * the first paint until measured, to avoid a positioned flash. The card
 * CONTENT (name, stat lines, affixes) renders through the shared
 * `ItemCardBody`, so the tooltip and the arsenal viewer never drift.
 */
function ItemTooltip({
  font,
  state,
  sprites,
  item,
  anchor,
}: {
  font: PixelFont;
  state: GameState;
  sprites: Sprites;
  item: Equipment;
  anchor: DOMRect;
}) {
  const mainRef = useRef<HTMLDivElement>(null);
  const wornRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    main: { left: number; top: number };
    worn: { left: number; top: number } | null;
  } | null>(null);
  // The piece worn in this item's slot, for the side-by-side comparison —
  // unless we're inspecting that very piece (an item never compares to
  // itself; its own card says EQUIPPED instead).
  const equipped = state.player.equipment[item.slot];
  const isWorn = equipped?.id === item.id;
  const compareTo = equipped && !isWorn ? equipped : null;

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const gap = 10;
    const margin = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Beside the cell — right, else left — never over it.
    let left: number;
    let top: number;
    if (anchor.right + gap + w <= vw - margin) {
      left = anchor.right + gap;
      top = clampNum(anchor.top, margin, vh - margin - h);
    } else if (anchor.left - gap - w >= margin) {
      left = anchor.left - gap - w;
      top = clampNum(anchor.top, margin, vh - margin - h);
    } else {
      // No side room (narrow portrait): below the cell, else above.
      left = clampNum(anchor.left, margin, vw - margin - w);
      top =
        anchor.bottom + gap + h <= vh - margin
          ? anchor.bottom + gap
          : Math.max(margin, anchor.top - gap - h);
    }
    const main = { left, top };

    // The worn piece's card: over its own equip slot when that doesn't
    // collide with the main card, else hugging the main card's free side.
    // No collision-free spot (tiny viewports) hides it — the main card's
    // (+N) deltas still carry the comparison.
    let worn: { left: number; top: number } | null = null;
    const wornEl = wornRef.current;
    if (wornEl) {
      const slotRect = document
        .querySelector(`[data-drop="slot:${item.slot}"]`)
        ?.getBoundingClientRect();
      const w2 = wornEl.offsetWidth;
      const h2 = wornEl.offsetHeight;
      // Colliding with the main card is a bad spot; so is covering the
      // inspected cell — the worn card obeys the same "the icon that raised
      // the tooltip stays visible" rule as the main card.
      const collides = (p: { left: number; top: number }) =>
        (p.left < main.left + w &&
          p.left + w2 > main.left &&
          p.top < main.top + h &&
          p.top + h2 > main.top) ||
        (p.left < anchor.right &&
          p.left + w2 > anchor.left &&
          p.top < anchor.bottom &&
          p.top + h2 > anchor.top);
      const candidates: { left: number; top: number }[] = [];
      if (slotRect) {
        candidates.push({
          left: clampNum(slotRect.left, margin, vw - margin - w2),
          top: clampNum(slotRect.top, margin, vh - margin - h2),
        });
      }
      candidates.push(
        {
          left: main.left - gap - w2,
          top: clampNum(main.top, margin, vh - margin - h2),
        },
        {
          left: main.left + w + gap,
          top: clampNum(main.top, margin, vh - margin - h2),
        },
        {
          left: clampNum(main.left, margin, vw - margin - w2),
          top: main.top - gap - h2,
        },
        {
          left: clampNum(main.left, margin, vw - margin - w2),
          top: main.top + h + gap,
        },
      );
      worn =
        candidates.find(
          (p) =>
            p.left >= margin &&
            p.left + w2 <= vw - margin &&
            p.top >= margin &&
            p.top + h2 <= vh - margin &&
            !collides(p),
        ) ?? null;
    }
    setPos({ main, worn });
  }, [anchor, item, compareTo]);

  return createPortal(
    <>
      <div
        ref={mainRef}
        className="item-tooltip"
        style={{
          left: pos?.main.left ?? anchor.right + 10,
          top: pos?.main.top ?? anchor.top,
          borderColor: TIER_COLORS[item.tier],
          visibility: pos ? "visible" : "hidden",
        }}
      >
        <ItemCardBody
          font={font}
          state={state}
          item={item}
          compareTo={compareTo}
          maxWidth={TOOLTIP_TEXT_REM}
          lineScale={2}
          subtitle={isWorn ? "EQUIPPED" : undefined}
          icon={isWorn ? <ItemIcon sprites={sprites} item={item} /> : undefined}
        />
      </div>
      {compareTo && (
        <div
          ref={wornRef}
          className="item-tooltip"
          style={{
            left: pos?.worn?.left ?? 0,
            top: pos?.worn?.top ?? 0,
            borderColor: TIER_COLORS[compareTo.tier],
            visibility: pos?.worn ? "visible" : "hidden",
          }}
        >
          <ItemCardBody
            font={font}
            state={state}
            item={compareTo}
            compareTo={null}
            maxWidth={TOOLTIP_TEXT_REM}
            lineScale={2}
            subtitle="EQUIPPED"
            icon={<ItemIcon sprites={sprites} item={compareTo} />}
          />
        </div>
      )}
    </>,
    document.body,
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
  // The item whose WoW-style tooltip is raised, plus the cell rect the tooltip
  // anchors to. Raised by hover (desktop) or tap (touch); also tracks the
  // dragged item so the character sheet previews it mid-drag.
  const [inspect, setInspect] = useState<{
    item: Equipment;
    anchor: DOMRect;
  } | null>(null);
  // The character sheet is tucked behind the portrait now — hovering it
  // (desktop) or tapping it (touch) raises the STATS popover, so the modal can
  // give the bag the room. Kept out of the way until asked for.
  const [statsOpen, setStatsOpen] = useState(false);
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
          // Dropped clear of the bag and slots: destroy the dragged piece.
          // A bag item is trashed from its cell; an equipped suit or charm is
          // stripped straight off the body (the weapon slot is never emptied,
          // so a held weapon can't be trashed this way).
          const trashed =
            d.from.type === "inv"
              ? discardFromInventory(state, d.from.index)
              : discardEquipped(state, d.from.slot);
          if (trashed) {
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
        // A plain click/tap: quick-equip from the bag, quick-unequip from a
        // slot. Desktop equips on a single click (the item is already shown on
        // hover). Touch has no hover, so the first tap only raises the tooltip
        // and a SECOND tap on the same item — already inspected — commits it;
        // that lands the equip in two taps instead of forcing a drag.
        const commit = e.pointerType !== "touch" || d.wasInspected;
        if (commit) {
          const swapped =
            d.from.type === "inv"
              ? equipFromInventory(state, d.from.index)
              : unequipToInventory(state, d.from.slot);
          if (swapped) {
            playUiSound(synth, "equip");
            playEquipHaptic();
            setInspect(null);
          }
        }
      } else {
        const el = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-drop]");
        applyDrop(d, el?.getAttribute("data-drop") ?? null);
        setInspect(null);
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

  // Raise (or update) the item tooltip, anchored to the cell under the pointer.
  const inspectItem = (item: Equipment) => (e: ReactPointerEvent) =>
    setInspect({ item, anchor: e.currentTarget.getBoundingClientRect() });

  const startDrag =
    (item: Equipment, from: DragSource) => (e: ReactPointerEvent) => {
      e.preventDefault();
      // Captured BEFORE we overwrite the tooltip below: was this same item
      // already inspected? On touch that marks the second tap (commit); on
      // desktop it's moot since a click equips regardless.
      const wasInspected = inspect?.item.id === item.id;
      setInspect({ item, anchor: e.currentTarget.getBoundingClientRect() });
      dragRef.current = {
        item,
        from,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        wasInspected,
      };
      setDrag(dragRef.current);
    };

  const player = state.player;
  // How many bag pieces the SCRAP sweep would clear right now — loot the hero
  // has outgrown (worse than what's worn, and not a trinket/trophy the engine
  // spares). Drives the button's count and its disabled state so it never
  // destroys anything when there's nothing junk to cull.
  const scrapCount = player.inventory.filter(
    (item): item is Equipment => item !== null && isScrappableLoot(state, item),
  ).length;
  // How many slots AUTO-EQUIP would improve right now — drives the button's
  // count and its disabled state so it never runs on an already-optimal
  // loadout (the sweep folds the hero's build into the weapon pick, so a melee
  // hero lands a melee weapon and a mage a wand).
  const autoCount = autoEquipUpgradeCount(state);
  const shown = inspect?.item ?? null;
  // Holding/hovering an item previews it in the character sheet: the stat
  // getters read a throwaway loadout with `shown` slotted in, and the
  // per-line difference from the live loadout drives the green/red upgrade
  // hints. Inspecting the piece already worn shows no deltas (it equals
  // itself).
  const preview = shown ? previewEquipped(state, shown) : null;
  // The dressed paper-doll: worn armor + held weapon over the body sprite,
  // matching the character on the field (and re-composed as pieces move
  // between the bag and the body — this component re-renders per equip).
  const avatarSrc =
    dollDataUrl(sprites, playerDollLayers(state, "0")) ??
    spriteDataUrl(sprites, `${playerAppearance(state)}_0`);

  // The backdrop is the "ground": releasing a bag item over it destroys the
  // item. The panel itself absorbs drops (data-drop="none") so a miss between
  // cells — or onto the stats/item card — is a harmless no-op, never a
  // discard; only a release out beyond the panel trashes the piece.
  return (
    <div
      className="game-overlay inventory-overlay"
      data-drop="ground"
      // Tapping empty space (outside any item cell) dismisses the tooltip —
      // the touch equivalent of moving the mouse off an item — and a tap clear
      // of the portrait/popover closes the stat sheet.
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest(".inv-cell")) setInspect(null);
        if (!target.closest(".inv-hero")) setStatsOpen(false);
      }}
    >
      <div className="inventory-panel" data-drop="none">
        {/* Top bar: the hero portrait (hover on desktop / tap on touch raises
            the full stat sheet) beside the four equipment slots. The character
            sheet lives in a popover now, so the bag below owns the modal. */}
        <div className="inv-topbar">
          <div
            className="inv-hero"
            // Hover anywhere over the portrait OR its popover keeps the sheet
            // up (the popover is a child, so crossing into it isn't a leave).
            onPointerEnter={(e) => {
              if (e.pointerType !== "touch") setStatsOpen(true);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== "touch") setStatsOpen(false);
            }}
          >
            <button
              type="button"
              className={`char-portrait${statsOpen ? " active" : ""}`}
              aria-label="toggle-stats"
              // Touch has no hover, so a tap toggles the sheet; a mouse leaves
              // it to the wrapper's hover (a click here would just fight it).
              onPointerDown={(e) => {
                if (e.pointerType === "touch") setStatsOpen((v) => !v);
              }}
            >
              {avatarSrc && (
                <img
                  src={avatarSrc}
                  alt="character"
                  className="pixel-img char-avatar-img"
                  draggable={false}
                />
              )}
            </button>
            <PixelText font={font} text="STATS" scale={2} color="#7a828b" />
            {statsOpen && (
              <div className="char-stats-popover pixel-panel">
                <div className="char-sheet">
                  <PixelText
                    font={font}
                    text="STATS"
                    scale={2}
                    color="#9aa3ad"
                  />
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
                  {(() => {
                    // Total worn armor and what it turns of the CURRENT
                    // horde's blows — the same number the damage math reads,
                    // so the panel decays as the mobs outlevel the wardrobe.
                    const worn = totalArmor(state);
                    const reduction = armorReduction(
                      state,
                      currentMobLevel(state),
                    );
                    const previewWorn = preview ? totalArmor(preview) : worn;
                    return (
                      <StatLine
                        font={font}
                        label="ARMOR"
                        value={`${worn} (-${Math.round(reduction * 100)}%)`}
                        color={worn > 0 ? "#9ab3c9" : "#9aa3ad"}
                        chip={preview ? deltaChip(previewWorn - worn) : null}
                      />
                    );
                  })()}
                  <StatLine
                    font={font}
                    label="DMG"
                    value={formatCompact(Math.round(weaponDamage(state)))}
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
                  <StatLine
                    font={font}
                    label="HIT"
                    value={`${Math.round(hitRate(state) * 100)}%`}
                    color="#7ef0c8"
                    chip={
                      preview
                        ? deltaChip(hitRate(preview) - hitRate(state), "%")
                        : null
                    }
                  />
                  <StatLine
                    font={font}
                    label="DODGE"
                    value={`${Math.round(playerDodgeChance(state) * 100)}%`}
                    color="#7ecbff"
                    chip={
                      preview
                        ? deltaChip(
                            playerDodgeChance(preview) -
                              playerDodgeChance(state),
                            "%",
                          )
                        : null
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="equip-area">
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
                      }${item && isArmorBroken(item) ? " broken" : ""}`}
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
                      onPointerEnter={item ? inspectItem(item) : undefined}
                      onPointerLeave={(e) => {
                        if (e.pointerType !== "touch" && !dragRef.current) {
                          setInspect(null);
                        }
                      }}
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
          </div>
        </div>

        {/* The bag — the dominant area of the modal: a compact grid of small
            cells that scrolls, sized to hold plenty on a vertical phone. */}
        <div className="inv-bag">
          {/* BAG header with two one-tap tools:
              • AUTO-EQUIP (crossed swords) wears the best piece the bag holds
                in every slot at once, folding the hero's build into the weapon
                pick. Disabled when the loadout is already optimal.
              • DROP-ALL (trash can) clears every piece the hero has outgrown
                (worse than what's worn) while sparing keepers — upgrades,
                side-grades, trinkets, and unique/legendary trophies. Disabled
                when nothing qualifies so it can't destroy a clean bag.
              Each button shows the count it would act on beside its icon. */}
          <div className="inv-bag-header">
            <PixelText font={font} text="BAG" scale={2} color="#9aa3ad" />
            <div className="inv-bag-actions">
              <button
                type="button"
                className="pixel-button secondary inv-icon-btn"
                aria-label="auto-equip"
                disabled={autoCount === 0}
                onClick={() => {
                  if (autoEquipBest(state) > 0) {
                    playUiSound(synth, "equip");
                    setInspect(null);
                    onChange();
                  }
                }}
              >
                <img
                  src={spriteDataUrl(sprites, "icon_swords")}
                  alt="auto-equip"
                  className="pixel-img inv-btn-icon"
                  draggable={false}
                />
                {autoCount > 0 && (
                  <PixelText
                    font={font}
                    text={String(autoCount)}
                    scale={1}
                    color="#e6e8eb"
                  />
                )}
              </button>
              <button
                type="button"
                className="pixel-button secondary inv-icon-btn"
                aria-label="drop-all"
                disabled={scrapCount === 0}
                onClick={() => {
                  if (scrapInferiorLoot(state).length > 0) {
                    playUiSound(synth, "back");
                    setInspect(null);
                    onChange();
                  }
                }}
              >
                <img
                  src={spriteDataUrl(sprites, "icon_trash")}
                  alt="drop-all"
                  className="pixel-img inv-btn-icon"
                  draggable={false}
                />
                {scrapCount > 0 && (
                  <PixelText
                    font={font}
                    text={String(scrapCount)}
                    scale={1}
                    color="#e6e8eb"
                  />
                )}
              </button>
            </div>
          </div>
          <div className="inv-grid">
            {player.inventory.map((item, index) => (
              <div
                key={index}
                className={`inv-cell${
                  item && isArmorBroken(item) ? " broken" : ""
                }${
                  // A find that beats what's worn in its slot glows to pull the
                  // eye — the cue that replaces auto-equip now that finds bank
                  // to the bag. A broken piece never glows (it wears nothing).
                  item && !isArmorBroken(item) && wouldUpgradeSlot(state, item)
                    ? " upgrade"
                    : ""
                }`}
                data-drop={`inv:${index}`}
                style={
                  item ? { borderColor: TIER_COLORS[item.tier] } : undefined
                }
                onPointerDown={
                  item ? startDrag(item, { type: "inv", index }) : undefined
                }
                onPointerEnter={item ? inspectItem(item) : undefined}
                onPointerLeave={(e) => {
                  if (e.pointerType !== "touch" && !dragRef.current) {
                    setInspect(null);
                  }
                }}
              >
                {item &&
                  !(drag?.from.type === "inv" && drag.from.index === index) && (
                    <ItemIcon sprites={sprites} item={item} />
                  )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="pixel-button modal-close-btn"
          aria-label="close-inventory"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={2} color="#0b0d10" />
        </button>
      </div>

      {/* Discard warning: a bag item or equipped gear dragged clear
          of the panel is at risk, so only then does the "destroy" prompt
          appear. The held weapon is never trashable, so dragging it shows no
          warning. */}
      {drag &&
        drag.moved &&
        (drag.from.type === "inv" || drag.from.slot !== "weapon") && (
          <div className="discard-hint">
            <PixelText
              font={font}
              text="DROP OUTSIDE TO DESTROY"
              scale={1}
              color="#e06a6a"
            />
          </div>
        )}

      {/* WoW-style tooltip for the hovered / tapped item, hidden while a drag
          is in flight (the drag ghost speaks for the item instead). */}
      {inspect && !(drag && drag.moved) && (
        <ItemTooltip
          font={font}
          state={state}
          sprites={sprites}
          item={inspect.item}
          anchor={inspect.anchor}
        />
      )}

      {/* Drag ghost following the pointer */}
      {drag && drag.moved && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <ItemIcon sprites={sprites} item={drag.item} />
        </div>
      )}
    </div>
  );
}

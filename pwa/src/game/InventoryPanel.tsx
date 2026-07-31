// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Diablo 2 inventory: a body-shaped PAPER DOLL of equipment slots
// (PaperDoll.tsx) beside the bag grid, with the purse at its foot. Drag an
// item onto a slot to equip it; on desktop a
// plain click quick-equips, and on touch the first tap raises the item's
// tooltip while a second commits. The two halves sit side by side in landscape
// and stack in portrait (see styles.css). The panel mutates the (paused)
// engine state through the inventory API and calls `onChange` so React re-reads
// it.
//
// The hero's NUMBERS are not here. The character sheet is its own modal
// (CharacterSheet.tsx), raised by pressing the hero's portrait out in the HUD
// exactly as D2 does it — so no portrait and no stat readout ride in this
// panel. What a player needs WHILE trying gear on is already under their
// finger: the item tooltip states the piece's own numbers and their green/red
// difference from the piece it would replace, with the worn piece's card
// beside it (see ItemTooltip). A strip repeating four of those totals was a
// second, weaker copy of a comparison the tooltip already makes better.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  autoEquipUpgradeCount,
  equipmentName,
  gateKeyTarget,
  isArmorBroken,
  isWeaponBroken,
  isScrappableLoot,
  reviveTarget,
  wouldUpgradeSlot,
  type EquipSlot,
  type Equipment,
  type GameState,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import {
  spriteDataUrl,
  spriteMonoUrl,
  type RelicTier,
  type Sprites,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { playEquipHaptic } from "./haptics.ts";
import { ItemIcon } from "./ItemCard.tsx";
import { ItemTooltip } from "./ItemTooltip.tsx";
import { PaperDoll } from "./PaperDoll.tsx";
import { playUiSound } from "./sfx/ui.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

import { runCommand, runCommandOk } from "./run-commands.ts";

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

/**
 * One of the bag's two sweep tools. The icon art carries WHAT it does; this
 * carries WHETHER it is worth doing and WHAT IT COSTS you — the two things a
 * grey plate with a number beside it never said.
 *
 * `intent` is the whole treatment: `equip` re-hues its glyph gold and pulses
 * the same halo the bag's upgrade cells wear (the game already taught the
 * player that gold pulse means "wear this"), `scrap` burns ember red so
 * destroying is never one absent-minded tap away from equipping. `count` rides
 * a corner badge in the same colour, and a tool with nothing to act on drops
 * every bit of it — grey glyph, flat plate, no badge — so the pair reads as a
 * state of the bag rather than as two permanent buttons.
 */
function ToolButton({
  font,
  sprites,
  intent,
  label,
  icon,
  count,
  onRun,
}: {
  font: PixelFont;
  sprites: Sprites;
  intent: "equip" | "scrap";
  label: string;
  icon: string;
  count: number;
  onRun: () => void;
}) {
  const armed = count > 0;
  const tint = intent === "equip" ? "#ffd24a" : "#e06a6a";
  // Re-hued while armed (`spriteMonoUrl` keeps the sprite's own shading, so it
  // stays art rather than collapsing to a silhouette); the plain sprite when
  // there is nothing to do, greyed by CSS.
  const src = armed
    ? spriteMonoUrl(sprites, icon, tint)
    : spriteDataUrl(sprites, icon);
  return (
    <div className="inv-btn-labeled">
      <PixelText
        font={font}
        text={label}
        scale={1}
        color={armed ? tint : "#6f7684"}
      />
      <button
        type="button"
        className={`pixel-button secondary inv-icon-btn inv-tool-${intent}${
          armed ? " armed" : ""
        }`}
        aria-label={intent === "equip" ? "auto-equip" : "drop-all"}
        disabled={!armed}
        onClick={onRun}
      >
        {src && (
          <img
            src={src}
            alt=""
            className="pixel-img inv-btn-icon"
            draggable={false}
          />
        )}
        {armed && (
          <span className="inv-tool-badge">
            <PixelText
              font={font}
              text={String(count)}
              scale={1}
              color="#0b0d10"
            />
          </span>
        )}
      </button>
    </div>
  );
}

export function InventoryPanel({
  state,
  font,
  relicFonts,
  sprites,
  onChange,
  onClose,
}: {
  state: GameState;
  font: PixelFont;
  relicFonts: Record<RelicTier, PixelFont>;
  sprites: Sprites;
  onChange: () => void;
  onClose: () => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  // A piece dragged clear of the panel is not trashed on release — dropping it
  // outside ARMS the destroy, staging the item + where it came from here, and
  // the confirm dialog below asks the player to commit before the loot is
  // actually culled. Cleared on confirm (after the discard) or on cancel.
  const [pendingDestroy, setPendingDestroy] = useState<{
    item: Equipment;
    from: DragSource;
  } | null>(null);
  // The item whose WoW-style tooltip is raised, plus the cell rect the tooltip
  // anchors to. Raised by hover (desktop) or tap (touch), and also set by a
  // drag's own press so the piece under the finger stays described.
  const [inspect, setInspect] = useState<{
    item: Equipment;
    anchor: DOMRect;
  } | null>(null);
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
          // Dropped clear of the bag and slots: this is the DESTROY gesture,
          // but trashing loot is irreversible, so we don't cull it here — we
          // ARM the confirm dialog with the piece and where it came from and
          // let the player commit (see the `pendingDestroy` overlay below).
          // The held weapon is never trashable, so it never arms the prompt.
          if (d.from.type === "inv" || d.from.slot !== "weapon") {
            setPendingDestroy({ item: d.item, from: d.from });
          }
        } else if (d.from.type === "inv" && kind === "inv") {
          runCommand(state, "moveInventoryItem", d.from.index, Number(arg));
        } else if (d.from.type === "inv" && kind === "slot") {
          // Equip into the slot the player AIMED at, not whichever one the
          // engine would pick — with two ring fingers those differ, and the
          // drop gesture is an explicit choice of finger.
          if (
            runCommandOk(
              state,
              "equipFromInventoryInto",
              d.from.index,
              arg as EquipSlot,
            )
          ) {
            playUiSound(synth, "equip");
          }
        } else if (d.from.type === "slot" && kind === "inv") {
          if (runCommandOk(state, "unequipToInventory", d.from.slot)) {
            const landed = state.player.inventory.findIndex(
              (i) => i?.id === d.item.id,
            );
            const wanted = Number(arg);
            if (landed >= 0 && state.player.inventory[wanted] === null) {
              runCommand(state, "moveInventoryItem", landed, wanted);
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
              ? runCommandOk(state, "equipFromInventory", d.from.index)
              : runCommandOk(state, "unequipToInventory", d.from.slot);
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

  // Drop the tooltip when the mouse leaves a cell — but never on touch (which
  // has no hover, so the tooltip is the tap's own result) and never mid-drag.
  const leaveItem = (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch" && !dragRef.current) setInspect(null);
  };

  // WHICH VERB a bag piece offers right now, or null when it is inert here —
  // the one probe the USE row, the right-click and the activation all read, so
  // the affordance the card shows and the command the tap runs can never
  // disagree. Two pieces answer today and both are zero-stat trinkets whose
  // whole worth is what they DO: a travel-gate key on its home level (the
  // cow-level ritual), and SMELLING SALTS while a companion is face-down.
  const bagVerb = (item: Equipment) => {
    if (gateKeyTarget(state, item)) return "spendGateKey" as const;
    if (reviveTarget(state, item)) return "spendReviveItem" as const;
    return null;
  };

  // USE that piece: consume it, run its verb, and close the panel so the player
  // watches it land — the gate tearing open a step ahead, or a friend coming
  // round. Reached from the tooltip's USE row (touch) or a right-click on the
  // bag cell (desktop).
  const activateItem = (item: Equipment) => {
    const verb = bagVerb(item);
    const index = state.player.inventory.findIndex((i) => i?.id === item.id);
    if (!verb || index < 0 || !runCommandOk(state, verb, index)) return;
    playUiSound(synth, "confirm");
    setInspect(null);
    onChange();
    onClose();
  };

  // Commit an armed destroy: cull the staged piece from its bag cell or off the
  // body (the weapon slot is never emptied this way), then clear the prompt.
  const confirmDestroy = () => {
    const pending = pendingDestroy;
    if (!pending) return;
    const trashed =
      pending.from.type === "inv"
        ? runCommandOk(state, "discardFromInventory", pending.from.index)
        : runCommandOk(state, "discardEquipped", pending.from.slot);
    if (trashed) {
      playUiSound(synth, "back");
    }
    setPendingDestroy(null);
    setInspect(null);
    onChange();
  };

  // Back out of an armed destroy: the piece stays exactly where it was.
  const cancelDestroy = () => {
    playUiSound(synth, "blip");
    setPendingDestroy(null);
  };

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
  // The backdrop is the "ground": releasing a bag item over it destroys the
  // item. The panel itself absorbs drops (data-drop="none") so a miss between
  // cells is a harmless no-op, never a discard; only a release out beyond the
  // panel trashes the piece.
  return (
    <div
      className="game-overlay inventory-overlay"
      data-drop="ground"
      // Tapping empty space (outside any item cell) dismisses the tooltip —
      // the touch equivalent of moving the mouse off an item.
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest(".inv-cell")) setInspect(null);
      }}
    >
      <div className="inventory-panel" data-drop="none">
        <div className="inv-body">
          {/* The body itself. In portrait the two children stack — doll,
              bag; in landscape they fold side by side (see styles.css). */}
          <PaperDoll
            state={state}
            sprites={sprites}
            dragItem={drag?.item ?? null}
            dragFromSlot={drag?.from.type === "slot" ? drag.from.slot : null}
            onSlotDown={(item, slot) => startDrag(item, { type: "slot", slot })}
            onSlotEnter={inspectItem}
            onSlotLeave={leaveItem}
          />

          {/* The bag — a grid of cells that scrolls, sized to hold plenty on a
              vertical phone. */}
          <div className="inv-bag">
            {/* BAG header with two one-tap tools:
                • AUTO-EQUIP (crossed swords) wears the best piece the bag holds
                  in every slot at once, folding the hero's build into the weapon
                  pick. Disabled when the loadout is already optimal.
                • DROP-ALL (trash can) clears every piece the hero has outgrown
                  (worse than what's worn) while sparing keepers — upgrades,
                  side-grades, trinkets, and unique/legendary trophies. Disabled
                  when nothing qualifies so it can't destroy a clean bag.
                Each carries the count it would act on as a corner badge, and
                each wears its INTENT rather than the same grey plate: gold for
                the tool that makes the hero stronger — the very glow the bag's
                own upgrade cells pulse, so one visual language covers "wear
                this" whether it is on a find or on the button that wears every
                find at once — and ember red for the one that destroys. A tool
                with nothing to do goes flat and colourless, so the pair reads
                as "there is loot worth acting on" at a glance. */}
            <div className="inv-bag-header">
              <PixelText font={font} text="BAG" scale={2} color="#9aa3ad" />
              <div className="inv-bag-actions">
                <ToolButton
                  font={font}
                  sprites={sprites}
                  intent="equip"
                  label="AUTO-EQUIP"
                  icon="icon_swords"
                  count={autoCount}
                  onRun={() => {
                    if ((runCommand(state, "autoEquipBest") as number) > 0) {
                      playUiSound(synth, "equip");
                      setInspect(null);
                      onChange();
                    }
                  }}
                />
                <ToolButton
                  font={font}
                  sprites={sprites}
                  intent="scrap"
                  label="DROP TRASH"
                  icon="icon_trash"
                  count={scrapCount}
                  onRun={() => {
                    if (
                      (runCommand(state, "scrapInferiorLoot") as unknown[])
                        .length > 0
                    ) {
                      playUiSound(synth, "back");
                      setInspect(null);
                      onChange();
                    }
                  }}
                />
              </div>
            </div>
            <div className="inv-grid">
              {player.inventory.map((item, index) => (
                <div
                  key={index}
                  className={`inv-cell${
                    item && (isArmorBroken(item) || isWeaponBroken(item))
                      ? " broken"
                      : ""
                  }${
                    // A find that beats what's worn in its slot glows to pull
                    // the eye — the cue that replaces auto-equip now that finds
                    // bank to the bag. A broken piece never glows (a broken
                    // weapon can't be wielded and broken armor wears nothing).
                    item &&
                    !isArmorBroken(item) &&
                    !isWeaponBroken(item) &&
                    wouldUpgradeSlot(state, item)
                      ? " upgrade"
                      : ""
                  }${item ? tierGlowClass(item.tier) : ""}`}
                  data-drop={`inv:${index}`}
                  style={
                    item ? { borderColor: TIER_COLORS[item.tier] } : undefined
                  }
                  onPointerDown={
                    item ? startDrag(item, { type: "inv", index }) : undefined
                  }
                  onPointerEnter={item ? inspectItem(item) : undefined}
                  onPointerLeave={leaveItem}
                  // Desktop's quiet ritual: right-clicking a usable trinket
                  // (a gate key on its home level, a bottle of salts with a
                  // friend down) uses it in place.
                  onContextMenu={
                    item && bagVerb(item)
                      ? (e) => {
                          e.preventDefault();
                          activateItem(item);
                        }
                      : undefined
                  }
                >
                  {item &&
                    !(
                      drag?.from.type === "inv" && drag.from.index === index
                    ) && <ItemIcon sprites={sprites} item={item} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The foot rail: the purse on the left the way D2 hangs its gold under
            the panel, CLOSE centred. Keeping the purse out of the doll column
            is what buys that column the height its frames are worth. */}
        <div className="inv-footer">
          <div className="inv-purse">
            {(() => {
              const coin = spriteDataUrl(sprites, "icon_coins");
              return coin ? (
                <img
                  src={coin}
                  alt=""
                  className="pixel-img inv-purse-icon"
                  draggable={false}
                />
              ) : null;
            })()}
            <PixelText
              font={font}
              text={formatCompact(player.coins)}
              scale={2}
              color="#ffd75e"
            />
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
          is in flight (the drag ghost speaks for the item instead) and while
          the destroy confirm is armed — the tooltip is portaled to <body> above
          the modal band (see the layer map in styles.css), so it would
          otherwise float over the confirm that is meant to own the screen. */}
      {inspect && !(drag && drag.moved) && !pendingDestroy && (
        <ItemTooltip
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={inspect.item}
          anchor={inspect.anchor}
          onUse={
            bagVerb(inspect.item) ? () => activateItem(inspect.item) : undefined
          }
        />
      )}

      {/* Drag ghost following the pointer */}
      {drag && drag.moved && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          <ItemIcon sprites={sprites} item={drag.item} />
        </div>
      )}

      {/* Destroy confirmation: dragging a piece off the panel arms — it doesn't
          commit — the cull, since trashing loot can't be undone. The player
          sees exactly which piece is at risk (its icon + tier-colored name) and
          taps DESTROY to go through or KEEP (or the backdrop) to back out. */}
      {pendingDestroy && (
        <div
          className="destroy-confirm-overlay"
          // A tap on the dark backdrop (clear of the dialog) is a cancel.
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) cancelDestroy();
          }}
        >
          <div className="destroy-confirm pixel-panel">
            <PixelText
              font={font}
              text="DESTROY ITEM?"
              scale={2}
              color="#e06a6a"
            />
            <div className="destroy-confirm-item">
              <ItemIcon sprites={sprites} item={pendingDestroy.item} />
              <PixelText
                font={font}
                text={equipmentName(pendingDestroy.item)}
                scale={2}
                color={TIER_COLORS[pendingDestroy.item.tier]}
              />
            </div>
            <PixelText
              font={font}
              text="THIS CANNOT BE UNDONE"
              scale={1}
              color="#9aa3ad"
            />
            <div className="destroy-confirm-actions">
              <button
                type="button"
                className="pixel-button secondary"
                aria-label="keep-item"
                onClick={cancelDestroy}
              >
                <PixelText font={font} text="KEEP" scale={2} color="#e6e8eb" />
              </button>
              <button
                type="button"
                className="pixel-button destroy-confirm-yes"
                aria-label="destroy-item"
                onClick={confirmDestroy}
              >
                <PixelText
                  font={font}
                  text="DESTROY"
                  scale={2}
                  color="#0b0d10"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

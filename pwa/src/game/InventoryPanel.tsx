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

import { localHero } from "./local-seat.ts";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  AMMO,
  AMMO_KINDS,
  AMMO_TYPES,
  ammoCount,
  autoEquipUpgradeCount,
  equipmentName,
  gateKeyTarget,
  isArmorBroken,
  isWeaponBroken,
  isTrashLoot,
  isUnidentified,
  lookupTicketIndex,
  reviveTarget,
  SIDEARM_DEF_ID,
  weaponAmmoType,
  weaponDef,
  wouldUpgradeSlot,
  type AmmoType,
  type EquipSlot,
  type Equipment,
  type GameState,
  type Player,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { InfoTip } from "@ui/lib/InfoTip.tsx";
import type { LongPressWatch } from "@ui/lib/long-press.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useDismissOnOutsidePress } from "@ui/lib/use-outside-press.ts";

import {
  spriteDataUrl,
  spriteMonoUrl,
  type RelicTier,
  type Sprites,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { armCardCopy } from "./card-copy-gesture.ts";
import { playEquipHaptic } from "./haptics.ts";
import { IdentifyReveal } from "./IdentifyReveal.tsx";
import { ItemIcon, itemKindGlyph } from "./ItemCard.tsx";
import { InfoNote } from "./InfoNote.tsx";
import { cardComparison, ItemTooltip } from "./ItemTooltip.tsx";
import { PaperDoll } from "./PaperDoll.tsx";
import { playUiSound } from "./sfx/ui.ts";
import { TIER_COLORS, tierGlowClass } from "./tiers.ts";

import { runCommand, runCommandOk } from "./run-commands.ts";

type DragSource =
  { type: "inv"; index: number } | { type: "slot"; slot: EquipSlot };

/**
 * THE BAG FRAME: how many cells the grid draws at once, whether or not the
 * hero has earned them yet. Diablo 2 draws its whole 10x4 rectangle from the
 * first minute, and drawing ours the same way — with the cells STRENGTH and a
 * worn bag have not unlocked yet greyed out and inert — turns "your bag is
 * small" into "here is the bag you are growing into". The cells that exist are
 * still exactly the engine's (`inventoryCapacity` → `player.inventory.length`);
 * nothing here grants room.
 *
 * 40 is also the least common multiple of the two column counts the layout
 * uses (eight in portrait and on the narrow landscape floor, ten on a normal
 * landscape phone), so padding the drawn count up to a multiple of it always
 * lands a WHOLE number of rows — the frame stays a clean rectangle at every
 * breakpoint instead of ending in a ragged half row. Keep it divisible by
 * every column count `--inv-cols` takes in styles.css.
 */
const BAG_FRAME_CELLS = 40;

/**
 * WHAT EACH KIND SERVES, pre-wrapped against the 390px reference phone
 * (InfoNote never wraps) — the ARSENAL half of the socket's note.
 *
 * A kind's note answers exactly one question, and it is the question three
 * icons and three numbers in a foot rail never answered: WHICH GUNS TAKE
 * THESE. So each entry names the weapon families its own kind feeds and
 * nothing else. It used to open with the rule shared by all three and a
 * clause about weapons that wear out instead — which meant the CELLS socket
 * explained a shotgun's pellets and a volley's arrows, neither of which has
 * anything to do with a cell, and the swords the whole system does not touch.
 * A note that spends its first four lines on the other kinds is a note the
 * player reads once.
 */
const AMMO_SERVES: Record<AmmoType, readonly string[]> = {
  bullets: [
    "WHAT EVERY FIREARM TAKES —",
    "PISTOLS, REVOLVERS, SHOTGUNS,",
    "CARBINES AND REPEATERS.",
    "ONE ROUND PER TRIGGER PULL; A",
    "SHOTGUN'S PELLETS ARE ONE.",
  ],
  arrows: [
    "WHAT A DRAWN BOW TAKES.",
    "ONE ARROW PER SHOT, HOWEVER",
    "MANY A VOLLEY LOOSES.",
  ],
  cells: [
    "WHAT THE ENERGY WEAPONS TAKE —",
    "THE PRINTED SIDEARM, TASERS,",
    "RAILS AND PLASMA.",
    "ONE CELL PER TRIGGER PULL.",
  ],
};

/**
 * WHAT ONE AMMUNITION SOCKET IS, in the player's terms — which guns take this
 * kind, then the one fact that differs per hero: whether anything he is
 * carrying actually fires it.
 *
 * That last line is the other half of why the pouch confused: a stack for a
 * gun sold two levels ago looks exactly like the stack that is about to run
 * you dry. So the note NAMES the weapon — the held one first, since that is
 * the one the trigger is on.
 */
function ammoHelp(player: Player, type: AmmoType): string[] {
  const held = player.equipment.weapon;
  const eaters: string[] = [];
  if (weaponAmmoType(held) === type) eaters.push(equipmentName(held));
  for (const piece of player.inventory) {
    if (piece && weaponAmmoType(piece) === type)
      eaters.push(equipmentName(piece));
  }
  // The SIDEARM is nowhere in the bag — it is minted into an empty hand — so a
  // pouch stocked only for it reads as rounds for nothing at all. That is the
  // one stack a fresh run opens with beside the weapon it hands out, so it is
  // the case the note has to answer rather than shrug at.
  const sidearmOnly =
    eaters.length === 0 && weaponDef(SIDEARM_DEF_ID).ammo === type;
  return [
    ...AMMO_SERVES[type],
    "",
    ...(eaters.length > 0
      ? [
          `FIRED BY ${eaters[0]}.`,
          ...(eaters.length > 1
            ? [`AND ${eaters.length - 1} MORE IN THE BAG.`]
            : []),
        ]
      : sidearmOnly
        ? ["OF WHAT YOU CARRY, ONLY THE", "SIDEARM YOU FALL BACK ON."]
        : ["NOTHING YOU CARRY FIRES THESE."]),
  ];
}

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
  // ANY press that misses both the card and a cell puts the card away — the
  // touch equivalent of moving the mouse off an item, and the one dismiss the
  // panel has. It is bound on the window rather than on the overlay below
  // because the card is PORTALED to <body>: an overlay-level handler still
  // sees the card's own presses (React routes a portal's events through the
  // tree that rendered it) and read them as a miss, so pressing the card to
  // read it was what put it away. Cells are exempt because a press on one
  // raises its own card (and, on touch, the second one equips).
  useDismissOnOutsidePress(inspect !== null, ".item-tooltip, .inv-cell", () =>
    setInspect(null),
  );
  // The just-identified piece whose centered REVEAL is on stage (a ticket was
  // spent on it from this panel). The same live instance — the identify
  // already cleared its veil, so the card renders the full stats.
  const [revealed, setRevealed] = useState<Equipment | null>(null);
  // Written only from event handlers (start/move/up), never during render:
  // the up-handler needs the freshest drag without re-subscribing per move.
  const dragRef = useRef<Drag | null>(null);
  const dragActive = drag !== null;
  // PRESS AND HOLD A BAG CELL OR A WORN SLOT COPIES THE PIECE'S CARD as a
  // picture (card-copy-gesture.ts). It rides the CELL rather than the card
  // because the card here is the floating tooltip, which is `pointer-events:
  // none` on purpose — the finger that means "this card" never actually
  // touches it. The same press is also the start of a drag, and the two
  // separate cleanly: a drag is a press that MOVED (the watch cancels itself
  // past its slop), a hold is a press that did not. What the hold owes the
  // release is that it be swallowed — see `up` below, where a fired hold means
  // the tap must not also equip the piece it just photographed.
  const holdRef = useRef<LongPressWatch | null>(null);
  const endHold = () => {
    holdRef.current?.cancel();
    holdRef.current = null;
  };
  // A panel closed mid-hold takes its timer with it.
  useEffect(() => endHold, []);

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
            const landed = localHero(state).inventory.findIndex(
              (i) => i?.id === d.item.id,
            );
            const wanted = Number(arg);
            if (landed >= 0 && localHero(state).inventory[wanted] === null) {
              runCommand(state, "moveInventoryItem", landed, wanted);
            }
          }
        }
      }
    };

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      holdRef.current?.moved(e.clientX, e.clientY);
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
      // A press the hold already claimed is spent: it copied the card, and it
      // must not ALSO equip the piece on the way back up. The tooltip stays
      // raised so the player sees what was photographed.
      const copied = holdRef.current?.fired ?? false;
      endHold();
      if (copied) {
        dragRef.current = null;
        setDrag(null);
        return;
      }
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
    // A gesture the browser takes over (a scroll claiming the touch) never
    // reaches `up`, so the hold has to be dropped on its own signal — or the
    // card is copied by a press the player already let go of.
    const cancelled = () => endHold();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelled);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelled);
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
  // disagree. Three pieces answer today: a travel-gate key on its home level
  // (the cow-level ritual), SMELLING SALTS while a companion is face-down —
  // zero-stat trinkets whose whole worth is what they DO — and an UNIDENTIFIED
  // find while an ITEM LOOKUP TICKET is in the bag (the affordance rides the
  // FIND, not the ticket: one tap identifies, no target-picking dance).
  const bagVerb = (item: Equipment) => {
    if (gateKeyTarget(state, item)) return "spendGateKey" as const;
    if (reviveTarget(state, item)) return "spendReviveItem" as const;
    if (isUnidentified(item) && lookupTicketIndex(localHero(state)) >= 0) {
      return "spendLookupTicket" as const;
    }
    return null;
  };

  // USE that piece: consume it, run its verb, and close the panel so the player
  // watches it land — the gate tearing open a step ahead, or a friend coming
  // round. Reached from the tooltip's USE row (touch) or a right-click on the
  // bag cell (desktop). The IDENTIFY verb is the exception on both counts: it
  // spends a ticket ON the tapped find, and instead of closing the panel it
  // raises the centered reveal (the identified card IS the payoff).
  const activateItem = (item: Equipment) => {
    const verb = bagVerb(item);
    const index = localHero(state).inventory.findIndex(
      (i) => i?.id === item.id,
    );
    if (!verb || index < 0) return;
    if (verb === "spendLookupTicket") {
      const ticket = lookupTicketIndex(localHero(state));
      if (ticket < 0 || !runCommandOk(state, verb, ticket, index)) return;
      playUiSound(synth, "confirm");
      setInspect(null);
      setRevealed(item);
      onChange();
      return;
    }
    if (!runCommandOk(state, verb, index)) return;
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
      // Arm the copy hold on the same press that starts the drag; whichever
      // the player turns out to have meant, the other cancels itself.
      endHold();
      holdRef.current = armCardCopy({ x: e.clientX, y: e.clientY }, () => ({
        font,
        relicFonts,
        sprites,
        state,
        item,
        ...cardComparison(state, item),
      }));
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

  const player = localHero(state);
  // How many bag pieces the SCRAP sweep would clear right now — loot the hero
  // has outgrown (worse than what's worn, and not a trinket/trophy the engine
  // spares), MINUS the backup weapons it refuses to destroy. Drives the
  // button's count and its disabled state so it never destroys anything when
  // there's nothing junk to cull — and, because it is the sweep's own
  // predicate, the badge can never promise a cull the sweep won't make.
  const scrapCount = player.inventory.filter(
    (item): item is Equipment =>
      item !== null && isTrashLoot(state, player, item),
  ).length;
  // How many slots AUTO-EQUIP would improve right now — drives the button's
  // count and its disabled state so it never runs on an already-optimal
  // loadout (the sweep folds the hero's build into the weapon pick, so a melee
  // hero lands a melee weapon and a mage a wand).
  const autoCount = autoEquipUpgradeCount(state, player);
  // The cells the hero actually HAS — the engine's own capacity, grown by
  // STRENGTH and by a worn bag — and the size of the rectangle drawn around
  // them. A carry that outgrows one frame gets another whole frame rather than
  // a ragged row (see BAG_FRAME_CELLS).
  const unlockedCells = player.inventory.length;
  const framedCells =
    Math.max(1, Math.ceil(unlockedCells / BAG_FRAME_CELLS)) * BAG_FRAME_CELLS;
  // The backdrop is the "ground": releasing a bag item over it destroys the
  // item. The panel itself absorbs drops (data-drop="none") so a miss between
  // cells is a harmless no-op, never a discard; only a release out beyond the
  // panel trashes the piece.
  return (
    <div className="game-overlay inventory-overlay" data-drop="ground">
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
              {/* The title sits on the FOOT of the header rather than its top,
                  so it labels the frame directly under it instead of floating
                  a tool-button's height clear of the thing it names. */}
              <PixelText
                font={font}
                className="inv-bag-title"
                text="BAG"
                scale={2}
                color="#9aa3ad"
              />
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
            {/* THE BAG PROPER, framed as one SECTION of grid the way D2 sets
                its carry into the panel rather than scattering loose cells
                across it. The rectangle is always whole: the cells past what
                STRENGTH and the worn bag have unlocked are drawn LOCKED —
                sealed sockets that hold nothing and take no drop — so the room
                still to be earned is visible instead of absent. */}
            <div className="inv-bag-frame">
              <div className="inv-grid inv-bag-grid">
                {Array.from({ length: framedCells }, (_, index) => {
                  if (index >= unlockedCells) {
                    return (
                      <div
                        key={index}
                        className="inv-cell locked"
                        aria-hidden
                      />
                    );
                  }
                  const item = player.inventory[index];
                  return (
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
                        wouldUpgradeSlot(state, player, item)
                          ? " upgrade"
                          : ""
                      }${item ? tierGlowClass(item.tier) : ""}`}
                      data-drop={`inv:${index}`}
                      style={
                        item
                          ? { borderColor: TIER_COLORS[item.tier] }
                          : undefined
                      }
                      onPointerDown={
                        item
                          ? startDrag(item, { type: "inv", index })
                          : undefined
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
                        ) && (
                          <>
                            <ItemIcon sprites={sprites} item={item} />
                            {/* A STACK says how deep it is on the cell itself
                                (lookup tickets) — the same corner badge the
                                merchant's stall piles wear. A single unit
                                shows nothing. */}
                            {(item.qty ?? 1) > 1 && (
                              <span className="consumable-count inv-stack-count">
                                <PixelText
                                  font={font}
                                  text={String(item.qty)}
                                  scale={2}
                                  color="#f4f4f4"
                                />
                              </span>
                            )}
                          </>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* The foot rail: the purse on the left the way D2 hangs its gold under
            the panel, CLOSE centred. Keeping the purse out of the doll column
            is what buys that column the height its frames are worth.
            Every count on the rail — the purse and one socket per ammunition
            kind — wears the same `.inv-readout` CUTOUT, so the foot reads as
            frames cut into the panel rather than numbers loose on the plate. */}
        <div className="inv-footer">
          <InfoTip
            className="inv-purse inv-readout"
            label="explain-purse"
            tip={
              <InfoNote
                font={font}
                title={`COINS ${formatCompact(player.coins)}`}
                lines={[
                  "WHAT THE MERCHANT PAYS FOR",
                  "LOOT YOU SELL, AND WHAT HIS",
                  "STALL AND THE BUYBACK RACK",
                  "CHARGE. IT SURVIVES THE RUN.",
                ]}
              />
            }
          >
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
          </InfoTip>
          {/* THE AMMUNITION POUCH, beside the purse and read the same way: an
              icon and a number per kind. It hangs here rather than taking bag
              cells because rounds the hero cannot pick up for want of room to
              stow a spare helmet is a frustration with nothing to say — the
              bag's own pressure (loot against loot) is the better game.
              A kind he has never found is left out entirely, so the rail stays
              short early and fills in as the arsenal does. */}
          <div className="inv-ammo">
            {AMMO_TYPES.filter((type) => ammoCount(player, type) > 0).map(
              (type) => {
                const icon = spriteDataUrl(sprites, AMMO_KINDS[type].icon);
                const count = ammoCount(player, type);
                return (
                  <InfoTip
                    className="inv-ammo-kind inv-readout"
                    key={type}
                    label={`explain-ammo-${type}`}
                    tip={
                      <InfoNote
                        font={font}
                        title={`${AMMO_KINDS[type].name} ${count}/${AMMO.stackCap}`}
                        lines={ammoHelp(player, type)}
                      />
                    }
                  >
                    {icon ? (
                      <img
                        src={icon}
                        alt={AMMO_KINDS[type].name}
                        className="pixel-img inv-purse-icon"
                        draggable={false}
                      />
                    ) : null}
                    <PixelText
                      font={font}
                      text={String(count)}
                      scale={2}
                      // Amber once the stack is nearly full, so the player can
                      // see at a glance which kind is about to start refusing
                      // boxes on the floor.
                      color={count >= AMMO.stackCap ? "#ffb14a" : "#c2ccd6"}
                    />
                  </InfoTip>
                );
              },
            )}
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
          useLabel={
            bagVerb(inspect.item) === "spendLookupTicket"
              ? "IDENTIFY"
              : undefined
          }
          useIcon={
            bagVerb(inspect.item) === "spendLookupTicket"
              ? itemKindGlyph(inspect.item)
              : undefined
          }
        />
      )}

      {/* THE IDENTIFY REVEAL — a ticket was just spent on a find from this
          bag: the item-found spectacle takes center stage with the full stat
          card. Dismissed by tap/ESC back to the open bag, where the freshly
          revealed piece can be equipped. */}
      {revealed && (
        <IdentifyReveal
          font={font}
          relicFonts={relicFonts}
          sprites={sprites}
          state={state}
          item={revealed}
          onClose={() => setRevealed(null)}
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

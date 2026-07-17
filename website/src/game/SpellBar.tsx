// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD SPELL BAR — the thumb-reachable row of cast slots in a bottom corner
// (mirrors the powerup dock). Each slot shows its assigned spell's icon, mana
// cost, and a WoW-style cooldown wipe; a TAP casts it (dimmed/inert when the
// pool is short or it's still recharging), and a LONG-PRESS opens the picker to
// reassign the slot from the hero's unlocked spells. The engine owns the rules
// (mana/cooldown/unlock — sorcery.ts); this only dispatches casts and slot
// assignments through the callbacks GameScreen wires to `castSpell` /
// `setSpellSlot`.

import { useRef, useState, type CSSProperties } from "react";

import { spellDef, type SpellDef } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { SPELL_CATEGORY_LABEL, spellColor } from "./spellVisuals.ts";

/** How long a press must hold (ms) before it opens the picker instead of
 * casting — long enough that a quick tap always reads as a cast. */
const LONG_PRESS_MS = 380;

export type SpellSlotView = {
  /** The assigned spell id, or null for an empty slot. */
  id: string | null;
  /** Recharge progress in [0,1]: 0 = ready, 1 = just cast. */
  cooldownFrac: number;
  /** Whether the pool currently affords the cast. */
  affordable: boolean;
};

export function SpellBar({
  sprites,
  font,
  side,
  slots,
  unlockedIds,
  keyLabels,
  keyHints,
  onCast,
  onAssign,
}: {
  sprites: Sprites;
  font: PixelFont;
  side: "left" | "right";
  slots: SpellSlotView[];
  /** Every spell the hero has unlocked (ascending), the picker's menu. */
  unlockedIds: string[];
  /** Per-slot key hint label (desktop), same order as `slots`. */
  keyLabels: string[];
  keyHints: boolean;
  onCast: (slot: number) => void;
  onAssign: (slot: number, spellId: string | null) => void;
}) {
  // Which slot's picker is open (null = closed).
  const [picker, setPicker] = useState<number | null>(null);
  const holdTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const startPress = (slot: number) => {
    longPressed.current = false;
    clearHold();
    holdTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setPicker(slot);
    }, LONG_PRESS_MS);
  };

  const endPress = (slot: number, view: SpellSlotView) => {
    clearHold();
    if (longPressed.current) return; // the long-press opened the picker
    if (view.id && view.affordable && view.cooldownFrac <= 0) onCast(slot);
  };

  return (
    <div className={`spell-dock dock-${side}`}>
      {slots.map((view, i) => {
        const def = view.id ? spellDef(view.id) : null;
        const accent = def ? spellColor(def.element) : "#3a4150";
        const ready = !!def && view.affordable && view.cooldownFrac <= 0;
        return (
          <button
            key={i}
            type="button"
            className={`spell-slot${def ? " filled" : ""}${
              ready ? " ready" : ""
            }`}
            style={{ "--slot-accent": accent } as CSSProperties}
            aria-label={def ? `cast-${def.id}` : "spell-slot-empty"}
            onPointerDown={(e) => {
              e.preventDefault();
              startPress(i);
            }}
            onPointerUp={() => endPress(i, view)}
            onPointerLeave={clearHold}
            onPointerCancel={clearHold}
          >
            {def ? (
              <img
                src={spriteDataUrl(sprites, def.icon) ?? ""}
                alt=""
                className="pixel-img spell-icon"
              />
            ) : (
              <span className="spell-slot-plus">
                <PixelText font={font} text="+" scale={2} color="#5a6472" />
              </span>
            )}
            {/* Cooldown wipe — a dark shade rising from the bottom as the spell
                recharges (full at cast, gone when ready). */}
            {def && view.cooldownFrac > 0 && (
              <span
                className="spell-cooldown"
                style={{ height: `${Math.round(view.cooldownFrac * 100)}%` }}
              />
            )}
            {def && (
              <span className="spell-cost">
                <PixelText
                  font={font}
                  text={String(def.manaCost)}
                  scale={1}
                  color={ready ? "#bfe0ff" : "#6b7d90"}
                />
              </span>
            )}
            {keyHints && def && (
              <span className="slot-key spell-key">
                <PixelText
                  font={font}
                  text={keyLabels[i] ?? ""}
                  scale={1}
                  color="#0b0d10"
                />
              </span>
            )}
          </button>
        );
      })}

      {picker !== null && (
        <SpellPicker
          sprites={sprites}
          font={font}
          slot={picker}
          current={slots[picker]?.id ?? null}
          unlockedIds={unlockedIds}
          onPick={(id) => {
            onAssign(picker, id);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/** The long-press picker: a scrollable list of the hero's unlocked spells to
 * drop into the pressed slot (plus a clear option). */
function SpellPicker({
  sprites,
  font,
  slot,
  current,
  unlockedIds,
  onPick,
  onClose,
}: {
  sprites: Sprites;
  font: PixelFont;
  slot: number;
  current: string | null;
  unlockedIds: string[];
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const defs: SpellDef[] = unlockedIds.map(spellDef);
  return (
    <div className="spell-picker-backdrop" onPointerDown={onClose}>
      <div className="spell-picker" onPointerDown={(e) => e.stopPropagation()}>
        <div className="spell-picker-title">
          <PixelText
            font={font}
            text={`SLOT ${slot + 1}`}
            scale={2}
            color="#bfe0ff"
          />
        </div>
        <div className="spell-picker-list">
          {defs.length === 0 && (
            <div className="spell-picker-empty">
              <PixelText
                font={font}
                text="RAISE YOUR PRIME STAT TO LEARN POWERS"
                scale={1}
                color="#8a93a0"
              />
            </div>
          )}
          {defs.map((def) => (
            <button
              key={def.id}
              type="button"
              className={`spell-picker-row${
                def.id === current ? " selected" : ""
              }`}
              style={
                {
                  "--slot-accent": spellColor(def.element),
                } as CSSProperties
              }
              onPointerDown={(e) => {
                e.stopPropagation();
                onPick(def.id);
              }}
            >
              <img
                src={spriteDataUrl(sprites, def.icon) ?? ""}
                alt=""
                className="pixel-img spell-picker-icon"
              />
              <span className="spell-picker-text">
                <PixelText font={font} text={def.name} scale={1} />
                <PixelText
                  font={font}
                  text={`${SPELL_CATEGORY_LABEL[def.category]}  ${def.manaCost} MANA`}
                  scale={1}
                  color="#8a93a0"
                />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="spell-picker-clear"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPick(null);
          }}
        >
          <PixelText font={font} text="CLEAR SLOT" scale={1} color="#c98a8a" />
        </button>
      </div>
    </div>
  );
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The "SPELL UNLOCKED" modal — the reward moment when spending an INTELLECT
// point crosses a ×10 milestone (the engine queues the spell in
// `pendingSpellUnlocks`; see allocateStat). It reveals the new spell with an
// arcane bloom: a glowing rune-ring behind the icon, the name, its school and
// mana cost, and a one-line flavor blurb. Dismissing it drains one entry from
// the queue (`takeSpellUnlock`) and the next unlock, if any, reveals in turn.

import { useEffect, useState } from "react";

import { spellDef } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import {
  SPELL_CATEGORY_LABEL,
  SPELL_ELEMENT_DEEP,
  spellColor,
} from "./spellVisuals.ts";

export function SpellUnlockOverlay({
  spellId,
  font,
  sprites,
  onDismiss,
}: {
  spellId: string;
  font: PixelFont;
  sprites: Sprites;
  onDismiss: () => void;
}) {
  const def = spellDef(spellId);
  const accent = spellColor(def.element);
  const deep = SPELL_ELEMENT_DEEP[def.element] ?? accent;

  // A short reveal lockout so a stray steering tap can't instantly dismiss the
  // modal the instant it pops (mirrors the level-up chooser's arm window).
  const [armed, setArmed] = useState(false);
  // Re-run the bloom animation whenever the spell changes (a queued chain).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setArmed(false);
    setShown(false);
    const raf = requestAnimationFrame(() => setShown(true));
    const t = window.setTimeout(() => setArmed(true), 650);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [spellId]);

  return (
    <div
      className="spell-unlock-backdrop"
      onPointerDown={() => {
        if (armed) onDismiss();
      }}
    >
      <div
        className={`spell-unlock${shown ? " shown" : ""}`}
        style={
          {
            "--spell-accent": accent,
            "--spell-deep": deep,
          } as React.CSSProperties
        }
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="spell-unlock-kicker">
          <PixelText
            font={font}
            text="SPELL UNLOCKED"
            scale={2}
            color={accent}
          />
        </div>
        <div className="spell-unlock-emblem">
          <span className="spell-unlock-ring" />
          <span className="spell-unlock-ring ring-2" />
          <span className="spell-unlock-burst" />
          <img
            src={spriteDataUrl(sprites, def.icon) ?? ""}
            alt=""
            className="pixel-img spell-unlock-icon"
          />
        </div>
        <div className="spell-unlock-name">
          <PixelText font={font} text={def.name} scale={3} />
        </div>
        <div className="spell-unlock-meta">
          <PixelText
            font={font}
            text={`${SPELL_CATEGORY_LABEL[def.category]}   ${def.manaCost} MANA   INT ${def.minInt}`}
            scale={1}
            color="#aab4c0"
          />
        </div>
        <div className="spell-unlock-blurb">
          <PixelText
            font={font}
            text={def.blurb.toUpperCase()}
            scale={1}
            color="#d6dde6"
          />
        </div>
        <button
          type="button"
          className={`spell-unlock-continue${armed ? " ready" : ""}`}
          disabled={!armed}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (armed) onDismiss();
          }}
        >
          <PixelText
            font={font}
            text="CONTINUE"
            scale={2}
            color={armed ? "#0b0d10" : "#5a6472"}
          />
        </button>
      </div>
    </div>
  );
}

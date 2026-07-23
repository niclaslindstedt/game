// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The power-unlocked modal — the reward moment when a CLASS stat (STR/DEX/INT)
// crosses a ×10 milestone (the engine queues the power in `pendingSpellUnlocks`;
// see allocateStat). It reveals the new ART / TECHNIQUE / SPELL with a bloom: a
// glowing rune-ring behind the icon, the name, its school and mana cost, and a
// one-line flavor blurb. The kicker names the class ("ART UNLOCKED", …).
// Dismissing it drains one entry from the queue (`takeSpellUnlock`) and the
// next unlock, if any, reveals in turn.

import { useEffect, useState, type CSSProperties } from "react";

import { spellClassOf, spellDef } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useArmDelay } from "@ui/lib/use-arm-delay.ts";

import { spriteDataUrl, type Sprites } from "../assets.ts";
import {
  SPELL_CATEGORY_LABEL,
  SPELL_CLASS_LABEL,
  SPELL_CLASS_STAT_LABEL,
  SPELL_ELEMENT_DEEP,
  spellColor,
} from "../spell-visuals.ts";

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
  const cls = spellClassOf(def);
  const accent = spellColor(def.element);
  const deep = SPELL_ELEMENT_DEEP[def.element] ?? accent;

  // A short reveal lockout so a stray steering tap can't instantly dismiss the
  // modal the instant it pops (mirrors the level-up chooser's arm window). The
  // component is keyed by `spellId` at the call site, so a queued chain remounts
  // with these initial values — no synchronous reset needed in the effect.
  const armed = useArmDelay(650);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // Trigger the bloom on the next frame (an async callback, not
    // synchronously in the effect body).
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

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
          } as CSSProperties
        }
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="spell-unlock-kicker">
          <PixelText
            font={font}
            text={`${SPELL_CLASS_LABEL[cls]} UNLOCKED`}
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
            text={`${SPELL_CATEGORY_LABEL[def.category]}   ${def.manaCost} MANA   ${SPELL_CLASS_STAT_LABEL[cls]} ${def.minStat}`}
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

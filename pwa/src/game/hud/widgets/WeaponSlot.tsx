// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HELD WEAPON and the quick-draw switcher it unrolls — the one HUD piece
// whose insides genuinely cannot be authored as boxes and words, which is why
// it is a widget rather than a panel of elements.
//
// What content still owns, and it is most of it: where the slot sits, what the
// press sounds like, the RING'S COLOUR LADDER (a Lua judgement, so a mod can
// re-grade what "nearly out" means) and the ammunition count, which arrives as
// an authored PART rather than as markup written here.

import { weaponDef } from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl } from "../../assets.ts";
import { weaponAlternatives } from "../../game-screen/hud-model.ts";
import { runCommandOk } from "../../run-commands.ts";
import { WEAPON_CLASS_COLORS } from "../../tiers.ts";
import { weaponSlotColors } from "../bindings.ts";
import type { HudFieldContext } from "../context.ts";
import { playHudEvent } from "../sounds.ts";
import { HudPart } from "./parts.tsx";
import type { HudNodeView } from "../resolve.ts";

export function WeaponSlot({
  ctx,
  view,
  onPress,
}: {
  ctx: HudFieldContext;
  view: HudNodeView;
  onPress: () => void;
}) {
  const { hud, state, assets, font, ui } = ctx;
  const equippedColor = weaponSlotColors(hud);
  // No icon at all means BARE HANDS — the one weapon def that ships without
  // one, because there is nothing in the hand to draw. The slot renders
  // iconless (the ring, the class colour and the switch target all still read),
  // so an unarmed hero gets an empty plate rather than a broken image.
  const iconName = String(ctx.values["hud.weaponIcon"] ?? "");
  const icon = iconName ? spriteDataUrl(assets.sprites, iconName) : undefined;
  // A dry weapon shows an EMPTY ring rather than the 3% stub a nearly-worn one
  // keeps: "you have none" and "you have barely any" are different sentences,
  // and only one of them means the trigger does nothing.
  const gauge = Number(ctx.values["hud.weaponGauge"] ?? 1);
  const hasGauge = ctx.values["hud.hasWeaponGauge"] === true;
  const ringFrac = !hasGauge ? 1 : gauge <= 0 ? 0 : Math.max(0.03, gauge);
  // The ladder is content's (`vitals.gauge_color`); this is only what to draw
  // when a mod's judgement could not answer.
  const ringColor = view.color ?? "#c2ccd6";
  // The other carried weapons, in the order the player asked for (SETTINGS →
  // CONTROLS → QUICK DRAW: the backpack's own order, or best-first for this
  // hero) — the switch targets, shared with the 1-4 hotkeys so both agree on
  // which slot is which.
  const alternatives = weaponAlternatives(state);
  return (
    <div className="wpn-control">
      <button
        type="button"
        className="wpn-slot wpn-slot-main"
        aria-label={view.def.aria ?? "switch-weapon"}
        style={{ background: equippedColor.bg }}
        onClick={onPress}
      >
        {icon ? (
          <img src={icon} alt="" className="pixel-img wpn-slot-img" />
        ) : null}
        <HudPart view={view} part="ammo_count" ctx={ctx} />
      </button>
      {/* The gauge ring drawn around the slot — ammunition for a ranged
          weapon, durability for anything else. */}
      <svg className="wpn-ring" viewBox="0 0 44 44" aria-hidden>
        <circle
          cx="22"
          cy="22"
          r="20"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="3.5"
        />
        <circle
          cx="22"
          cy="22"
          r="20"
          fill="none"
          stroke={ringColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${ringFrac} 1`}
          transform="rotate(-90 22 22)"
          style={{
            filter: `drop-shadow(0 0 1.5px ${ringColor})`,
            transition:
              "stroke-dasharray 280ms cubic-bezier(0.22,1,0.36,1), stroke 200ms linear",
          }}
        />
      </svg>
      {ui.weaponMenuOpen && (
        <div className="wpn-switcher">
          {alternatives.length === 0 ? (
            <PixelText
              font={font}
              text="NO OTHER WEAPONS"
              scale={2}
              color="#9aa3ad"
            />
          ) : (
            alternatives.map(({ item, index, dmg }, order) => {
              const color = WEAPON_CLASS_COLORS[weaponDef(item.defId).class];
              const altIcon = weaponDef(item.defId).icon;
              const wpnIcon = altIcon
                ? spriteDataUrl(assets.sprites, altIcon)
                : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="wpn-slot wpn-switch-slot"
                  aria-label={`equip-${item.defId}`}
                  style={{ borderColor: color.border, background: color.bg }}
                  onClick={() => {
                    if (runCommandOk(state, "equipFromInventory", index)) {
                      playHudEvent("weapon.switch");
                      ctx.actions.toggleWeaponMenu?.(false);
                      ctx.bumpUi();
                    }
                  }}
                >
                  {wpnIcon ? (
                    <img
                      src={wpnIcon}
                      alt=""
                      className="pixel-img wpn-slot-img"
                    />
                  ) : null}
                  {ui.keyHints && order < 4 && (
                    <span className="slot-key">
                      <PixelText
                        font={font}
                        text={String(order + 1)}
                        scale={1}
                        color="#0b0d10"
                      />
                    </span>
                  )}
                  <span className="wpn-switch-dmg">
                    <PixelText
                      font={font}
                      text={formatCompact(dmg)}
                      scale={1}
                    />
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

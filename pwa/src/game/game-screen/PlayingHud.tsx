// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The playing HUD's top chrome: the full-width XP strip (with its kill-heat
// overlay), the spell-status echo, the framed portrait + vitals unit with
// the weapon switcher and bag pouch, the recruited party's portrait rail,
// and the minimap hub column (timer/kills/rampage + the AUTO PILOT panel
// slot). The bottom docks live in their own components (ConsumableDock,
// PowerupDock, SpellBar).

import type { MutableRefObject, ReactNode, RefObject } from "react";

import {
  canOpenInventory,
  equipFromInventory,
  openCompanionPanel,
  openInventory,
  openMap,
  pauseGame,
  weaponDef,
  type GameState,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { type PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { Minimap } from "../Minimap.tsx";
import { pauseMusic } from "../music/index.ts";
import { playUiSound } from "../sfx/index.ts";
import { WEAPON_CLASS_COLORS } from "../tiers.ts";
import { formatTime, weaponAlternatives, type Hud } from "./hud-model.ts";

/** The transient SPELL STATUS echo shown high on the HUD: the name of the
 * spell just cast, or why a cast fizzled. */
export type SpellStatus = {
  text: string;
  tone: "cast" | "fizzle";
  accent: string;
};

export function PlayingHud({
  hud,
  state,
  assets,
  font,
  spellStatus,
  weaponMenuOpen,
  onToggleWeaponMenu,
  keyHints,
  minimapRef,
  xpHeatRef,
  heroAvatar,
  autopilotOverlay,
  userPausedRef,
  bumpUi,
}: {
  hud: Hud;
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  spellStatus: SpellStatus | null;
  weaponMenuOpen: boolean;
  /** Toggle (or close, when a switch lands) the in-HUD weapon switcher. */
  onToggleWeaponMenu: (open: boolean) => void;
  /** Show key caps on the switcher slots (desktop keyboard controls on). */
  keyHints: boolean;
  /** The live minimap canvas — painted by the render loop each frame. */
  minimapRef: RefObject<HTMLCanvasElement | null>;
  /** The XP strip's kill-heat overlay — sized/lit by the render loop. */
  xpHeatRef: RefObject<HTMLDivElement | null>;
  /** The hero-avatar inventory button (shared with the arrival scene). */
  heroAvatar: ReactNode;
  /** The AUTO PILOT control panel, mounted under the minimap while the
   * engine meter runs (GameScreen owns the session it drives). */
  autopilotOverlay: ReactNode;
  /** Latched so BOT VIEW's autopilot won't clear the timer-tap pause before
   * the menu can show (see the sim loop). */
  userPausedRef: MutableRefObject<boolean>;
  bumpUi: () => void;
}) {
  const onOpenBag = () => {
    if (canOpenInventory(state)) {
      onToggleWeaponMenu(false);
      openInventory(state);
      playUiSound(synth, "confirm");
      bumpUi();
    }
  };
  const onOpenCompanion = (id: number) => {
    if (state.phase === "playing") {
      openCompanionPanel(state, id);
      playUiSound(synth, "confirm");
      bumpUi();
    }
  };
  const onOpenMap = () => {
    if (state.phase === "playing") {
      onToggleWeaponMenu(false);
      openMap(state);
      playUiSound(synth, "confirm");
      bumpUi();
    }
  };
  const onPause = () => {
    if (state.phase === "playing") {
      // Latch it as viewer-initiated so BOT VIEW's autopilot won't clear the
      // pause before the menu can show (see the sim loop).
      userPausedRef.current = true;
      pauseGame(state);
      pauseMusic();
      playUiSound(synth, "confirm");
      bumpUi();
    }
  };
  return (
    <div className="game-hud">
      {/* Full-width XP strip along the very top (top-scroller staple).
          The level itself reads off the avatar's corner badge now, so this
          stays a bare progress bar. */}
      <div className="hud-xp">
        <div
          className="hud-xp-fill"
          style={{ width: `${(100 * hud.xp) / hud.xpToNext}%` }}
        />
        {/* The kill-heat overlay: only the freshly-earned slice glows. The
            render loop sizes and lights it straight on the DOM (see
            xpHeatRef) so a kill flashes it without a React re-render. */}
        <div ref={xpHeatRef} className="hud-xp-heat" aria-hidden="true" />
      </div>

      {/* The SPELL STATUS echo — the name of the spell just cast (or why a
          cast fizzled), flashed high and centred so it reads without
          covering the fight. Auto-clears after a beat. */}
      {spellStatus && (
        <div
          className={`spell-status spell-status-${spellStatus.tone}`}
          aria-live="polite"
        >
          <PixelText
            font={font}
            text={spellStatus.text}
            scale={2}
            color={spellStatus.accent}
          />
        </div>
      )}

      <div className="hud-top">
        {/* Left: one framed unit — the hero avatar (inventory button)
            beside HP over the always-on weapon widget, matching the
            center clock unit's border + backdrop — with the recruited
            party's portraits railed underneath (tap one to equip it). */}
        <div className="hud-left">
          <div className="hud-status">
            {/* The portrait and the vitals share ONE framed plate (a sci-fi
                HUD frame sprite backs it as a 9-slice) so the two read as a
                single unit — the bust at left, the color bars nested at its
                right, a touch shorter than the portrait. */}
            <div
              className="hud-portrait-unit"
              style={(() => {
                const frame = spriteDataUrl(assets.sprites, "hud_frame");
                return frame
                  ? { borderImageSource: `url(${frame})` }
                  : undefined;
              })()}
            >
              {heroAvatar}
              {/* The vitals read implicitly by color: red HP on top, blue
                  mana below (casters only), a shorter white stamina sliver
                  at the foot. Same width, butted together; the color IS the
                  label. (Coins live in the inventory view.) */}
              <div className="vital-stack">
                <div className="vital-bar vital-hp">
                  <div
                    className="vital-fill"
                    style={{ width: `${(100 * hud.hp) / hud.maxHp}%` }}
                  />
                </div>
                {hud.isCaster && (
                  <div className="vital-bar vital-mp">
                    <div
                      className="vital-fill"
                      style={{
                        width: `${(100 * hud.mana) / Math.max(1, hud.maxMana)}%`,
                      }}
                    />
                  </div>
                )}
                <div className="vital-bar vital-st">
                  <div
                    className="vital-fill"
                    style={{
                      width: `${(100 * hud.stamina) / hud.maxStamina}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            {/* Below the portrait unit, floating free: the held weapon
                circle and the bag pouch — same size, side by side. */}
            <div className="hud-gear-row">
              {/* The held weapon: a round slot whose ring border IS the
                  durability gauge — it depletes and reddens as the weapon
                  wears, and reads a full teal ring for the unbreakable
                  sidearm. Tapping it opens the weapon switcher (Q). */}
              {(() => {
                const equipped = state.player.equipment.weapon;
                const equippedColor =
                  WEAPON_CLASS_COLORS[weaponDef(equipped.defId).class];
                const icon = spriteDataUrl(
                  assets.sprites,
                  weaponDef(equipped.defId).icon,
                );
                // Durability ring: full teal for the unbreakable sidearm,
                // else the wear fraction ramped steel → amber → red as it
                // runs down.
                const wear = hud.weaponWear;
                const ringFrac = wear === null ? 1 : Math.max(0.03, wear);
                const ringColor =
                  wear === null
                    ? "#7ef0c8"
                    : wear < 0.25
                      ? "#d83a3a"
                      : wear < 0.5
                        ? "#ffb14a"
                        : "#c2ccd6";
                // Other carried weapons, highest damage first — the switch
                // targets, shared with the Q menu / 1-4 hotkeys.
                const alternatives = weaponAlternatives(state);
                return (
                  <div className="wpn-control">
                    <button
                      type="button"
                      className="wpn-slot wpn-slot-main"
                      aria-label="switch-weapon"
                      style={{ background: equippedColor.bg }}
                      onClick={() => {
                        onToggleWeaponMenu(!weaponMenuOpen);
                        playUiSound(synth, "confirm");
                      }}
                    >
                      {icon ? (
                        <img
                          src={icon}
                          alt=""
                          className="pixel-img wpn-slot-img"
                        />
                      ) : null}
                    </button>
                    {/* The durability ring drawn around the slot. */}
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
                    {weaponMenuOpen && (
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
                            const color =
                              WEAPON_CLASS_COLORS[weaponDef(item.defId).class];
                            const wpnIcon = spriteDataUrl(
                              assets.sprites,
                              weaponDef(item.defId).icon,
                            );
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className="wpn-slot wpn-switch-slot"
                                aria-label={`equip-${item.defId}`}
                                style={{
                                  borderColor: color.border,
                                  background: color.bg,
                                }}
                                onClick={() => {
                                  if (equipFromInventory(state, index)) {
                                    playUiSound(synth, "equip");
                                    onToggleWeaponMenu(false);
                                    bumpUi();
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
                                {keyHints && order < 4 && (
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
              })()}
              {/* The bag pouch — the same round slot as the weapon, sitting
                  to its right. Shows the worn bag's icon + free-cell count
                  (red at 0), pulses when a full bag turns loot away, and
                  opens the inventory on tap. */}
              <button
                type="button"
                className={`hud-bag-slot${hud.bagFullHint ? " bag-full" : ""}`}
                aria-label="open-inventory"
                onClick={onOpenBag}
              >
                {(() => {
                  const bag = spriteDataUrl(assets.sprites, hud.bagIcon);
                  return bag ? (
                    <img src={bag} alt="" className="pixel-img hud-bag-img" />
                  ) : null;
                })()}
                <span className="hud-bag-count">
                  <PixelText
                    font={font}
                    text={String(hud.bagFree)}
                    scale={1}
                    color={hud.bagFree === 0 ? "#d83a3a" : "#f4f4f4"}
                  />
                </span>
              </button>
            </div>
          </div>

          {/* The party rail: one clickable portrait per companion under the
            hero's avatar — Diablo-2 style, tap one to open its equip
            screen. A downed companion grays out; the sliver is its hp. */}
          {hud.companions.length > 0 && (
            <div className="companion-portraits">
              {hud.companions.map((companion) => {
                const src = spriteDataUrl(
                  assets.sprites,
                  `${companion.sprite}_0`,
                );
                return (
                  <button
                    key={companion.id}
                    type="button"
                    className={`companion-portrait${companion.downed ? " downed" : ""}`}
                    aria-label={`open-companion-${companion.defId}`}
                    onClick={() => onOpenCompanion(companion.id)}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        className="pixel-img companion-portrait-img"
                      />
                    ) : null}
                    <span className="companion-portrait-hp">
                      <span
                        style={{
                          width: `${Math.round(100 * companion.hpFrac)}%`,
                        }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Top-right: the WoW-style minimap hub. The live fog-of-war map
            sits in a rounded frame, with the run's edge widgets hung off
            it — the survival timer at the inner top (which also PAUSES the
            run, the tap the old clock owned), the kill count as a bare
            number at the inner bottom, and RAMPAGE as a gauge that fills
            and reddens around the border (it replaced the pips). Tapping
            the map body opens the full-screen map (M on desktop). */}
        <div className="hud-clock-stack">
          <Minimap
            font={font}
            hudFont={assets.hudFont}
            canvasRef={minimapRef}
            timerText={formatTime(hud.stats.combatMs)}
            kills={hud.stats.kills}
            menaceStage={hud.menaceStage}
            onExpand={onOpenMap}
            onPause={onPause}
          />

          {/* The AUTO PILOT control + its live coin monitor, tucked under
              the minimap while the engine meter runs (src/game/autopilot.ts)
              — the speed rung, STOP, LOOT, and the draining purse. Sits here
              (not pinned to the top edge) so it clears the Dynamic Island and
              aligns to the minimap column. */}
          {autopilotOverlay}
        </div>
      </div>
    </div>
  );
}

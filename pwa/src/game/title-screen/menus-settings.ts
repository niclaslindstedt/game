// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SETTINGS tree's player-facing screens: the index, and the five pages
// under it — GAMEPLAY, CONTROLS (+ the desktop-only KEY BINDINGS rebind list),
// INTERFACE, VIDEO and AUDIO. DATA lives in menus-data.ts.
//
// THE SPLIT IS THE ESTABLISHED ONE, and it is worth stating because it is the
// only thing keeping a settings tree findable: what the game DOES for you, how
// you TELL it what to do, what the HUD DRAWS, how the picture is PRESENTED, how
// LOUD it is, and where your HEROES live. A player who wants the blood turned
// down opens VIDEO; a player who is tired of wearing every sword they pick up
// opens GAMEPLAY. Nobody hunts, because nobody has to learn this game's own
// filing system.
//
// The order and the wording are `content/mainmenu.yaml`'s; this file is what
// each row does.

import { nsfwAllowed } from "../../app/device-policy.ts";
import { synth } from "../audio.ts";
import { haptics } from "../haptics.ts";
import { DEFAULT_KEYBINDINGS, KEYBIND_ROWS } from "../keybindings.ts";
import { getSettings, updateSettings, type SteeringMode } from "../settings.ts";
import { playUiSound } from "../sfx/ui.ts";
import { FX_RANGES, type FxName } from "../render/postfx.ts";
import { PICKUP_CARD_TIER_ORDER, pickupCardTierLabel } from "../tiers.ts";
import {
  actionRow,
  assembleRows,
  backRow,
  navRow,
  onOffRow,
  sliderRow,
  volumeRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";

/** The STEERING row's three values. Ordered as the row cycles them: the two
 * mouse schemes first (the default and its opposite), then the pad. */
const STEERING_ORDER = ["hover", "aim", "gamepad"] as const;

const STEERING_LABELS: Record<SteeringMode, string> = {
  hover: "FOLLOW CURSOR",
  aim: "AIM & SHOOT",
  gamepad: "GAMEPAD",
};

function nextSteering(current: SteeringMode): SteeringMode {
  const index = STEERING_ORDER.indexOf(current);
  return STEERING_ORDER[(index + 1) % STEERING_ORDER.length] ?? "hover";
}

/** The SETTINGS index: six destinations and the hidden seventh. A plain list of
 * places, each saying what lives there — the reorganisation is only worth
 * anything if the page names tell a player where to look. */
export function buildSettingsMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  return [
    ...assembleRows("settings", {
      gameplay: navRow(ctx, "settings", "gameplay"),
      controls: navRow(ctx, "settings", "controls"),
      interface: navRow(ctx, "settings", "interface"),
      video: navRow(ctx, "settings", "video"),
      audio: navRow(ctx, "settings", "audio"),
      data: navRow(ctx, "settings", "data"),
      // Hidden until the secret sun gesture unlocks it (seven quick taps on the
      // title sun — see use-sun-charge.ts); once found it stays put across
      // launches (persisted via `developerUnlocked`). A production store build
      // ships no developer tooling at all, so the row folds away with it at
      // build time (see `__DEV_TOOLS__`).
      developer:
        __DEV_TOOLS__ && s.developerUnlocked
          ? navRow(ctx, "settings", "developer")
          : null,
    }),
    backRow(ctx, "settings"),
  ];
}

/** SETTINGS → GAMEPLAY: the things the game will do on the player's behalf, and
 * whether the story is allowed to interrupt. */
export function buildGameplayMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  return [
    ...assembleRows("gameplay", {
      "auto-equip": onOffRow(ctx, "gameplay", "auto-equip", "autoEquip"),
      // Two ways to USE a power, not an on/off — so it stays a label-cycling
      // row (a switch would imply powerups can be disabled).
      powerups: actionRow(
        "gameplay",
        "powerups",
        () => {
          playUiSound(synth, "confirm");
          updateSettings({ itemUse: s.itemUse === "auto" ? "manual" : "auto" });
          ctx.bumpSettings();
        },
        {
          value: s.itemUse === "auto" ? "USE ON PICKUP" : "USE MANUALLY",
          state: s.itemUse,
        },
      ),
      // Two ways to READ the switcher — likewise a label-cycling row.
      "quick-draw": actionRow(
        "gameplay",
        "quick-draw",
        () => {
          playUiSound(synth, "confirm");
          updateSettings({
            weaponSwitchOrder: s.weaponSwitchOrder === "dps" ? "bag" : "dps",
          });
          ctx.bumpSettings();
        },
        {
          value: s.weaponSwitchOrder === "dps" ? "BEST FIRST" : "BAG ORDER",
          state: s.weaponSwitchOrder,
        },
      ),
      dialogue: onOffRow(ctx, "gameplay", "dialogue", "dialogue"),
      cutscenes: onOffRow(ctx, "gameplay", "cutscenes", "cutscenes"),
    }),
    backRow(ctx, "gameplay"),
  ];
}

export function buildControlsMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  // The mouse/keys rows are desktop-only, like KEY BINDINGS: touch always
  // steers by holding and dragging, so there is no scheme to configure there
  // (see hasFinePointer). AIM & SHOOT and GAMEPAD both add the AUTO-FIRE row
  // and LOCK the KEYS row at WASD MOVE — the keyboard always walks in those
  // modes, and the greyed row shows that rather than hiding where the movement
  // went.
  const pointer = ctx.hasFinePointer;
  const holds = s.steering === "aim" || s.steering === "gamepad";
  return [
    ...assembleRows("controls", {
      // Named STEERING rather than MOUSE: the row picks between input DEVICES,
      // and "MOUSE: GAMEPAD" would be nonsense.
      steering: pointer
        ? actionRow(
            "controls",
            "steering",
            () => {
              playUiSound(synth, "confirm");
              updateSettings({ steering: nextSteering(s.steering) });
              ctx.bumpSettings();
            },
            { value: STEERING_LABELS[s.steering], state: s.steering },
          )
        : null,
      "auto-fire":
        pointer && holds
          ? onOffRow(ctx, "controls", "auto-fire", "autoFire", {
              // The trigger is a different thing in each mode, so the OFF line
              // names the one the player is actually holding.
              offState: s.steering === "gamepad" ? "button" : "click",
            })
          : null,
      keys: pointer
        ? holds
          ? actionRow(
              "controls",
              "keys",
              () => {
                playUiSound(synth, "back");
              },
              {
                value: "WASD MOVE",
                color: "#5a6068",
                locked: true,
                state: s.steering,
              },
            )
          : actionRow(
              "controls",
              "keys",
              () => {
                playUiSound(synth, "confirm");
                updateSettings({
                  keyboardMove: s.keyboardMove === "on" ? "off" : "on",
                });
                ctx.bumpSettings();
              },
              {
                value: s.keyboardMove === "on" ? "WASD MOVE" : "MOUSE ONLY",
                state: s.keyboardMove === "on" ? "wasd" : "mouse",
              },
            )
        : null,
      // VIBRATION shows only where a buzz can land (see canBuzz), so it never
      // reads as a dead switch on desktop or iOS.
      vibration: ctx.canBuzz
        ? onOffRow(ctx, "controls", "vibration", "vibration", {
            // Audition the new state — a firm tap confirms it is live.
            audition: (on) => on && haptics.vibrate(28),
          })
        : null,
      // Desktop-only: there is no keyboard to rebind on a touch phone.
      keybindings: pointer ? navRow(ctx, "controls", "keybindings") : null,
    }),
    backRow(ctx, "controls"),
  ];
}

export function buildKeybindingsMenu(ctx: MenuContext): MenuEntry[] {
  // Quake-style rebind list: one row per action, its label at the left and the
  // bound key's name far right. Choosing a row arms capture — the next key or
  // mouse button pressed becomes the bind (see TitleScreen's capture handlers).
  // The rows come from the keybinding catalog rather than from the tree, so the
  // tree carries only the RESET row they end with.
  const binds = getSettings().keybindings;
  return [
    ...KEYBIND_ROWS.map(({ action, label, blurb }) => ({
      label,
      aria: rowAria("keybindings", action),
      blurb,
      binding: { code: binds[action], capturing: ctx.captureBind === action },
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setCaptureBind(action);
        ctx.bumpSettings();
      },
    })),
    ...assembleRows("keybindings", {
      reset: actionRow("keybindings", "reset", () => {
        playUiSound(synth, "confirm");
        ctx.setCaptureBind(null);
        updateSettings({ keybindings: { ...DEFAULT_KEYBINDINGS } });
        ctx.bumpSettings();
      }),
    }),
    backRow(ctx, "keybindings"),
  ];
}

/** SETTINGS → INTERFACE: everything the HUD draws over the field, and where it
 * sits. */
export function buildInterfaceMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  return [
    ...assembleRows("interface", {
      "health-bars": onOffRow(ctx, "interface", "health-bars", "healthBars"),
      "xp-float": onOffRow(ctx, "interface", "xp-float", "xpFloat"),
      // A rarity pick (one of seven), not an on/off — so it is a label-cycling
      // row: confirm/click walks up the ladder and wraps back to NORMAL. It
      // names the LOWEST rarity that still pops a framed loot card; quieter
      // finds drop to the corner feed, cutting card noise in a loot flood.
      "item-cards": actionRow(
        "interface",
        "item-cards",
        () => {
          playUiSound(synth, "confirm");
          const order = PICKUP_CARD_TIER_ORDER;
          const next =
            order[(order.indexOf(s.pickupCardsTier) + 1) % order.length]!;
          updateSettings({ pickupCardsTier: next });
          ctx.bumpSettings();
        },
        {
          value: pickupCardTierLabel(s.pickupCardsTier),
          state: s.pickupCardsTier === "regular" ? "every" : "tier",
        },
      ),
      // A two-mode view pick, not an on/off (a switch would imply the minimap
      // can be disabled).
      minimap: actionRow(
        "interface",
        "minimap",
        () => {
          playUiSound(synth, "confirm");
          updateSettings({
            minimapMode: s.minimapMode === "follow" ? "full" : "follow",
          });
          ctx.bumpSettings();
        },
        {
          value: s.minimapMode === "follow" ? "FOLLOW HERO" : "FULL MAP",
          state: s.minimapMode,
        },
      ),
      "quick-bars": actionRow(
        "interface",
        "quick-bars",
        () => {
          playUiSound(synth, "confirm");
          updateSettings({
            powerupSide: s.powerupSide === "right" ? "left" : "right",
          });
          ctx.bumpSettings();
        },
        {
          value: s.powerupSide === "right" ? "LOWER RIGHT" : "LOWER LEFT",
          state: s.powerupSide,
        },
      ),
    }),
    backRow(ctx, "interface"),
  ];
}

/** Which post-fx knob each VIDEO row drives. The row ids are the tree's
 * (kebab-case); the settings keys are the renderer's. */
const FX_ROWS: Record<string, FxName> = {
  bloom: "bloom",
  "color-grade": "colorGrade",
  vignette: "vignette",
  "depth-haze": "depthHaze",
};

/** One VIDEO row: a 0→max drag track over one presentation knob, showing its
 * amount as a percentage of the shipped look rather than a raw multiplier —
 * "BLOOM 100%" says "as the game is made" where "1.00×" says nothing. */
function fxRow(ctx: MenuContext, id: string): MenuEntry {
  const name = FX_ROWS[id]!;
  const range = FX_RANGES[name];
  const value = getSettings()[name];
  const set = (v: number) => {
    updateSettings({ [name]: v });
    ctx.bumpSettings();
  };
  // Shown against the SHIPPED default, not against the slider's top end: the
  // default is the number a player is deciding to move away from.
  const pct = Math.round((value / range.default) * 100);
  return sliderRow(
    "video",
    id,
    {
      readout: value <= 0 ? "OFF" : `${pct}%`,
      pos: (value - range.min) / (range.max - range.min),
      set: (pos: number) => set(range.min + pos * (range.max - range.min)),
      nudge: (dir: number) =>
        set(getSettings()[name] + dir * (range.max - range.min) * 0.05),
    },
    { state: value <= 0 ? "off" : "on" },
  );
}

/**
 * SETTINGS → VIDEO: how the field is PRESENTED — the four knobs of
 * `render/postfx.ts`, each a drag track from OFF through the shipped look and
 * on past it for a player who wants it laid on thick, plus the gore switch.
 *
 * Every row is honest about costing something, which is why they are all here
 * rather than folded into INTERFACE: this is the page you come to when the
 * phone is warm.
 */
export function buildVideoMenu(ctx: MenuContext): MenuEntry[] {
  return [
    ...assembleRows("video", {
      // Dropped entirely when the DEVICE says no mature content (iOS Settings →
      // <app> → MATURE CONTENT — see app/device-policy.ts). The gate outranks
      // this row, so leaving it would be a switch that visibly does nothing,
      // and a parental control the game still offers to turn the gore back on
      // reads as one the player can defeat.
      "extra-gore": nsfwAllowed()
        ? onOffRow(ctx, "video", "extra-gore", "extraGore")
        : null,
      bloom: fxRow(ctx, "bloom"),
      "color-grade": fxRow(ctx, "color-grade"),
      vignette: fxRow(ctx, "vignette"),
      "depth-haze": fxRow(ctx, "depth-haze"),
      // Five knobs is well past where a RESET row earns its place: a player who
      // has dragged all of them somewhere odd has no other way back to the look
      // the game shipped with.
      reset: actionRow("video", "reset", () => {
        playUiSound(synth, "confirm");
        updateSettings({
          bloom: FX_RANGES.bloom.default,
          colorGrade: FX_RANGES.colorGrade.default,
          vignette: FX_RANGES.vignette.default,
          depthHaze: FX_RANGES.depthHaze.default,
          // The gore switch is on this page, so "the way the game shipped" has
          // to include it — a reset that quietly skipped the one row a player
          // is most likely to have moved would be a lie on its own help line.
          ...(nsfwAllowed() ? { extraGore: "on" as const } : {}),
        });
        ctx.bumpSettings();
      }),
    }),
    backRow(ctx, "video"),
  ];
}

export function buildAudioMenu(ctx: MenuContext): MenuEntry[] {
  // Both volumes are drag sliders (see volumeRow). The theme follows the music
  // level live; the SFX level is auditioned by the "move" cue the arrows
  // already play, and by every other sound the slider doesn't mute. MUTE sits
  // on top as a plain ON/OFF switch: it silences everything while the sliders
  // keep their values, so unmuting restores the exact mix.
  return [
    ...assembleRows("audio", {
      mute: onOffRow(ctx, "audio", "mute", "muted", {
        // The row's own confirm cue plays before the flip, so it is swallowed
        // when muting; on UN-mute, sound out an extra cue after the flip so the
        // player hears audio return at their kept levels.
        audition: (muted) => {
          if (!muted) playUiSound(synth, "confirm");
        },
      }),
      music: volumeRow(ctx, "audio", "music", "musicVolume"),
      sfx: volumeRow(ctx, "audio", "sfx", "sfxVolume"),
    }),
    backRow(ctx, "audio"),
  ];
}

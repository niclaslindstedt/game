// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SETTINGS tree's player-facing screens: the SETTINGS index (a plain menu
// of destinations), CONTROLS (+ the desktop-only KEY BINDINGS rebind list),
// DISPLAY, and SOUND.

import { synth } from "../audio.ts";
import { haptics } from "../haptics.ts";
import { DEFAULT_KEYBINDINGS, KEYBIND_ROWS } from "../keybindings.ts";
import { getSettings, updateSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import { PICKUP_CARD_TIER_ORDER, pickupCardTierLabel } from "../tiers.ts";
import {
  backTo,
  onOffRow,
  volumeRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";

export function buildSettingsMenu(ctx: MenuContext): MenuEntry[] {
  // A plain list of destinations — the labels say it all, so these rows
  // carry no subtitle (the submenus they open hold the real settings).
  const s = getSettings();
  return [
    {
      label: "CONTROLS",
      aria: "settings-controls",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("controls");
        ctx.setCursor(0);
      },
    },
    {
      label: "DISPLAY",
      aria: "settings-display",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("display");
        ctx.setCursor(0);
      },
    },
    // Music and sound-fx volume live together in their own SOUND submenu,
    // keeping the SETTINGS list short.
    {
      label: "SOUND",
      aria: "settings-sound",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("sound");
        ctx.setCursor(0);
      },
    },
    // Character transfer lives in its own DATA submenu (EXPORT / IMPORT),
    // keeping the SETTINGS list short. It sits with the rest of the
    // device-level configuration.
    {
      label: "DATA",
      aria: "settings-data",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setScreen("data");
        ctx.setCursor(0);
      },
    },
    // The DEVELOPER row is hidden until the title moon's secret long-press
    // unlocks it (see TitleBackdrop's moon hold); once found it stays put
    // across launches (persisted via `developerUnlocked`).
    ...(s.developerUnlocked
      ? [
          {
            label: "DEVELOPER",
            aria: "settings-developer",
            action: () => {
              playUiSound(synth, "confirm");
              ctx.setScreen("developer");
              ctx.setCursor(0);
            },
          },
        ]
      : []),
    backTo(ctx, "main", ctx.hasResume ? 4 : 3),
  ];
}

export function buildControlsMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  return [
    // The mouse rows are desktop-only, like KEY BINDINGS below: touch
    // always steers by holding and dragging, so there's no mouse mode
    // (or keyboard) to configure there (see hasFinePointer). AIM & SHOOT
    // adds the AUTO-FIRE row and LOCKS the KEYS row at WASD MOVE — the
    // keyboard always walks in that mode, and the greyed row shows that
    // rather than hiding where the movement went — so the list is one
    // row longer there (KEY BINDINGS' back target accounts for it).
    ...(ctx.hasFinePointer
      ? [
          {
            label: "MOUSE",
            value: s.steering === "hover" ? "FOLLOW CURSOR" : "AIM & SHOOT",
            aria: "controls-steering",
            blurb:
              s.steering === "hover"
                ? "THE CURSOR LEADS - CLICK USES AN ITEM"
                : "WASD WALKS - THE POINTER AIMS - CLICK SHOOTS",
            action: () => {
              playUiSound(synth, "confirm");
              updateSettings({
                steering: s.steering === "hover" ? "aim" : "hover",
              });
              ctx.bumpSettings();
            },
          },
          ...(s.steering === "aim"
            ? [
                onOffRow(
                  ctx,
                  "autoFire",
                  "AUTO-FIRE",
                  "controls-auto-fire",
                  "SHOOT ON SIGHT - OFF FIRES ONLY WHILE YOU CLICK",
                ),
                {
                  // Locked at WASD MOVE: AIM & SHOOT always walks by
                  // keyboard, and the greyed row SHOWS that instead of
                  // hiding where the movement went. Choosing it buzzes,
                  // like a locked level row.
                  label: "KEYS",
                  value: "WASD MOVE",
                  aria: "controls-keyboard-move",
                  color: "#5a6068",
                  locked: true,
                  blurb: "AIM & SHOOT ALWAYS WALKS BY KEYBOARD",
                  action: () => {
                    playUiSound(synth, "back");
                  },
                },
              ]
            : [
                {
                  label: "KEYS",
                  value: s.keyboardMove === "on" ? "WASD MOVE" : "MOUSE ONLY",
                  aria: "controls-keyboard-move",
                  blurb:
                    s.keyboardMove === "on"
                      ? "STEER WITH THE KEYBOARD - REBIND IN KEY BINDINGS"
                      : "STEERING STAYS ON THE MOUSE",
                  action: () => {
                    playUiSound(synth, "confirm");
                    updateSettings({
                      keyboardMove: s.keyboardMove === "on" ? "off" : "on",
                    });
                    ctx.bumpSettings();
                  },
                },
              ]),
        ]
      : []),
    {
      label: "POWERUPS",
      value: s.itemUse === "auto" ? "USE ON PICKUP" : "USE MANUALLY",
      aria: "controls-item-use",
      blurb:
        s.itemUse === "auto"
          ? "POWERS FIRE THE MOMENT YOU GRAB THEM"
          : "TAP A POWERUP SLOT / CLICK / E / 1-3 SPENDS ONE",
      action: () => {
        playUiSound(synth, "confirm");
        updateSettings({
          itemUse: s.itemUse === "auto" ? "manual" : "auto",
        });
        ctx.bumpSettings();
      },
    },
    onOffRow(
      ctx,
      "autoEquip",
      "AUTO-EQUIP",
      "controls-auto-equip",
      "ON WEARS STRONGER FINDS AT ONCE - OFF KEEPS THEM IN THE BAG",
    ),
    {
      label: "QUICK BARS",
      value: s.powerupSide === "right" ? "LOWER RIGHT" : "LOWER LEFT",
      aria: "controls-powerup-side",
      blurb: "WHICH CORNER THE BIG POWERUP SLOTS SIT IN",
      action: () => {
        playUiSound(synth, "confirm");
        updateSettings({
          powerupSide: s.powerupSide === "right" ? "left" : "right",
        });
        ctx.bumpSettings();
      },
    },
    // KEY BINDINGS is desktop-only — there's no keyboard to rebind on a
    // touch phone, so the row is hidden there (see hasFinePointer).
    ...(ctx.hasFinePointer
      ? [
          {
            label: "KEY BINDINGS",
            aria: "controls-keybindings",
            blurb: "REBIND EVERY DESKTOP KEY - MOVEMENT, ACTIONS, THE DOCK",
            action: () => {
              playUiSound(synth, "confirm");
              ctx.setScreen("keybindings");
              ctx.setCursor(0);
            },
          },
        ]
      : []),
    // VIBRATION shows only where a buzz can land (see canBuzz), so it never
    // reads as a dead switch on desktop or iOS. Where it shows, it always
    // can buzz — so the row drops the old "(NO IOS)" caveat.
    ...(ctx.canBuzz
      ? [
          onOffRow(
            ctx,
            "vibration",
            "VIBRATION",
            "controls-vibration",
            "BUZZ ON HITS, DEATH, MENUS & DIALOGUE - HARDER BLOWS HIT HARDER",
            // Audition the new state — a firm tap confirms it's live.
            (on) => on && haptics.vibrate(28),
          ),
        ]
      : []),
    backTo(ctx, "settings", 0),
  ];
}

export function buildKeybindingsMenu(ctx: MenuContext): MenuEntry[] {
  // Quake-style rebind list: one row per action, its label at the left and
  // the bound key's name far right. Choosing a row arms capture — the next
  // key or mouse button pressed becomes the bind (see TitleScreen's capture
  // handlers).
  const binds = getSettings().keybindings;
  return [
    ...KEYBIND_ROWS.map(({ action, label, blurb }) => ({
      label,
      aria: `keybind-${action}`,
      blurb,
      binding: { code: binds[action], capturing: ctx.captureBind === action },
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setCaptureBind(action);
        ctx.bumpSettings();
      },
    })),
    {
      label: "RESET TO DEFAULTS",
      aria: "keybind-reset",
      blurb: "RESTORE THE SHIPPED WASD + ACTION KEY SCHEME",
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setCaptureBind(null);
        updateSettings({ keybindings: { ...DEFAULT_KEYBINDINGS } });
        ctx.bumpSettings();
      },
    },
    // Land back on the KEY BINDINGS row in CONTROLS (after MOUSE /
    // [AUTO-FIRE /] KEYS / POWERUPS / AUTO-EQUIP / QUICK BARS — this screen
    // is desktop-only, so the mouse rows are always shown, and AIM &
    // SHOOT's extra AUTO-FIRE row shifts the index by one).
    backTo(ctx, "controls", getSettings().steering === "aim" ? 6 : 5),
  ];
}

export function buildDisplayMenu(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  return [
    onOffRow(
      ctx,
      "xpFloat",
      "XP ON KILL",
      "display-xp-float",
      "FLOAT A BLUE +N XP OFF EACH KILL",
    ),
    onOffRow(
      ctx,
      "healthBars",
      "HEALTH BARS",
      "display-health-bars",
      "SHOW A TINY HP BAR OVER EVERY WOUNDED MOB",
    ),
    // A rarity pick (one of seven), not an on/off — so it's a label-cycling
    // row: confirm/click walks up the ladder and wraps back to NORMAL. It
    // names the LOWEST rarity that still pops a framed loot card; quieter
    // finds drop to the corner feed, cutting card noise in a loot flood.
    {
      label: "ITEM CARDS",
      value: pickupCardTierLabel(s.pickupCardsTier),
      aria: "display-pickup-cards",
      blurb: "POP A LOOT CARD ONLY FOR THIS RARITY AND BETTER",
      action: () => {
        playUiSound(synth, "confirm");
        const order = PICKUP_CARD_TIER_ORDER;
        const next =
          order[(order.indexOf(s.pickupCardsTier) + 1) % order.length]!;
        updateSettings({ pickupCardsTier: next });
        ctx.bumpSettings();
      },
    },
    // A two-mode view pick, not an on/off — so it stays a label-cycling row
    // (a switch would imply the minimap can be disabled).
    {
      label: "MINIMAP",
      value: s.minimapMode === "follow" ? "FOLLOW HERO" : "FULL MAP",
      aria: "display-minimap",
      blurb:
        s.minimapMode === "follow"
          ? "A CLOSE-UP HOVERS OVER THE HERO AS HE MOVES"
          : "THE WHOLE LEVEL FITS IN THE FRAME",
      action: () => {
        playUiSound(synth, "confirm");
        updateSettings({
          minimapMode: s.minimapMode === "follow" ? "full" : "follow",
        });
        ctx.bumpSettings();
      },
    },
    onOffRow(
      ctx,
      "dialogue",
      "DIALOGUE",
      "display-dialogue",
      "PLAY IN-WORLD TALK: ARRIVALS, THOUGHTS, LORE",
    ),
    onOffRow(
      ctx,
      "cutscenes",
      "CUTSCENES",
      "display-cutscenes",
      "PLAY THE PRELUDE SCENES THAT OPEN A LEVEL",
    ),
    // Land back on the DISPLAY row in SETTINGS (index 1, after CONTROLS).
    backTo(ctx, "settings", 1),
  ];
}

export function buildSoundMenu(ctx: MenuContext): MenuEntry[] {
  // Both volumes are drag sliders now (see volumeRow). The theme follows
  // the music level live; the SFX level is auditioned by the "move" cue the
  // arrows already play, and by every other sound the slider doesn't mute.
  // MUTE sits on top as a plain ON/OFF switch: it silences everything while
  // the sliders keep their values, so unmuting restores the exact mix.
  return [
    onOffRow(
      ctx,
      "muted",
      "MUTE",
      "sound-mute",
      "SILENCE ALL — SLIDERS KEEP THEIR LEVELS",
      // The row's own confirm cue plays before the flip, so it's swallowed
      // when muting; on UN-mute, sound out an extra cue after the flip so
      // the player hears audio return at their kept levels.
      (muted) => {
        if (!muted) playUiSound(synth, "confirm");
      },
    ),
    volumeRow(
      ctx,
      "musicVolume",
      "MUSIC",
      "sound-music-volume",
      "THE THEME FOLLOWS ALONG",
    ),
    volumeRow(
      ctx,
      "sfxVolume",
      "SOUND FX",
      "sound-sfx-volume",
      "BLASTERS, GHOSTS, PICKUPS",
    ),
    // Land back on the SOUND row in SETTINGS (after CONTROLS / DISPLAY).
    backTo(ctx, "settings", 2),
  ];
}

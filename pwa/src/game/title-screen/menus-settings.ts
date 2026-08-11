// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SETTINGS tree's player-facing screens: the index, and the five pages
// under it — GAMEPLAY, CONTROLS (+ the desktop-only KEY BINDINGS rebind list),
// INTERFACE, GORE and AUDIO. DATA lives in menus-data.ts.
//
// THE SPLIT IS THE ESTABLISHED ONE, and it is worth stating because it is the
// only thing keeping a settings tree findable: what the game DOES for you, how
// you TELL it what to do, what the HUD DRAWS, how much of a MESS a kill makes,
// how LOUD it is, and where your HEROES live. A player who wants the blood
// turned down opens GORE; a player who is tired of wearing every sword they
// pick up opens GAMEPLAY. Nobody hunts, because nobody has to learn this game's
// own filing system.
//
// The order and the wording are `content/mainmenu.yaml`'s; this file is what
// each row does.

import { clamp, clamp01 } from "@game/lib/vec.ts";

import { nsfwAllowed } from "../../app/device-policy.ts";
import { voiceBridgeAvailable } from "../../app/net-bridge.ts";
import { synth } from "../audio.ts";
import { haptics } from "../haptics.ts";
import { KEYBIND_ROWS } from "../keybindings.ts";
import {
  GORE_SWITCHES,
  VOICE_MIC_GAIN_MAX,
  getSettings,
  shippedKeybindings,
  updateSettings,
  type GameSettings,
  type GoreSwitchKey,
  type SteeringMode,
} from "../settings.ts";
import { playUiSound } from "../sfx/ui.ts";
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
      // Absent when the page behind it would be blank. CONTROLS is the one
      // settings page that can empty itself out: every scheme row on it is
      // desktop-only (touch always steers by holding and dragging) and the one
      // row that isn't needs a motor, so a touch device with no buzz — iOS in a
      // browser or an installed PWA — reaches a page holding nothing but BACK.
      // Asking the page itself rather than re-testing the device is what keeps
      // the two from drifting: a row added to CONTROLS lights this back up on
      // its own.
      controls: controlsRows(ctx).length
        ? navRow(ctx, "settings", "controls")
        : null,
      interface: navRow(ctx, "settings", "interface"),
      // Dropped entirely when the DEVICE says no mature content (iOS Settings →
      // <app> → MATURE CONTENT — see app/device-policy.ts). The gate outranks
      // every switch behind this row, so leaving it would open a page of
      // controls that visibly do nothing, and a parental control the game still
      // offers to turn the gore back on reads as one the player can defeat.
      gore: nsfwAllowed() ? navRow(ctx, "settings", "gore") : null,
      audio: navRow(ctx, "settings", "audio"),
      // VOICE CHAT only where the build carries it — the `voice` capability,
      // which the depot build has and a plain download does not. Hidden rather
      // than locked, because unlike GORE this is not a control somebody took
      // away from the player: on a build without it there is no microphone
      // feature to explain, and a locked row would advertise one that does not
      // exist in this copy of the game.
      voice: voiceBridgeAvailable() ? navRow(ctx, "settings", "voice") : null,
      data: navRow(ctx, "settings", "data"),
      // Hidden until the secret sun gesture unlocks it (sixteen quick taps on
      // the title sun to arm it, then the click race — see use-sun-charge.ts); once
      // found it stays put across launches (persisted via `developerUnlocked`).
      // A production store build ships no developer tooling at all, so the row
      // folds away with it at build time (see `__DEV_TOOLS__`).
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
      // Touch devices only — the feature IS a touch gesture, so on a
      // mouse-only desktop the row would be a dead switch. `hasTouch` rather
      // than `!hasFinePointer`, because a touch laptop has both and the
      // gesture works there.
      "swipe-bars": ctx.hasTouch
        ? onOffRow(ctx, "gameplay", "swipe-bars", "swipeBars")
        : null,
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
      // Beside CUTSCENES because it is the same kind of answer — whether the
      // game hands you something to sit through between one place and the next.
      minigames: onOffRow(ctx, "gameplay", "minigames", "minigames"),
      "death-scenes": onOffRow(ctx, "gameplay", "death-scenes", "deathScenes"),
    }),
    backRow(ctx, "gameplay"),
  ];
}

/**
 * SETTINGS → CONTROLS's own rows — everything above its BACK row.
 *
 * Split out from the page so the SETTINGS index can ask whether there is
 * anything ON it (see `buildSettingsMenu`), rather than repeating this
 * screen's device tests one level up where they would quietly drift.
 */
function controlsRows(ctx: MenuContext): MenuEntry[] {
  const s = getSettings();
  // The mouse/keys rows are desktop-only, like KEY BINDINGS: touch always
  // steers by holding and dragging, so there is no scheme to configure there
  // (see hasFinePointer). AIM & SHOOT and GAMEPAD both add the AUTO-FIRE row
  // and LOCK the KEYS row at WASD MOVE — the keyboard always walks in those
  // modes, and the greyed row shows that rather than hiding where the movement
  // went.
  const pointer = ctx.hasFinePointer;
  const holds = s.steering === "aim" || s.steering === "gamepad";
  return assembleRows("controls", {
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
  });
}

export function buildControlsMenu(ctx: MenuContext): MenuEntry[] {
  return [...controlsRows(ctx), backRow(ctx, "controls")];
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
        updateSettings({ keybindings: shippedKeybindings() });
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

/** Which switch each GORE row drives. The row ids are the tree's, the keys are
 * the settings'; `gore-gate.ts` is what reads them, and it is the only thing
 * that does. */
const GORE_ROWS = {
  blood: "goreBlood",
  ecto: "goreEcto",
  sparks: "goreSparks",
  cosmic: "goreCosmic",
  cleaves: "goreCleaves",
  gibs: "goreGibs",
  "hero-soak": "goreSoak",
  bootprints: "goreTracks",
} as const;

/** The two rows that are BLOOD's own art in blood's own colours, and so have
 * nothing to do once HUMAN GORE is off. */
const BLOOD_ONLY = ["hero-soak", "bootprints"] as const;

/**
 * SETTINGS → GORE: one switch per kind of gore.
 *
 * The page exists because "is this too much" is not one question — see the
 * `GoreSwitch` doc in settings.ts for the three groups and why the families are
 * separate rows at all. The whole page is behind the device's MATURE CONTENT
 * switch, which is why nothing here re-checks it: `buildVideoMenu` does not
 * offer the way in when the guardian has said no.
 *
 * BLOODY HERO and BOOTPRINTS are shown LOCKED rather than hidden while HUMAN
 * GORE is off. That is the same call the CONTROLS page's KEYS row makes: a row that
 * vanishes leaves a player hunting for a setting they remember, where a greyed
 * one with a line under it saying why is an answer.
 */
export function buildGoreMenu(ctx: MenuContext): MenuEntry[] {
  const settings = getSettings();
  const sfw = settings.sfwMode === "on";
  const bloodOff = settings.goreBlood !== "on";
  const rows: Record<string, MenuEntry | null> = {};
  rows["sfw-mode"] = onOffRow(ctx, "gore", "sfw-mode", "sfwMode");
  for (const [id, key] of Object.entries(GORE_ROWS)) {
    const locked =
      sfw || (bloodOff && (BLOOD_ONLY as readonly string[]).includes(id));
    rows[id] = locked
      ? actionRow(
          "gore",
          id,
          () => {
            playUiSound(synth, "back");
          },
          {
            value: sfw ? "STARDUST" : "OFF",
            color: "#5a6068",
            locked: true,
            state: sfw ? "sfw" : "locked",
          },
        )
      : onOffRow(ctx, "gore", id, key);
  }
  // Nine switches is well past where a RESET row earns its place — and this is
  // the page a player most easily leaves in a state they cannot reconstruct
  // from memory.
  rows.reset = actionRow("gore", "reset", () => {
    playUiSound(synth, "confirm");
    updateSettings({
      sfwMode: "off",
      ...Object.fromEntries(GORE_SWITCHES.map((key) => [key, "on"])),
    } as Partial<Record<GoreSwitchKey, "on">> & { sfwMode: "off" });
    ctx.bumpSettings();
  });
  return [...assembleRows("gore", rows), backRow(ctx, "gore")];
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

/**
 * SETTINGS → VOICE CHAT: the microphone, and how loud the party is.
 *
 * **THIS PAGE IS NOT PART OF AUDIO, AND THE SPLIT IS THE POINT.** AUDIO answers
 * "how loud"; this answers "is the game listening to my room". They are
 * different kinds of question, they are gated on different things (this page
 * exists only on a build stamped with the `voice` capability), and the levels
 * here are deliberately outside the MUTE switch on that other page — muting the
 * game silences blasters and music, not the people you are playing with.
 *
 * The MODE row is a label-cycling row rather than a switch for the same reason
 * POWERUPS is: there are three answers, and a switch would imply the middle one
 * does not exist.
 */
export function buildVoiceMenu(ctx: MenuContext): MenuEntry[] {
  const voice = getSettings().voice;
  const set = (patch: Partial<GameSettings["voice"]>) => {
    updateSettings({ voice: { ...getSettings().voice, ...patch } });
    ctx.bumpSettings();
  };
  const openMic = voice.mode === "open";
  return [
    ...assembleRows("voice", {
      mode: actionRow(
        "voice",
        "mode",
        () => {
          playUiSound(synth, "confirm");
          // OFF → PUSH TO TALK → OPEN MIC → OFF. In that order because it is
          // the order of increasing exposure: each press opens the microphone a
          // little further, and nobody lands on "always transmitting" by
          // pressing a row once.
          set({
            mode:
              voice.mode === "off"
                ? "ptt"
                : voice.mode === "ptt"
                  ? "open"
                  : "off",
          });
        },
        {
          value:
            voice.mode === "off"
              ? "OFF"
              : voice.mode === "ptt"
                ? "PUSH TO TALK"
                : "OPEN MIC",
          state: voice.mode,
        },
      ),
      // THEIR voices first: it is the row a player reaches for mid-session
      // ("I can barely hear you"), and it is the only one that does something
      // even when this player never speaks.
      volume: sliderRow("voice", "volume", {
        readout: `${Math.round(voice.outVolume * 100)}%`,
        pos: voice.outVolume,
        set: (pos) => set({ outVolume: Math.round(clamp01(pos) * 100) / 100 }),
        nudge: (dir) =>
          set({
            outVolume:
              Math.round(clamp01(voice.outVolume + dir * 0.05) * 100) / 100,
          }),
      }),
      // …then YOUR microphone. The readout is a multiplier rather than a
      // percentage because 1 is the device's own level (what the platform's auto
      // gain already decided) and the range goes both ways around it — "120%"
      // would imply a ceiling of 100 that this slider does not have.
      mic: sliderRow("voice", "mic", {
        readout: `${voice.micGain.toFixed(1)}×`,
        pos: voice.micGain / VOICE_MIC_GAIN_MAX,
        set: (pos) =>
          set({
            micGain: Math.round(clamp01(pos) * VOICE_MIC_GAIN_MAX * 10) / 10,
          }),
        nudge: (dir) =>
          set({
            micGain: clamp(
              Math.round((voice.micGain + dir * 0.1) * 10) / 10,
              0,
              VOICE_MIC_GAIN_MAX,
            ),
          }),
      }),
      // The gate only OPEN MIC reads. Shown LOCKED in the other two modes
      // rather than hidden — the same treatment a locked KEYS row gets, so the
      // player can see where the control went instead of wondering whether the
      // page changes shape behind their back.
      threshold: openMic
        ? sliderRow(
            "voice",
            "threshold",
            {
              readout: `${Math.round(voice.threshold * 100)}%`,
              pos: voice.threshold,
              set: (pos) =>
                set({ threshold: Math.round(clamp01(pos) * 100) / 100 }),
              nudge: (dir) =>
                set({
                  threshold:
                    Math.round(clamp01(voice.threshold + dir * 0.02) * 100) /
                    100,
                }),
            },
            { state: "open" },
          )
        : actionRow(
            "voice",
            "threshold",
            () => {
              playUiSound(synth, "back");
            },
            { value: "—", color: "#5a6068", locked: true, state: "idle" },
          ),
    }),
    backRow(ctx, "voice"),
  ];
}

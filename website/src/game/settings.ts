// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-facing settings (menu: SETTINGS): control scheme and audio
// volumes. Persisted to localStorage so an installed PWA keeps them across
// launches; defaults adapt to the device — touch-first players get
// hold-to-steer with instant item use, mouse players get cursor steering
// with click-to-use.

import {
  BALANCE_TUNING_DEFAULTS,
  setAutoEquipEnabled,
  setAutoStatGainsEnabled,
  setBalanceTuning,
  type BalanceTuning,
} from "@game/core";

import { storageKey } from "../identity.ts";

import { setAudioVolumes } from "./audio.ts";
import { setHapticsEnabled } from "./haptics.ts";

/** How the mouse steers: chase the cursor, or classic hold-to-steer.
 * (Touch always steers by holding — this only changes mouse behavior.) */
export type SteeringMode = "hover" | "hold";

/** Ability pickups: pop the moment they are touched, or bank into the
 * powerup dock until the player taps a slot (or click / E). */
export type ItemUseMode = "auto" | "manual";

/** Gear finds: `on` equips a picked-up piece that beats what's worn on the
 * spot (the default); `off` banks every find to the bag so the player equips
 * by hand. Applied to the engine via `setAutoEquipEnabled` — it gates the
 * on-pickup path only, so the inventory AUTO-EQUIP button still works. */
export type AutoEquip = "on" | "off";

/** Which bottom corner the big powerup dock sits in — mirror it for the
 * off hand. Defaults to the lower-left. */
export type PowerupSide = "left" | "right";

/** Desktop keyboard movement: `on` lets WASD/arrows drive the walk (Shift
 * runs) — while a key is held it steers, and the moment no key is down the
 * mouse takes back over (cursor-follow or hold per the steering setting), so
 * the two coexist. `off` leaves steering to the pointer alone. Touch devices
 * ignore this. */
export type KeyboardMove = "on" | "off";

/** Vibration feedback on kills (scaled by mob rarity). `off` silences it;
 * on iOS — no Vibration API — it is a noop regardless (see haptics.ts). */
export type Vibration = "on" | "off";

/** DEBUG mode: a developer-only toggle. `on` shows the in-run FPS meter
 * (GameScreen `showFps` — the same readout `?debug` forces on) and is the
 * hook future developer diagnostics wire to (a live-state overlay, extra
 * logging). Reached through the hidden DEVELOPER menu (see
 * `developerUnlocked`). */
export type DebugMode = "on" | "off";

/** AUTO LEVEL STATS: a developer feature flag for the automatic per-level
 * base-stat growth (the WoW-style gains a ding hands the hero on its own,
 * underneath the chosen point — see the engine's leveling.ts). Opt-in: `off`
 * (the default) means a ding grants only the chosen point; `on` restores the
 * free gains AND the horde's compensating hp scaling in lockstep (they derive
 * from the same rule), so the two switch together and the balance stays whole.
 * Applied to the engine via `setAutoStatGainsEnabled`. */
export type AutoLevelStats = "on" | "off";

/** CHARACTER WEAPON: a developer feature flag for drawing the held weapon on
 * the hero SPRITE in the field (the paper-doll — see paper-doll.ts /
 * render.ts). The worn armor always draws; only the held weapon is gated,
 * since posing/swinging it convincingly is the hard part. Opt-in: `off` (the
 * default) leaves the field hero empty-handed but still armored; `on` arms
 * him. The HUD avatar and inventory portrait stay armed regardless. */
export type CharacterWeapon = "on" | "off";

/** WEAPON SWING: an experimental developer feature flag that animates the
 * field hero's held weapon on each attack — a blade whips through its slash
 * arc, a gun recoils, a wand thrusts on the cast — timed to the swing/muzzle
 * effect so it reads as the weapon actually being used (see render.ts
 * `drawPlayer`). A pure render concern, like CHARACTER WEAPON, and it only
 * shows when that flag is on too (there is no held weapon to swing otherwise).
 * Opt-in: `off` (the default) leaves the weapon posed statically. */
export type WeaponSwing = "on" | "off";

/** XP ON KILL: a display preference (SETTINGS → DISPLAY) for the blue "+N XP"
 * combat text that floats off a corpse on each kill (emitted in GameScreen).
 * `on` (the default) keeps it; `off` silences it for a cleaner field. */
export type XpFloat = "on" | "off";

/** HEALTH BARS: a display preference (SETTINGS → DISPLAY) for a small hp bar
 * drawn over every wounded mob's head (see render.ts). `off` (the default)
 * keeps the field clean — bosses and elites still show their bars once hurt as
 * always; `on` extends a tiny few-pixel bar to regular minions too. */
export type HealthBars = "on" | "off";

export type GameSettings = {
  steering: SteeringMode;
  itemUse: ItemUseMode;
  /** Equip stronger finds on pickup, or bank them to the bag (see AutoEquip). */
  autoEquip: AutoEquip;
  powerupSide: PowerupSide;
  keyboardMove: KeyboardMove;
  /**
   * Desktop keys that spend from the consumable dock (`KeyboardEvent.key`,
   * lowercased): `keyMedkit` heals with the best medkit held, `keyStamina`
   * drinks a stamina potion. Default Z / X; rebindable in SETTINGS → CONTROLS.
   * Touch devices use the on-screen slots and ignore these.
   */
  keyMedkit: string;
  keyStamina: string;
  vibration: Vibration;
  /** 0–1 master volumes, applied via audio.ts. */
  musicVolume: number;
  sfxVolume: number;
  /** The DEVELOPER menu is hidden until the title moon's secret long-press
   * detonates it (see TitleScreen `startMoonHold`); this latches that unlock so
   * the menu stays available across launches once discovered. */
  developerUnlocked: boolean;
  /** Developer DEBUG toggle — shows the in-run FPS meter (see DebugMode). */
  debug: DebugMode;
  /** Developer flag: automatic per-level base-stat growth (see AutoLevelStats). */
  autoLevelStats: AutoLevelStats;
  /** Developer flag: held weapon on the field hero (see CharacterWeapon). */
  characterWeapon: CharacterWeapon;
  /** Developer flag: animate the held weapon on attack (see WeaponSwing). */
  weaponSwing: WeaponSwing;
  /** Display preference: floating "+N XP" popups on kills (see XpFloat). */
  xpFloat: XpFloat;
  /** Display preference: hp bars over regular mobs' heads (see HealthBars). */
  healthBars: HealthBars;
  /** Developer BALANCE multipliers (DEVELOPER → BALANCE): runtime tuning over
   * the engine's shipped config — XP pace, mob strength, loot percentages…
   * All 1 (neutral) by default; applied via `setBalanceTuning`. */
  balance: BalanceTuning;
};

const STORAGE_KEY = storageKey("settings");

function defaults(): GameSettings {
  // Touch-first devices (phones, tablets) play best with the classic
  // hold-to-steer scheme; fine pointers get the aim-and-click scheme.
  // Items default to manual everywhere now that the powerup dock is the
  // primary way to spend them — a tap on a big slot, timed by the player.
  const touchFirst =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  return {
    steering: touchFirst ? "hold" : "hover",
    itemUse: "manual",
    // Auto-equip off out of the box — finds bank to the bag so the player
    // curates their own loadout; the inventory glows the pieces that beat
    // what's worn to draw the eye. A player who wants finds worn the moment
    // they're grabbed turns it on.
    autoEquip: "off",
    powerupSide: "left",
    // Fine-pointer devices get WASD out of the box; touch has no keyboard,
    // so it defaults off and the on-screen dpad stays in charge.
    keyboardMove: touchFirst ? "off" : "on",
    // The consumable-dock keys default to the reachable Z / X near the WASD
    // hand; rebindable in CONTROLS.
    keyMedkit: "z",
    keyStamina: "x",
    // Vibration is a touch-device affordance — on out of the box where a
    // motor exists, and inert on iOS and pointer devices anyway.
    vibration: "on",
    musicVolume: 0.8,
    sfxVolume: 1,
    // The developer menu stays hidden until the moon Easter egg is found.
    developerUnlocked: false,
    debug: "off",
    // Developer feature flags are opt-in — all default off, so auto stat
    // growth, the field hero's held weapon, and its swing animation stay dark
    // until a dev enables them.
    autoLevelStats: "off",
    characterWeapon: "off",
    weaponSwing: "off",
    // Display preferences default to the shipped presentation.
    xpFloat: "on",
    // Health bars over regular mobs are opt-in — bosses/elites always show
    // theirs; minions stay bar-free until a player turns this on.
    healthBars: "off",
    // Balance multipliers start neutral — the shipped tuning.
    balance: { ...BALANCE_TUNING_DEFAULTS },
  };
}

/** Sanitize a stored balance object: every knob falls back to neutral unless
 * it is a finite, non-negative number (0 is a valid "system off" slider
 * setting; the engine clamps the upper range further). */
function loadBalance(stored: unknown): BalanceTuning {
  const balance = { ...BALANCE_TUNING_DEFAULTS };
  if (typeof stored !== "object" || stored === null) return balance;
  for (const key of Object.keys(balance) as (keyof BalanceTuning)[]) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      balance[key] = value;
    }
  }
  return balance;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A stored consumable-dock bind falls back to its default unless it's a
 * single printable character (a `KeyboardEvent.key` like "z"), lowercased. */
export function sanitizeBindKey(stored: unknown, fallback: string): string {
  return typeof stored === "string" && stored.length === 1
    ? stored.toLowerCase()
    : fallback;
}

function load(): GameSettings {
  const base = defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<GameSettings>;
    return {
      steering:
        stored.steering === "hold" || stored.steering === "hover"
          ? stored.steering
          : base.steering,
      itemUse:
        stored.itemUse === "auto" || stored.itemUse === "manual"
          ? stored.itemUse
          : base.itemUse,
      autoEquip:
        stored.autoEquip === "on" || stored.autoEquip === "off"
          ? stored.autoEquip
          : base.autoEquip,
      powerupSide:
        stored.powerupSide === "left" || stored.powerupSide === "right"
          ? stored.powerupSide
          : base.powerupSide,
      keyboardMove:
        stored.keyboardMove === "on" || stored.keyboardMove === "off"
          ? stored.keyboardMove
          : base.keyboardMove,
      keyMedkit: sanitizeBindKey(stored.keyMedkit, base.keyMedkit),
      keyStamina: sanitizeBindKey(stored.keyStamina, base.keyStamina),
      vibration:
        stored.vibration === "on" || stored.vibration === "off"
          ? stored.vibration
          : base.vibration,
      musicVolume:
        typeof stored.musicVolume === "number"
          ? clamp01(stored.musicVolume)
          : base.musicVolume,
      sfxVolume:
        typeof stored.sfxVolume === "number"
          ? clamp01(stored.sfxVolume)
          : base.sfxVolume,
      developerUnlocked:
        typeof stored.developerUnlocked === "boolean"
          ? stored.developerUnlocked
          : base.developerUnlocked,
      debug:
        stored.debug === "on" || stored.debug === "off"
          ? stored.debug
          : base.debug,
      autoLevelStats:
        stored.autoLevelStats === "on" || stored.autoLevelStats === "off"
          ? stored.autoLevelStats
          : base.autoLevelStats,
      characterWeapon:
        stored.characterWeapon === "on" || stored.characterWeapon === "off"
          ? stored.characterWeapon
          : base.characterWeapon,
      weaponSwing:
        stored.weaponSwing === "on" || stored.weaponSwing === "off"
          ? stored.weaponSwing
          : base.weaponSwing,
      xpFloat:
        stored.xpFloat === "on" || stored.xpFloat === "off"
          ? stored.xpFloat
          : base.xpFloat,
      healthBars:
        stored.healthBars === "on" || stored.healthBars === "off"
          ? stored.healthBars
          : base.healthBars,
      balance: loadBalance(stored.balance),
    };
  } catch {
    return base; // private mode / corrupt JSON — play with defaults
  }
}

const settings: GameSettings = load();
setAudioVolumes({ music: settings.musicVolume, sfx: settings.sfxVolume });
setHapticsEnabled(settings.vibration === "on");
setAutoStatGainsEnabled(settings.autoLevelStats === "on");
setAutoEquipEnabled(settings.autoEquip === "on");
setBalanceTuning(settings.balance);

/** The live settings singleton — cheap to read every simulation tick. */
export function getSettings(): GameSettings {
  return settings;
}

/** Patch, persist, and apply (audio volumes take effect immediately). */
export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  Object.assign(settings, patch);
  settings.musicVolume = clamp01(settings.musicVolume);
  settings.sfxVolume = clamp01(settings.sfxVolume);
  setAudioVolumes({ music: settings.musicVolume, sfx: settings.sfxVolume });
  setHapticsEnabled(settings.vibration === "on");
  setAutoStatGainsEnabled(settings.autoLevelStats === "on");
  setAutoEquipEnabled(settings.autoEquip === "on");
  setBalanceTuning(settings.balance);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode) — settings stay in-memory.
  }
  return settings;
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-facing settings (menu: SETTINGS): control scheme and audio
// volumes. Persisted to localStorage so an installed PWA keeps them across
// launches; defaults adapt to the device — touch-first players get
// hold-to-steer with instant item use, mouse players get cursor steering
// with click-to-use.

import { setAutoStatGainsEnabled } from "@game/core";

import { storageKey } from "../identity.ts";

import { setAudioVolumes } from "./audio.ts";
import { setHapticsEnabled } from "./haptics.ts";

/** How the mouse steers: chase the cursor, or classic hold-to-steer.
 * (Touch always steers by holding — this only changes mouse behavior.) */
export type SteeringMode = "hover" | "hold";

/** Ability pickups: pop the moment they are touched, or bank into the
 * powerup dock until the player taps a slot (or click / E). */
export type ItemUseMode = "auto" | "manual";

/** Which bottom corner the big powerup dock sits in — mirror it for the
 * off hand. Defaults to the lower-left. */
export type PowerupSide = "left" | "right";

/** Desktop keyboard movement: `on` lets WASD/arrows drive the walk (Shift
 * runs, no key stands still) and takes over steering from the mouse; `off`
 * leaves steering to the pointer. Touch devices ignore this. */
export type KeyboardMove = "on" | "off";

/** Vibration feedback on kills (scaled by mob rarity). `off` silences it;
 * on iOS — no Vibration API — it is a noop regardless (see haptics.ts). */
export type Vibration = "on" | "off";

/** DEBUG mode: a developer-only toggle. `on` is reserved for future
 * developer diagnostics (a live-state overlay, extra logging); today it is a
 * plain persisted flag that does nothing on its own yet. Reached through the
 * hidden DEVELOPER menu (see `developerUnlocked`). */
export type DebugMode = "on" | "off";

/** AUTO LEVEL STATS: a developer feature flag for the automatic per-level
 * base-stat growth (the WoW-style gains a ding hands the hero on its own,
 * underneath the chosen point — see the engine's leveling.ts). Opt-in: `off`
 * (the default) means a ding grants only the chosen point; `on` restores the
 * free gains AND the horde's compensating hp scaling in lockstep (they derive
 * from the same rule), so the two switch together and the balance stays whole.
 * Applied to the engine via `setAutoStatGainsEnabled`. */
export type AutoLevelStats = "on" | "off";

/** CHARACTER GEAR: a developer feature flag for drawing the worn armor and
 * held weapon on the hero SPRITE in the field (the paper-doll — see
 * paper-doll.ts / render.ts). Opt-in: `off` (the default) renders the bare
 * body as before the paper-doll landed; `on` dresses the field character. The
 * HUD avatar and inventory portrait stay dressed regardless. */
export type CharacterGear = "on" | "off";

/** XP ON KILL: a display preference (SETTINGS → DISPLAY) for the blue "+N XP"
 * combat text that floats off a corpse on each kill (emitted in GameScreen).
 * `on` (the default) keeps it; `off` silences it for a cleaner field. */
export type XpFloat = "on" | "off";

export type GameSettings = {
  steering: SteeringMode;
  itemUse: ItemUseMode;
  powerupSide: PowerupSide;
  keyboardMove: KeyboardMove;
  vibration: Vibration;
  /** 0–1 master volumes, applied via audio.ts. */
  musicVolume: number;
  sfxVolume: number;
  /** The DEVELOPER menu is hidden until the title moon's secret long-press
   * detonates it (see TitleScreen `startMoonHold`); this latches that unlock so
   * the menu stays available across launches once discovered. */
  developerUnlocked: boolean;
  /** Developer DEBUG toggle — persisted but inert for now (see DebugMode). */
  debug: DebugMode;
  /** Developer flag: automatic per-level base-stat growth (see AutoLevelStats). */
  autoLevelStats: AutoLevelStats;
  /** Developer flag: worn armor + weapon on the field hero (see CharacterGear). */
  characterGear: CharacterGear;
  /** Display preference: floating "+N XP" popups on kills (see XpFloat). */
  xpFloat: XpFloat;
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
    powerupSide: "left",
    // Fine-pointer devices get WASD out of the box; touch has no keyboard,
    // so it defaults off and the on-screen dpad stays in charge.
    keyboardMove: touchFirst ? "off" : "on",
    // Vibration is a touch-device affordance — on out of the box where a
    // motor exists, and inert on iOS and pointer devices anyway.
    vibration: "on",
    musicVolume: 0.8,
    sfxVolume: 1,
    // The developer menu stays hidden until the moon Easter egg is found.
    developerUnlocked: false,
    debug: "off",
    // Developer feature flags are opt-in — both default off, so auto stat
    // growth and the field hero's worn gear stay dark until a dev enables them.
    autoLevelStats: "off",
    characterGear: "off",
    // Display preferences default to the shipped presentation.
    xpFloat: "on",
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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
      powerupSide:
        stored.powerupSide === "left" || stored.powerupSide === "right"
          ? stored.powerupSide
          : base.powerupSide,
      keyboardMove:
        stored.keyboardMove === "on" || stored.keyboardMove === "off"
          ? stored.keyboardMove
          : base.keyboardMove,
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
      characterGear:
        stored.characterGear === "on" || stored.characterGear === "off"
          ? stored.characterGear
          : base.characterGear,
      xpFloat:
        stored.xpFloat === "on" || stored.xpFloat === "off"
          ? stored.xpFloat
          : base.xpFloat,
    };
  } catch {
    return base; // private mode / corrupt JSON — play with defaults
  }
}

const settings: GameSettings = load();
setAudioVolumes({ music: settings.musicVolume, sfx: settings.sfxVolume });
setHapticsEnabled(settings.vibration === "on");
setAutoStatGainsEnabled(settings.autoLevelStats === "on");

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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode) — settings stay in-memory.
  }
  return settings;
}

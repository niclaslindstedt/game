// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-facing settings (menu: SETTINGS): control scheme and audio
// volumes. Persisted to localStorage so an installed PWA keeps them across
// launches; defaults adapt to the device — touch-first players get
// hold-to-steer with instant item use, mouse players get cursor steering
// with click-to-use.

import { storageKey } from "../identity.ts";

import { setAudioVolumes } from "./audio.ts";

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

export type GameSettings = {
  steering: SteeringMode;
  itemUse: ItemUseMode;
  powerupSide: PowerupSide;
  keyboardMove: KeyboardMove;
  /** 0–1 master volumes, applied via audio.ts. */
  musicVolume: number;
  sfxVolume: number;
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
    musicVolume: 0.8,
    sfxVolume: 1,
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
      musicVolume:
        typeof stored.musicVolume === "number"
          ? clamp01(stored.musicVolume)
          : base.musicVolume,
      sfxVolume:
        typeof stored.sfxVolume === "number"
          ? clamp01(stored.sfxVolume)
          : base.sfxVolume,
    };
  } catch {
    return base; // private mode / corrupt JSON — play with defaults
  }
}

const settings: GameSettings = load();
setAudioVolumes({ music: settings.musicVolume, sfx: settings.sfxVolume });

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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode) — settings stay in-memory.
  }
  return settings;
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-facing settings (menu: SETTINGS): control scheme and audio
// volumes. Persisted to localStorage so an installed PWA keeps them across
// launches; defaults adapt to the device — touch-first players get
// hold-to-steer with instant item use, mouse players get cursor steering
// with click-to-use.

import { setAudioVolumes } from "./audio.ts";

/** How the mouse steers: chase the cursor, or classic hold-to-steer.
 * (Touch always steers by holding — this only changes mouse behavior.) */
export type SteeringMode = "hover" | "hold";

/** Ability pickups: pop the moment they are touched, or bank until the
 * player uses them (click / two-finger tap / the HUD button / E). */
export type ItemUseMode = "auto" | "manual";

export type GameSettings = {
  steering: SteeringMode;
  itemUse: ItemUseMode;
  /** 0–1 master volumes, applied via audio.ts. */
  musicVolume: number;
  sfxVolume: number;
};

const STORAGE_KEY = "gone-in-space:settings";

function defaults(): GameSettings {
  // Touch-first devices (phones, tablets) play best with the classic
  // scheme and instant items; fine pointers get the aim-and-click scheme.
  const touchFirst =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  return {
    steering: touchFirst ? "hold" : "hover",
    itemUse: touchFirst ? "auto" : "manual",
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

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Player-facing settings (menu: SETTINGS): control scheme and audio
// volumes. Persisted to localStorage so an installed PWA keeps them across
// launches; defaults adapt to the device — touch players steer by holding
// and dragging, mouse players get cursor steering with click-to-use (or the
// aim-and-shoot scheme, where the keyboard walks and the mouse aims).

import {
  BALANCE_TUNING_DEFAULTS,
  setAutoEquipEnabled,
  setAutoStatGainsEnabled,
  setBalanceTuning,
  setCutscenesEnabled,
  setDialogueEnabled,
  type BalanceTuning,
} from "@game/core";

import { storageKey } from "../identity.ts";

import { setAudioVolumes } from "./audio.ts";
import { DEFAULT_BOT_VIEW_SPEC, isBotViewSpecId } from "./botViewSpecs.ts";
import { setHapticsEnabled } from "./haptics.ts";
import { setStoreForced } from "./store.ts";
import {
  DEFAULT_KEYBINDINGS,
  codeForChar,
  sanitizeBindings,
  type KeyBindings,
} from "./keybindings.ts";

/** How the mouse plays — a desktop-only setting (touch always steers by
 * holding and dragging, and ignores this). `hover` (FOLLOW CURSOR): the
 * character chases the cursor, a click uses an item. `aim` (AIM & SHOOT):
 * the keyboard walks the character, the pointer is the aim — the hero
 * favors the foe the cursor points at — and the left button is the
 * trigger; with AUTO-FIRE off the weapon only fires while it is held. */
export type SteeringMode = "hover" | "aim";

/** AIM & SHOOT's trigger (desktop-only): `on` (the default) keeps the
 * character firing autonomously, the pointer just directing the aim; `off`
 * holds every blow until the left mouse button is pressed. Only meaningful
 * in the `aim` steering mode — cursor-follow always fights autonomously. */
export type AutoFire = "on" | "off";

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
 * mouse takes back over (cursor-follow steering), so the two coexist. `off`
 * leaves steering to the pointer alone. The AIM & SHOOT mouse mode always
 * walks by keyboard regardless (the mouse only aims there), and touch
 * devices ignore this. */
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

/** FORCE STORE: a developer feature flag for the COIN STORE. `off` (the
 * default) leaves the store to the native shell (see store.ts
 * `coinStoreAvailable`); `on` surfaces the STORE menu in ANY build — browser
 * and PWA included — with packs granted FREE through the normal credit path
 * (there is no payment provider outside a production store build). Applied
 * via `setStoreForced`, mirroring the other applied flags. */
export type StoreForce = "on" | "off";

/** MUTE: a SOUND toggle that silences all audio without touching the mix.
 * `on` forces both output volumes to 0 while the MUSIC and SOUND FX sliders
 * keep their stored levels, so unmuting restores the exact levels the player
 * dialed in. `off` (the default) plays at the slider levels. A presentation
 * gate applied in settings.ts (the stored `musicVolume`/`sfxVolume` are left
 * untouched; only the value handed to `setAudioVolumes` is zeroed). */
export type MuteMode = "on" | "off";

/** XP ON KILL: a display preference (SETTINGS → DISPLAY) for the blue "+N XP"
 * combat text that floats off a corpse on each kill (emitted in GameScreen).
 * `on` (the default) keeps it; `off` silences it for a cleaner field. */
export type XpFloat = "on" | "off";

/** HEALTH BARS: a display preference (SETTINGS → DISPLAY) for a small hp bar
 * drawn over every wounded mob's head (see render.ts). `on` (the default)
 * shows a tiny few-pixel bar over regular minions too; `off` keeps the field
 * clean — bosses and elites still show their bars once hurt either way. */
export type HealthBars = "on" | "off";

/** DIALOGUE: a display preference (SETTINGS → DISPLAY) for the in-world spoken
 * scenes — elite/boss arrivals and last words, the hero's inner monologues,
 * story-item lore, companion joins, and the merchant's greeting. `on` (the
 * default) plays them; `off` silences every one, starting each level muted.
 * Applied to the engine via `setDialogueEnabled` (mirrors how the mute button
 * works) — it gates presentation only, no simulation rule. */
export type DialogueScenes = "on" | "off";

/** CUTSCENES: a display preference (SETTINGS → DISPLAY) for the prelude
 * cutscenes that open a level (the launch, the flight — see cutscenes.ts).
 * `on` (the default) plays them; `off` skips the whole prelude so the run opens
 * straight on the hero's intro monologue. Applied to the engine via
 * `setCutscenesEnabled` — a presentation gate only. */
export type Cutscenes = "on" | "off";

/** GAME SPEED: how fast a run plays. The whole simulation is fast-forwarded by
 * running MORE fixed game-loop steps per frame — never bigger steps — so `1` is
 * real time and `2`/`4`/`8` run the run that many times as fast while staying
 * deterministic. A DEVELOPER control, not a user setting: it's chosen in the
 * DEVELOPER → BOT VIEW flow (the GAME SPEED step shown after difficulty + level)
 * so the autopilot can blitz a level for a quick read — a normal player never
 * sees it and plays at `1`. Persisted like the other developer flags and read
 * app-side by the game loop (GameScreen `simSpeed`); a pure pacing lever, so it
 * needs no engine setter. Automated bot playtests can crank it higher still via
 * the `?speed=` URL param / `window.__speed` debug hook. */
export type GameSpeed = number;

export type GameSettings = {
  steering: SteeringMode;
  /** AIM & SHOOT's autonomous trigger (see AutoFire) — desktop-only. */
  autoFire: AutoFire;
  itemUse: ItemUseMode;
  /** Equip stronger finds on pickup, or bank them to the bag (see AutoEquip). */
  autoEquip: AutoEquip;
  powerupSide: PowerupSide;
  keyboardMove: KeyboardMove;
  /**
   * The desktop control scheme — one physical binding code per action
   * (steering, jump, powerup, bag, map, pause, the consumable dock, …).
   * Rebindable in SETTINGS → CONTROLS → KEY BINDINGS (see keybindings.ts);
   * touch devices use the on-screen controls and ignore these.
   */
  keybindings: KeyBindings;
  vibration: Vibration;
  /** 0–1 master volumes, applied via audio.ts. */
  musicVolume: number;
  sfxVolume: number;
  /** Silence all audio without disturbing the mix (see MuteMode) — the sliders
   * keep their values while muted, so unmuting restores them exactly. */
  muted: MuteMode;
  /** The DEVELOPER menu is hidden until the title moon's secret long-press
   * detonates it (see TitleScreen `startMoonHold`); this latches that unlock so
   * the menu stays available across launches once discovered. */
  developerUnlocked: boolean;
  /** Developer DEBUG toggle — shows the in-run FPS meter (see DebugMode). */
  debug: DebugMode;
  /** Developer flag: automatic per-level base-stat growth (see AutoLevelStats). */
  autoLevelStats: AutoLevelStats;
  /** Developer flag: surface the coin store in any build, free (see StoreForce). */
  storeForce: StoreForce;
  /** Display preference: floating "+N XP" popups on kills (see XpFloat). */
  xpFloat: XpFloat;
  /** Display preference: hp bars over regular mobs' heads (see HealthBars). */
  healthBars: HealthBars;
  /** Display preference: in-world spoken dialogue scenes (see DialogueScenes). */
  dialogue: DialogueScenes;
  /** Display preference: prelude cutscenes that open a level (see Cutscenes). */
  cutscenes: Cutscenes;
  /** Developer fast-forward: how fast a run plays, real time (1) up to 8×,
   * chosen in the DEVELOPER → BOT VIEW flow (see GameSpeed). */
  gameSpeed: GameSpeed;
  /** Developer BOT VIEW build preset (a `botViewSpecs.ts` id): which generated
   * hero the autopilot showcases — weapon/gear lane, stat picks, and positioning
   * posture together. Chosen on the BOT VIEW GAME SPEED step; a normal player
   * never sees it. Read app-side only (GameScreen picks the loadout + bot). */
  botViewSpec: string;
  /** Developer slider: scales the OVERKILL corpse launch — how far an
   * overpowered kill flings the mob flying (see GameScreen `corpseLaunch`).
   * A multiplier in [0, KNOCKBACK_MAX]: 0 = bodies topple in place, 1 = the
   * shipped feel, up to KNOCKBACK_MAX× for absurd off-screen flight. Read
   * app-side only (a pure render effect), so it needs no engine setter. */
  knockback: number;
  /** Developer BALANCE multipliers (DEVELOPER → BALANCE): runtime tuning over
   * the engine's shipped config — XP pace, mob strength, loot percentages…
   * All 1 (neutral) by default; applied via `setBalanceTuning`. */
  balance: BalanceTuning;
};

const STORAGE_KEY = storageKey("settings");

function defaults(): GameSettings {
  // Items default to manual everywhere now that the powerup dock is the
  // primary way to spend them — a tap on a big slot, timed by the player.
  const touchFirst =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  return {
    // Mouse-only (touch always hold-and-drags): cursor-follow out of the
    // box, with AIM & SHOOT the opt-in scheme — and its trigger autonomous
    // until AUTO-FIRE is turned off.
    steering: "hover",
    autoFire: "on",
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
    // The shipped WASD + action-key scheme; rebindable in CONTROLS → KEY
    // BINDINGS.
    keybindings: { ...DEFAULT_KEYBINDINGS },
    // Vibration is a touch-device affordance — on out of the box where a
    // motor exists, and inert on iOS and pointer devices anyway.
    vibration: "on",
    musicVolume: 0.8,
    sfxVolume: 1,
    // Sound plays out of the box; MUTE silences it while keeping the levels.
    muted: "off",
    // The developer menu stays hidden until the moon Easter egg is found.
    developerUnlocked: false,
    debug: "off",
    // Auto stat growth is opt-in — off until a dev enables it. The field
    // hero's held weapon and its swing animation are now always on (shipped
    // as the default look), so they are no longer settings.
    autoLevelStats: "off",
    // The coin store surfaces only in the native shell unless a developer
    // forces it (free purchases — see store.ts).
    storeForce: "off",
    // Display preferences default to the shipped presentation.
    xpFloat: "on",
    // Health bars over regular mobs are on out of the box; a player who wants
    // a cleaner field turns them off (bosses/elites always show theirs).
    healthBars: "on",
    // The story plays in full out of the box; a player who wants to skip the
    // talking turns dialogue and/or cutscenes off.
    dialogue: "on",
    cutscenes: "on",
    // Runs play at real time; only a developer changes this, from the BOT VIEW
    // flow, to fast-forward the autopilot (a normal player never sees it).
    gameSpeed: 1,
    // BOT VIEW showcases the ranged lane out of the box; a developer cycles it.
    botViewSpec: DEFAULT_BOT_VIEW_SPEC,
    // The overkill launch ships at 1× — a dev dials it up or down live.
    knockback: 1,
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

/** Upper bound of the DEVELOPER → KNOCKBACK slider — 1× is the shipped feel,
 * so 3× is deep into off-the-screen territory. Shared by the slider row
 * (position ↔ multiplier) and the stored-value clamp. */
export const KNOCKBACK_MAX = 3;
const clampKnockback = (v: number) =>
  Math.round(Math.min(KNOCKBACK_MAX, Math.max(0, v)) * 20) / 20;

/** The GAME SPEED choices the DEVELOPER → BOT VIEW step cycles through — real
 * time up to a brisk 8× fast-forward for the autopilot. Kept discrete so the
 * row cycles cleanly (bot playtests bypass this and go higher via `?speed=` /
 * `__speed`). Shared by the menu row and the stored-value clamp. */
export const GAME_SPEEDS = [1, 2, 4, 8];
/** Snap a stored/patched game speed to one of the allowed steps, real time (1)
 * on anything unexpected. */
const clampGameSpeed = (v: unknown): number => {
  const n = typeof v === "number" ? Math.round(v) : 1;
  return GAME_SPEEDS.includes(n) ? n : 1;
};

/** Load the control scheme, migrating a pre-KEY-BINDINGS save: those stored the
 * consumable dock as single-char `keyMedkit`/`keyStamina` and had no
 * `keybindings` block, so fold those two into the defaults as physical codes. */
function loadKeybindings(
  stored: Partial<GameSettings> & {
    keyMedkit?: unknown;
    keyStamina?: unknown;
  },
): KeyBindings {
  if (stored.keybindings) return sanitizeBindings(stored.keybindings);
  const binds = { ...DEFAULT_KEYBINDINGS };
  const medkit = codeForChar(stored.keyMedkit);
  const stamina = codeForChar(stored.keyStamina);
  if (medkit) binds.medkit = medkit;
  if (stamina) binds.stamina = stamina;
  return binds;
}

function load(): GameSettings {
  const base = defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<GameSettings>;
    return {
      steering:
        stored.steering === "aim" || stored.steering === "hover"
          ? stored.steering
          : // Migrate a pre-AIM-&-SHOOT save: "hold" was the old mouse mode
            // this scheme replaced.
            (stored.steering as unknown) === "hold"
            ? "aim"
            : base.steering,
      autoFire:
        stored.autoFire === "on" || stored.autoFire === "off"
          ? stored.autoFire
          : base.autoFire,
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
      keybindings: loadKeybindings(stored),
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
      muted:
        stored.muted === "on" || stored.muted === "off"
          ? stored.muted
          : base.muted,
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
      storeForce:
        stored.storeForce === "on" || stored.storeForce === "off"
          ? stored.storeForce
          : base.storeForce,
      xpFloat:
        stored.xpFloat === "on" || stored.xpFloat === "off"
          ? stored.xpFloat
          : base.xpFloat,
      healthBars:
        stored.healthBars === "on" || stored.healthBars === "off"
          ? stored.healthBars
          : base.healthBars,
      dialogue:
        stored.dialogue === "on" || stored.dialogue === "off"
          ? stored.dialogue
          : base.dialogue,
      cutscenes:
        stored.cutscenes === "on" || stored.cutscenes === "off"
          ? stored.cutscenes
          : base.cutscenes,
      gameSpeed: clampGameSpeed(stored.gameSpeed),
      botViewSpec: isBotViewSpecId(stored.botViewSpec)
        ? stored.botViewSpec
        : base.botViewSpec,
      knockback:
        typeof stored.knockback === "number" &&
        Number.isFinite(stored.knockback)
          ? clampKnockback(stored.knockback)
          : base.knockback,
      balance: loadBalance(stored.balance),
    };
  } catch {
    return base; // private mode / corrupt JSON — play with defaults
  }
}

/** Apply the audio mix, honoring MUTE: when muted both outputs are forced to
 * 0 while the stored slider levels stay untouched, so unmuting restores them. */
function applyAudioVolumes(s: GameSettings): void {
  const gain = s.muted === "on" ? 0 : 1;
  setAudioVolumes({ music: s.musicVolume * gain, sfx: s.sfxVolume * gain });
}

const settings: GameSettings = load();
applyAudioVolumes(settings);
setHapticsEnabled(settings.vibration === "on");
setAutoStatGainsEnabled(settings.autoLevelStats === "on");
setAutoEquipEnabled(settings.autoEquip === "on");
setDialogueEnabled(settings.dialogue === "on");
setCutscenesEnabled(settings.cutscenes === "on");
setStoreForced(settings.storeForce === "on");
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
  settings.knockback = clampKnockback(settings.knockback);
  settings.gameSpeed = clampGameSpeed(settings.gameSpeed);
  applyAudioVolumes(settings);
  setHapticsEnabled(settings.vibration === "on");
  setAutoStatGainsEnabled(settings.autoLevelStats === "on");
  setAutoEquipEnabled(settings.autoEquip === "on");
  setDialogueEnabled(settings.dialogue === "on");
  setCutscenesEnabled(settings.cutscenes === "on");
  setStoreForced(settings.storeForce === "on");
  setBalanceTuning(settings.balance);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode) — settings stay in-memory.
  }
  return settings;
}

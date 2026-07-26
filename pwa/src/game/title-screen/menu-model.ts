// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title menu's data model: the screen ids, the MenuEntry row shape
// MenuList renders, and the MenuContext bundle TitleScreen hands the
// per-screen builders (menus-*.ts). The shared row factories live here too —
// the BACK row, the ON/OFF switch row, the volume slider row — so every
// screen builds its rows the same way.

import type { Difficulty } from "@game/core";
import { clamp01 } from "@game/lib/vec.ts";

import { synth } from "../audio.ts";
import type { Character } from "../characters.ts";
import type { BindableAction } from "../keybindings.ts";
import { playTitleMusic } from "../music/index.ts";
import type { SeedTier } from "../seed-characters.ts";
import { getSettings, updateSettings, type GameSettings } from "../settings.ts";
import { playUiSound } from "../sfx/index.ts";
import type { CoinPack } from "../store.ts";

export type MenuScreen =
  | "main"
  | "play"
  | "difficulty"
  | "levels"
  | "botspeed"
  | "scores"
  | "settings"
  | "controls"
  | "keybindings"
  | "display"
  | "sound"
  | "data"
  | "export"
  | "developer"
  | "visuals"
  | "balance"
  | "seed"
  | "arsenal"
  | "effects"
  | "vault"
  | "achievements"
  | "store"
  | "storeconfirm"
  | "storehero"
  | "storesend";

/** The SETTINGS-tree screens that render as a stable form (fixed-width column +
 * a single bottom help line instead of per-row inline blurbs). The `settings`
 * index itself is excluded — it's a menu of destinations, so it keeps the
 * inline blurbs the other navigation menus use. */
export const SETTINGS_TREE = new Set<MenuScreen>([
  "controls",
  "keybindings",
  "display",
  "sound",
  "data",
  "export",
  "developer",
  "visuals",
  "balance",
  "seed",
  // The BOT VIEW game-speed step is a settings-like config screen (GAME SPEED
  // and BOT SPEC are value rows); the fixed width keeps its values from being
  // shoved off the right edge past a long inline blurb, and its help drops to
  // the bottom line like the rest of the tree.
  "botspeed",
]);

export type MenuEntry = {
  label: string;
  aria: string;
  color?: string;
  blurb?: string;
  /** A sprite name (see the atlas) drawn as the row's own emblem, hovering
   * where the wisp cursor sits on a mouse device. TOUCH ONLY — a phone has no
   * hover, so the wisp never lingers on a row there and the column of rows
   * reads as dead text; its own icon is what makes a row look pressable. The
   * swap is pure CSS (`(any-pointer: fine)` — see `.menu-icon`), so a mouse
   * keeps the wisp and never sees the icons. Rows without one still reserve
   * the slot, so labels stay aligned down the column. */
  icon?: string;
  /** A shown-but-not-yet-playable entry (a locked level): the cursor still
   * lands on it, but choosing it just buzzes instead of starting. */
  locked?: boolean;
  action: () => void;
  /** A slider row (BALANCE knobs, SOUND volumes): renders a drag track after
   * the label and takes ArrowLeft/ArrowRight (see onKeyDown) instead of a
   * confirm cycle. `pos` is the 0..1 track position; `set` commits a
   * dragged/tapped position; `nudge` steps one keyboard tick (±1). */
  slider?: {
    pos: number;
    set: (pos: number) => void;
    nudge: (dir: number) => void;
  };
  /** An ON/OFF row: renders a pixel switch after the label; the arrows set it
   * (→ on, ← off) and confirm/click flips it. `on` is the current state; `set`
   * commits a new one. */
  toggle?: { on: boolean; set: (on: boolean) => void };
  /** A MULTI-SELECT row (the EXPORT CHARACTER picker): renders a pixel tick-box
   * after the label; the arrows set it (→ checked, ← empty) and confirm/click
   * toggles it. `checked` is the current state; `set` commits a new one. A
   * tick-box (not a switch) because these rows pick one of many, not a
   * setting's on/off. */
  check?: { checked: boolean; set: (checked: boolean) => void };
  /** A KEY BINDINGS row: renders the bound key's name right-aligned (Quake
   * style — label left, key far right). `capturing` swaps it for a "PRESS A
   * KEY" prompt while this row is listening for the next press. */
  binding?: { code: string; capturing: boolean };
  /** A label-cycling settings row (MOUSE, KEYS, GEAR…): the current value,
   * rendered right-aligned like a binding so the key sits at the left and the
   * value lines up down the right edge (confirm/click still cycles it). */
  value?: string;
  /** A persistent second line of DATA under the label (the EXPORT picker's
   * per-hero "LV 34 - SOFTCORE"). Unlike `blurb` — interactive help that the
   * settings tree hoists to the bottom help line so a value change can't reflow
   * the row — a subtitle is row-bound content and always renders in the row. */
  subtitle?: string;
  /** A GLIMMERING row (the main-menu STORE entry and every COIN STORE pack):
   * MenuList strikes its LABEL out of polished metal — a bevel and a specular
   * highlight that sweeps THROUGH the letters (PixelShinyText masks both to the
   * glyphs, so the shine never spills onto the row around them). The metal is
   * all of it: an amber GLOW means "this is the row you're on" and belongs to
   * the highlighted row alone, whichever row that is. Purely cosmetic; the row
   * behaves like any other. Add `coinTier` for a pile of coins as well. */
  shiny?: boolean;
  /** The pack's take, STACKED before a shiny row's label like poker chips and
   * sized by this 1..N tier — the dopamine ladder down the store list. The step
   * is how MANY coins are piled up, never how big they are: a bigger pack
   * buries the row in more gold, which is what a bigger haul looks like. Laid
   * out from the row's id by coin-pile.ts and stirred (coins whipped off the
   * top of each column) while the row is selected. Ignored unless `shiny` is
   * set. */
  coinTier?: number;
};

/** The import/export/store result line shown under the menu. */
export type TitleNotice = { tone: "info" | "error"; text: string };

/** Everything the per-screen menu builders (menus-*.ts) need from
 * TitleScreen: navigation, the App-level handoffs, the picker state that
 * carries between screens, and the transfer/store plumbing. Rebuilt inside
 * the `entries` memo, so every builder reads fresh values. */
export type MenuContext = {
  // Navigation.
  setScreen: (screen: MenuScreen) => void;
  setCursor: (at: number) => void;
  // The active hero and the App-level handoffs.
  character: Character | null;
  /** A run sits parked in memory, so the main menu leads with RESUME (and
   * every "land back on row N of main" index shifts one down). */
  hasResume: boolean;
  /** The active hero's LOST & FOUND holds something (items/vault.ts): the
   * main menu then offers the buy-back screen. Hidden otherwise — a player
   * who has never flown a paid AUTO PILOT ride has nothing to reclaim, and a
   * permanently empty row is just noise. */
  hasVault: boolean;
  onResume?: () => void;
  onStart: (
    difficulty: Difficulty,
    levelId: string,
    opts?: { skipIntro?: boolean; botView?: boolean },
  ) => void;
  onNewGame: () => void;
  onLoadGame: () => void;
  onHowToPlay: () => void;
  // The campaign picker's carried state (difficulty → levels → botspeed).
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;
  warp: boolean;
  setWarp: (on: boolean) => void;
  botView: boolean;
  setBotView: (on: boolean) => void;
  botLevel: string | null;
  setBotLevel: (id: string | null) => void;
  // Settings plumbing: the menu reads the non-React settings store through
  // getSettings(), so builders bump this tick after updateSettings to rebuild
  // the list with fresh values.
  bumpSettings: () => void;
  captureBind: BindableAction | null;
  setCaptureBind: (action: BindableAction | null) => void;
  hasFinePointer: boolean;
  canBuzz: boolean;
  // The result line under the menu (import/export/store outcomes).
  setNotice: (notice: TitleNotice | null) => void;
  // Roster + character transfer (use-character-transfer.ts).
  roster: Character[];
  exportPicks: Set<string>;
  toggleExportPick: (id: string, on: boolean) => void;
  exportPicked: () => Promise<void>;
  pickImport: () => void;
  beginExportPicker: () => void;
  runSeed: (tier: SeedTier | null) => void;
  // The coin store (use-coin-store.ts).
  storeOpen: boolean;
  storePrices: Record<string, string> | null;
  storeBusy: boolean;
  storePackSku: string | null;
  setStorePackSku: (sku: string | null) => void;
  storeHeroId: string | null;
  setStoreHeroId: (id: string | null) => void;
  storeAmount: number;
  setStoreAmount: (amount: number) => void;
  runPurchase: (pack: CoinPack) => Promise<void>;
  runSend: (hero: Character, amount: number) => void;
};

// Audio needs a user gesture; the first interaction with the menu doubles
// as the unlock, and the title theme starts with it.
export function unlockAudio() {
  synth.unlock();
  playTitleMusic();
}

/** The universal BACK row: steps to `target` and re-homes the cursor on the
 * row this screen was opened from. */
export function backTo(
  ctx: MenuContext,
  target: MenuScreen,
  at = 0,
): MenuEntry {
  return {
    label: "BACK",
    aria: "menu-back",
    icon: "icon_menu_back",
    action: () => {
      playUiSound(synth, "back");
      ctx.setScreen(target);
      ctx.setCursor(at);
    },
  };
}

/** The boolean SETTINGS rows that read as a straight ON/OFF. */
type OnOffKey =
  | "autoFire"
  | "autoEquip"
  | "debug"
  | "autoLevelStats"
  | "storeForce"
  | "vibration"
  | "muted"
  | "xpFloat"
  | "healthBars"
  | "dialogue"
  | "cutscenes";

/** A row's help line. The settings tree's help describes the state the setting
 * is IN, never both states at once ("ON … - OFF …" makes the reader pick their
 * own line out of a table), so a boolean row gives one line per state; a single
 * string is for the rare row that reads the same either way. */
export type StateBlurb = string | { on: string; off: string };

/** Resolve a per-state help line for the state a row is currently in. */
export function stateBlurb(blurb: StateBlurb, on: boolean): string {
  return typeof blurb === "string" ? blurb : on ? blurb.on : blurb.off;
}

/** A boolean settings row: a constant label plus a pixel switch (see
 * MenuEntry.toggle). `audition` fires a confirming cue after the flip (e.g. a
 * haptic buzz for VIBRATION). */
export function onOffRow(
  ctx: MenuContext,
  key: OnOffKey,
  label: string,
  aria: string,
  blurb: StateBlurb,
  audition?: (on: boolean) => void,
): MenuEntry {
  const on = getSettings()[key] === "on";
  const set = (next: boolean) => {
    playUiSound(synth, "confirm");
    updateSettings({ [key]: next ? "on" : "off" } as Partial<GameSettings>);
    audition?.(next);
    ctx.bumpSettings();
  };
  return {
    label,
    aria,
    blurb: stateBlurb(blurb, on),
    toggle: { on, set },
    action: () => set(!on),
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** A 0–1 volume as a drag slider: the label carries the "%" readout, the
 * arrows nudge in 5% steps, and updateSettings applies the level live. */
export function volumeRow(
  ctx: MenuContext,
  key: "musicVolume" | "sfxVolume",
  label: string,
  aria: string,
  blurb: string,
): MenuEntry {
  const vol = getSettings()[key];
  const setVol = (v: number) => {
    updateSettings({
      [key]: Math.round(clamp01(v) * 100) / 100,
    });
    ctx.bumpSettings();
  };
  return {
    label: `${label} ${pct(vol)}`,
    aria,
    blurb,
    action: () => {},
    slider: {
      pos: vol,
      set: setVol,
      nudge: (dir: number) => setVol(getSettings()[key] + dir * 0.05),
    },
  };
}

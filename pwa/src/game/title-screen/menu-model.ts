// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title menu's data model: the screen ids, the MenuEntry row shape
// MenuList renders, and the MenuContext bundle TitleScreen hands the
// per-screen builders (menus-*.ts). The shared row factories live here too —
// the BACK row, the ON/OFF switch row, the volume slider row — so every
// screen builds its rows the same way.

import type { Difficulty } from "@game/menu";
import { clamp01 } from "@game/lib/vec.ts";

import { synth } from "../audio.ts";
import type { Character } from "../characters.ts";
import type { CloudState } from "../cloud-save.ts";
import type { BindableAction } from "../keybindings.ts";
import { playTitleMusic } from "../music/index.ts";
import type { SeedTier } from "../seed-tiers.ts";
import {
  getSettings,
  updateSettings,
  type GameSettings,
  type SessionSettings,
} from "../settings.ts";
import type { HostIntent } from "../session-intent.ts";
import { playUiSound } from "../sfx/ui.ts";
import type { CoinPack } from "../store.ts";
import type { InstalledMod } from "../../app/mods-bridge.ts";
import type { BrowserRow, FirewallStatus } from "../../app/net-bridge.ts";
import { parentOf, rowAria, rowDef, rowHelp, screenDef } from "./menu-tree.ts";

/** Every screen the title menu can be on.
 *
 * Hand-written rather than derived from the compiled tree, so a typo in a
 * `setScreen` call is a type error rather than a blank screen — and pinned to
 * `content/mainmenu.yaml` by `tests/menu_tree_test.ts`, which fails when the
 * two disagree in either direction. */
export type MenuScreen =
  | "main"
  | "extras"
  | "difficulty"
  | "levels"
  | "botspeed"
  | "scores"
  | "settings"
  | "gameplay"
  | "controls"
  | "keybindings"
  | "interface"
  | "video"
  | "gore"
  | "audio"
  | "data"
  | "export"
  | "developer"
  | "playground"
  | "cheats"
  | "galleries"
  | "visuals"
  | "balance"
  | "seed"
  | "arsenal"
  | "effects"
  | "vault"
  | "screenshots"
  | "achievements"
  | "store"
  | "storeconfirm"
  | "storehero"
  | "storesend"
  | "mods"
  | "modinfo"
  | "modorder"
  | "multiplayer"
  | "host"
  | "sessions"
  | "address";

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
  /** A row that LEAVES the app for a real URL (the LIBRARY row → `/library/`).
   *
   * Set it and the row renders as an `<a href>` instead of a `<button>`, which
   * is the whole point: a click handler that assigns `window.location.href`
   * navigates a human perfectly well and is invisible to a crawler, because a
   * search engine follows anchors and does not execute a menu's onClick. The
   * app's rendered DOM is otherwise link-free — every label is a `PixelText`
   * canvas — so this is the ONE element that connects the site's front door to
   * the ~380 reference pages under `/library/`. Keep it an anchor.
   *
   * `action` still runs on click (the row's sound); the browser does the
   * navigating, so an `href` row's action must not also assign `location`. */
  href?: string;
  /** Does that `href` leave THIS SITE (the COMMUNITY row → the chat server)?
   *
   * Opens in a new tab and carries `rel="noopener noreferrer"`, which is the
   * difference that matters: the LIBRARY is the same origin and navigating to
   * it costs a player nothing, but a run in progress lives in this document —
   * steering the tab off-site to look at a chat invite would throw it away.
   * Both store shells then intercept it and hand the URL to the player's own
   * browser (electron/src/main.ts, native/App.tsx), because a game window has
   * no address bar or back button to leave a web page with. */
  external?: boolean;
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
  /** A REORDERABLE row (the MOD LOAD ORDER): the horizontal arrows move it one
   * place earlier (←) or later (→) instead of steering a control. Its own
   * capability rather than a second meaning for `value`, because the arrows
   * have to DO something here rather than cycle a label — and because the one
   * screen that reorders must not teach the arrows a meaning every other screen
   * would then have to opt out of. */
  reorder?: { move: (dir: -1 | 1) => void };
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

/** What the MODS screen needs beyond the shared context.
 *
 * Declared HERE rather than imported from `menus-mods.ts`, and that is not
 * tidiness: `menu-model.ts` is imported by tests and by every builder, so a
 * type edge from it into a builder drags that builder's whole import graph
 * along — `menus-mods` → `menus-main` → the app's `import.meta.env` — into
 * programs (the root `tsc`) that do not have Vite's globals. The types point
 * one way: builders import the model, never the reverse. */
export type ModsMenuState = {
  /** The installed mods IN LOAD ORDER, or null while the first list is still
   * being compiled. */
  rows: { id: string; mod: InstalledMod; on: boolean }[] | null;
  /** Is this mod id switched on? */
  isOn: (id: string) => boolean;
  setEnabled: (id: string, on: boolean) => void;
  /** The mod the MOD INFO screen is showing, keyed by `InstalledMod.key` — a
   * folder or a Workshop item id, so a mod that did not compile (and therefore
   * has no id of its own) still has a page. Null off that screen. */
  selected: InstalledMod | null;
  /** Open a mod's page. The list row calls it on the way to `modinfo`. */
  select: (mod: InstalledMod | null) => void;
  /** Move a mod one place earlier (-1) or later (+1) in the load order. */
  move: (id: string, dir: -1 | 1) => void;
  /** How many of this mod's ids a LATER enabled mod overrides — 0 when it is
   * winning everything it defines. Reads the last applied stack, so it is only
   * meaningful once a modded run has been started. */
  overriddenIds: (id: string) => number;
  /** The folders that list was read from, or null before the first reply.
   * `portable` is null where the platform has none. */
  folders: { local: string; portable: string | null } | null;
  /** Show one of them in the desktop's file manager. */
  reveal: (which: "local" | "portable") => void;
  /** Start a run with the enabled mods, in order. */
  onPlay: () => void;
  onPublish: (mod: InstalledMod) => void;
};

/** What the three MULTIPLAYER screens need beyond the shared context. Declared
 * here for the same reason `ModsMenuState` is — the types point one way. */
export type NetMenuState = {
  /** The sessions this account can see, or null while the browse is in flight.
   * Rows this build cannot join are IN it (greyed by the screen), never
   * filtered out — see `sessionRowRefusal`. */
  rows: BrowserRow[] | null;
  refresh: () => void;
  /** Whether this machine's firewall would let an inbound packet through, or
   * null while the check is running. */
  firewall: FirewallStatus | null;
  /** One press to ask for a rule. Reports what the RE-CHECK said. */
  allowFirewall: () => void;
  /** The persisted session settings, and the way to write one through. */
  session: SessionSettings;
  setSession: (patch: Partial<SessionSettings>) => void;
  /** What the next run should host with, resolved from those settings at the
   * moment START is pressed. */
  hostIntent: () => HostIntent;
  /** Why this build could not join that row, or null. */
  refusalFor: (row: BrowserRow) => string | null;
  /** The row wants mods this machine does not have — the refusal a
   * press can at least point at the Workshop for. */
  missingMods: (row: BrowserRow) => boolean;
  /** Open the game's Steam Workshop hub — where the missing mods live. */
  openWorkshop: () => void;
  joinRow: (row: BrowserRow, password?: string) => void;
  joinAddress: (address: string, password?: string) => void;
};

/** One line of text asked of the player, over the menu (see PixelPrompt): a
 * session password, a port, an address. It is a MODAL rather than an inline
 * field because the menu column is a list of rows the arrow keys walk, and a
 * row that swallowed the keyboard would take the navigation with it. */
export type PromptSpec = {
  title: string;
  value: string;
  placeholder: string;
  maxLength: number;
  /** Digits only — a port. */
  digits?: boolean;
  /** Refuse a value the field can already tell is wrong, so the player is told
   * while they are still looking at what they typed. */
  validate?: (text: string) => boolean;
  onSubmit: (text: string) => void;
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
  /** Where a row sits in ANOTHER screen's list, as that screen would be built
   * right now — the cursor a BACK row (or a full-screen browser's close) hands
   * `setCursor` so the player lands back on the row they left from. Resolved by
   * row id against the live list, so a build that hides a row (no cloud, no
   * developer tooling, no parked run) shifts the landing with it. Answers 0 for
   * a row that isn't there. */
  rowIndexIn: (screen: MenuScreen, rowId: string) => number;
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
  /** The device takes touch at all (`any-pointer: coarse`). Gates the rows
   * whose feature is a touch gesture (SWIPE BARS) — distinct from
   * `hasFinePointer`, because a touch laptop has both. */
  hasTouch: boolean;
  canBuzz: boolean;
  /** Can this build close itself? The desktop shell can; a browser tab and the
   * mobile app cannot, so the QUIT row is absent there rather than dead. */
  canQuit: boolean;
  onQuit?: () => void;
  // The result line under the menu (import/export/store outcomes).
  setNotice: (notice: TitleNotice | null) => void;
  // Roster + character transfer (use-character-transfer.ts). File transfer is
  // web-only — see `transferOpen` there for why the store app has none.
  transferOpen: boolean;
  roster: Character[];
  exportPicks: Set<string>;
  toggleExportPick: (id: string, on: boolean) => void;
  exportPicked: () => Promise<void>;
  pickImport: () => void;
  beginExportPicker: () => void;
  runSeed: (tier: SeedTier | null) => void;
  /** Ask the player for one line of text, over the menu. */
  prompt: (spec: PromptSpec) => void;
  // MULTIPLAYER. True only in the Steam shell with its session bridge up — a
  // phone has no listening socket and a browser tab is not a server (see
  // `netBridgeAvailable`). Gates the main menu's MULTIPLAYER row.
  netOpen: boolean;
  /** The three multiplayer screens' own state (use-sessions.ts). Its own
   * bundle for the same reason the mods' is: the lobby list arrives over a
   * bridge, and a builder must be handed async state rather than fetch it. */
  net: NetMenuState;
  // STEAM WORKSHOP MODS. True only in the Steam shell — the mobile stores
  // permit no such content channel, and a browser has nothing to load a mod
  // from. Gates the main menu's MODS row.
  modsOpen: boolean;
  /** The MODS screen's own state (use-mods.ts): the compiled list, and the two
   * handoffs. Its own bundle rather than loose fields because the list is
   * fetched over a bridge — async state a menu builder must be handed, never
   * go and get. */
  mods: ModsMenuState;
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
  // Cloud save (use-cloud-save.ts) — native builds only.
  cloudOpen: boolean;
  cloudState: CloudState;
  runCloudSync: () => Promise<void>;
};

// Audio needs a user gesture; the first interaction with the menu doubles
// as the unlock, and the title theme starts with it.
export function unlockAudio() {
  synth.unlock();
  playTitleMusic();
}

/**
 * The universal BACK row, built from the tree: it steps to this screen's
 * `parent` and re-homes the cursor on the parent row that opened it.
 *
 * NOTHING PASSES AN INDEX ANY MORE, and that is the whole reason the tree
 * exists. Every BACK row used to carry a hardcoded cursor into the screen above
 * it — `backTo(ctx, "settings", 4)` — so inserting one settings row silently
 * landed four other screens' back rows on the wrong thing, with nothing to
 * catch it but somebody noticing on a phone. The row is now resolved by ID,
 * against the parent's list as it is built RIGHT NOW, so a row that is hidden
 * on this build (the developer row, the cloud row, a locked level) shifts the
 * cursor along with it for free.
 *
 * `at` is for the screens whose parent's rows come from a catalog rather than
 * from the tree — the mission list under the difficulty ladder, the coin packs
 * under the vault — which is exactly the set the compiler makes declare
 * `home: dynamic`.
 */
export function backRow(
  ctx: MenuContext,
  screen: MenuScreen,
  at?: number,
): MenuEntry {
  const target = parentOf(screen);
  const home = screenDef(screen).home;
  return {
    label: "BACK",
    aria: rowAria(screen, "back"),
    icon: "icon_menu_back",
    action: () => {
      playUiSound(synth, "back");
      if (!target) return;
      ctx.setScreen(target);
      // Resolved on the PRESS, not at build time: asking the parent to lay
      // itself out while it is being laid out would recurse.
      ctx.setCursor(at ?? (home ? ctx.rowIndexIn(target, home) : 0));
    },
  };
}

/** Options every tree-built row shares. */
type RowOptions = {
  /** Override the tree's help — for a row whose line is COMPUTED (a live cloud
   * state, how many mods are on). A row with a `help:` block in the tree passes
   * a `state` instead. */
  help?: string;
  /** Which line of a keyed `help:` block this row is showing. */
  state?: string;
  color?: string;
  locked?: boolean;
  subtitle?: string;
  value?: string;
  shiny?: boolean;
};

function baseRow(
  screen: MenuScreen,
  id: string,
  opts: RowOptions,
): Omit<MenuEntry, "action"> {
  const def = rowDef(screen, id);
  return {
    label: def.label,
    aria: rowAria(screen, id),
    icon: def.icon,
    blurb: opts.help ?? rowHelp(screen, id, opts.state),
    color: opts.color,
    locked: opts.locked,
    subtitle: opts.subtitle,
    value: opts.value,
    shiny: opts.shiny,
  };
}

/**
 * Lay a screen's rows out in the TREE's order.
 *
 * The builder hands back one entry per authored row id — or `null` for a row
 * this build does not offer (no parked run, no platform cloud, no Workshop, no
 * mature content). A row id the builder does not mention AT ALL throws: it is
 * the difference between "deliberately not on this build" and "somebody renamed
 * the row on one side", and only one of those should be silent.
 *
 * Rows that come from a CATALOG rather than from the tree are appended by the
 * builder around this call — the mission list, the rebindable actions, the
 * balance knobs, the roster, the installed mods.
 */
export function assembleRows(
  screen: MenuScreen,
  rows: Record<string, MenuEntry | null>,
): MenuEntry[] {
  return screenDef(screen)
    .rows.map((def) => {
      if (!(def.id in rows)) {
        throw new Error(`menu row "${screen}.${def.id}" has no builder`);
      }
      return rows[def.id];
    })
    .filter((row): row is MenuEntry => row !== null);
}

/** A row that DOES something on this screen: its label, icon and help come from
 * the tree, its behaviour from the builder. */
export function actionRow(
  screen: MenuScreen,
  id: string,
  action: () => void,
  opts: RowOptions = {},
): MenuEntry {
  return { ...baseRow(screen, id, opts), action };
}

/** A row that GOES somewhere: the child screen comes from the tree's own
 * `opens`, so a destination can never point at a screen whose BACK does not
 * come back here (the compiler refuses that pairing). */
export function navRow(
  ctx: MenuContext,
  screen: MenuScreen,
  id: string,
  opts: RowOptions & { before?: () => void } = {},
): MenuEntry {
  const target = rowDef(screen, id).opens;
  if (!target) throw new Error(`menu row "${screen}.${id}" opens nothing`);
  return actionRow(
    screen,
    id,
    () => {
      if (opts.locked) {
        playUiSound(synth, "back");
        return;
      }
      playUiSound(synth, "confirm");
      opts.before?.();
      ctx.setScreen(target);
      ctx.setCursor(0);
    },
    opts,
  );
}

/** The boolean SETTINGS rows that read as a straight ON/OFF. */
type OnOffKey =
  | "autoFire"
  | "autoEquip"
  | "swipeBars"
  | "debug"
  | "autoLevelStats"
  | "storeForce"
  | "cameraAntialias"
  | "vibration"
  | "muted"
  | "xpFloat"
  | "goreBlood"
  | "goreEcto"
  | "goreSparks"
  | "goreCosmic"
  | "goreCleaves"
  | "goreGibs"
  | "goreSoak"
  | "goreTracks"
  | "healthBars"
  | "dialogue"
  | "cutscenes"
  | "deathScenes";

/**
 * A boolean settings row: the tree's label plus a pixel switch (see
 * MenuEntry.toggle), helped by the `on`/`off` line of the tree's own help
 * block — the state the setting is IN, never both at once.
 *
 * `offState` is for the one row whose OFF line depends on something else: the
 * trigger AUTO-FIRE names is a click on a mouse and a button on a pad, so the
 * tree carries both and the builder says which one is in the player's hand.
 * `onState` is the same door on the other side, for a switch that is ON and
 * nonetheless doing nothing yet — ANTI-ALIASING waits on the CAMERA YAW above
 * it, and a help line that claimed otherwise would be a lie the player can see
 * through.
 */
export function onOffRow(
  ctx: MenuContext,
  screen: MenuScreen,
  id: string,
  key: OnOffKey,
  opts: {
    audition?: (on: boolean) => void;
    offState?: string;
    onState?: string;
  } = {},
): MenuEntry {
  const on = getSettings()[key] === "on";
  const set = (next: boolean) => {
    playUiSound(synth, "confirm");
    updateSettings({ [key]: next ? "on" : "off" } as Partial<GameSettings>);
    opts.audition?.(next);
    ctx.bumpSettings();
  };
  return {
    ...actionRow(screen, id, () => set(!on), {
      state: on ? (opts.onState ?? "on") : (opts.offState ?? "off"),
    }),
    toggle: { on, set },
  };
}

/**
 * A drag-track row: the tree's label with a live READOUT appended, and the
 * track under it.
 *
 * The readout is part of the label rather than a `value` column because it is
 * the slider's own scale ("BLOOM 100%", "KNOCKBACK 1.4×") — a number the track
 * is showing, not a setting the row is set to.
 */
export function sliderRow(
  screen: MenuScreen,
  id: string,
  track: {
    readout: string;
    pos: number;
    set: (pos: number) => void;
    nudge: (dir: number) => void;
  },
  opts: { help?: string; state?: string } = {},
): MenuEntry {
  const row = actionRow(screen, id, () => {}, opts);
  return {
    ...row,
    label: `${row.label} ${track.readout}`,
    slider: { pos: track.pos, set: track.set, nudge: track.nudge },
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** A 0–1 volume as a drag slider: the label carries the "%" readout, the
 * arrows nudge in 5% steps, and updateSettings applies the level live. */
export function volumeRow(
  ctx: MenuContext,
  screen: MenuScreen,
  id: string,
  key: "musicVolume" | "sfxVolume",
): MenuEntry {
  const vol = getSettings()[key];
  const setVol = (v: number) => {
    updateSettings({
      [key]: Math.round(clamp01(v) * 100) / 100,
    });
    ctx.bumpSettings();
  };
  return sliderRow(screen, id, {
    readout: pct(vol),
    pos: vol,
    set: setVol,
    nudge: (dir: number) => setVol(getSettings()[key] + dir * 0.05),
  });
}

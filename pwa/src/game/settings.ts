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
  setDeathScenesEnabled,
  setDialogueEnabled,
  setGeneratedMapSize,
  type BalanceTuning,
  type GeneratedMapSizeSetting,
} from "@game/menu";

import { clamp, clamp01 } from "@game/lib/vec.ts";

import { storageKey } from "../identity.ts";

import { setAudioVolumes } from "./audio.ts";
import { DEFAULT_BOT_VIEW_SPEC, isBotViewSpecId } from "./bot-view-specs.ts";
import { setHapticsEnabled } from "./haptics.ts";
// The renderer's projection leaf — imported directly rather than through
// `render.ts`, which is the whole renderer: settings is on the app's STARTUP
// path, and `tilt.ts` is an import-free leaf (the same trick `src/game/flags.ts`
// plays for the engine's own runtime toggles). See the critical-path budget in
// AGENTS.md.
import {
  clampFx,
  defaultFx,
  FX_RANGES,
  type FxName,
  type FxSettings,
} from "./render/postfx.ts";
import {
  DEFAULT_PITCH,
  DEFAULT_YAW,
  PITCH_RANGE,
  setWorldProjection,
  YAW_RANGE,
} from "./render/tilt.ts";
import { setStoreForced } from "./store.ts";
import { PICKUP_CARD_TIER_ORDER, type PickupCardTier } from "./tiers.ts";
import {
  DEFAULT_KEYBINDINGS,
  codeForChar,
  sanitizeBindings,
  type KeyBindings,
} from "./keybindings.ts";

/** How the game is steered on a desktop (touch always steers by holding and
 * dragging, and ignores this).
 *
 * `hover` (FOLLOW CURSOR): the character chases the cursor, a click uses an
 * item. `aim` (AIM & SHOOT): the keyboard walks the character, the pointer is
 * the aim — the hero favors the foe the cursor points at — and the left button
 * is the trigger; with AUTO-FIRE off the weapon only fires while it is held.
 * `gamepad` (GAMEPAD): the left stick walks, analogue — how far it is pushed is
 * the pace, so the same stick creeps and sprints — and the strike button is the
 * trigger under the same AUTO-FIRE rule the mouse trigger obeys.
 *
 * The stick is a better fit for this game than it looks: the pointer here only
 * ever supplied a DIRECTION, never a cursor to place, so a stick loses nothing
 * in translation — which is why the mode is a handful of lines rather than a
 * parallel control scheme. */
export type SteeringMode = "hover" | "aim" | "gamepad";

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

/** Vibration feedback — taking a hit (scaled to hp lost), the hero's death,
 * menu presses, and the dialogue crawl. `off` silences it; on iOS in a browser
 * — no Vibration API — it is a noop regardless (see haptics.ts). */
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

/** How big a map is carved. The three sizes are the blueprint's own
 * (each prices its own world dimensions and chamber count, so LARGE is a longer
 * search rather than the same map stretched); `random` rolls one per run off the
 * run's seed, so the scale varies along with the layout. */
export type GeneratedMapSize = GeneratedMapSizeSetting;

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

/**
 * GORE (SETTINGS → VIDEO → GORE): one switch per kind of gore, because "is this
 * too much" is not one question.
 *
 * The page splits three ways, and the split is the whole point of it being a
 * page rather than the single EXTRA GORE switch it replaced:
 *
 *   WHO BLEEDS.  One switch per gore FAMILY (game-screen/gore.ts) — people,
 *                hauntings, machines, rift-things. A player who does not want
 *                to see a PERSON opened up is not thereby asking for a rover to
 *                stop throwing sparks, and until this page existed they had to
 *                ask for both. `goreBlood` off with the other three on is
 *                exactly that request, and it is the one the switch split was
 *                added for.
 *   WHAT A KILL DOES TO THE BODY.  `goreCleaves` (a blade opens it) and
 *                `goreGibs` (a mass bursts it) — the two most graphic things in
 *                the game, and the pair a player is most likely to want gone
 *                while still wanting a hit to land visibly. They cross every
 *                family: a machine cut in two is still a body cut in two.
 *   WHAT IT LEAVES ON THE HERO.  `goreSoak` (it stays on his gear) and
 *                `goreTracks` (his boots carry it out onto clean ground). Both
 *                are BLOOD's own art in blood's own colours, so both are
 *                meaningless with `goreBlood` off — the rows are shown LOCKED
 *                there rather than hidden, the way a locked KEYS row shows
 *                where the movement went.
 *
 * Every one of them ships ON: this game is a splatter shooter, and a mob that
 * takes a blade without bleeding reads as a mob that was not hit. Each is
 * checked where its effect is DECIDED (see game-screen/gore-gate.ts), never at
 * the draw call, so `off` means nothing is drawn AND nothing is recorded.
 *
 * The device's MATURE CONTENT switch outranks all eight (app/device-policy.ts).
 */
export type GoreSwitch = "on" | "off";

/** HEALTH BARS: a display preference (SETTINGS → DISPLAY) for a small hp bar
 * drawn over every wounded mob's head (see render.ts). `on` (the default)
 * shows a tiny few-pixel bar over regular minions too; `off` keeps the field
 * clean — bosses and elites still show their bars once hurt either way. */
export type HealthBars = "on" | "off";

/** ITEM CARDS: a display preference (SETTINGS → DISPLAY) for the framed loot
 * pickup card (PickupModal). It names the LOWEST rarity that still pops a card
 * on pickup — `regular` (NORMAL, the default) cards every find, and each step
 * up the ladder (`magic`, `rare`, `set`, `unique`, `legendary`, `artifact`)
 * hides the tiers below it so only better loot takes over the thumb zone; the
 * quieter finds drop to the lower-corner feed instead. A pure presentation
 * filter (see event-fx.ts), so it needs no engine setter. */
export type PickupCardsTier = PickupCardTier;

/** QUICK DRAW: a control preference (SETTINGS → CONTROLS) for how the in-HUD
 * weapon switcher (and the 1-4 hotkeys that mirror it) ORDERS the weapons it
 * offers — see `weaponAlternatives` in game-screen/hud-model.ts.
 * `bag` (the default) lists them exactly as the BACKPACK does, so a weapon
 * lives at the same place in both and muscle memory carries across; `dps`
 * ranks them by what they'd really do in THIS hero's hands (`weaponDps` —
 * stat-scaled damage, cadence and crit), so slot 1 is always the hardest
 * hitter of the moment. The mode also picks the number each slot shows: the
 * per-hit damage in bag order, the dps figure when that is what it ranks by,
 * so the list never sorts on a number it doesn't display. A pure presentation
 * pick read app-side, so it needs no engine setter. */
export type WeaponSwitchOrder = "bag" | "dps";

/** MINIMAP: a display preference (SETTINGS → DISPLAY) for the HUD minimap's
 * view (see Minimap.tsx). `full` (the default) contain-fits the whole
 * fog-of-war level into the frame; `follow` hovers a close-up over the hero —
 * a tracking window drawn from a higher-resolution terrain layer so the
 * ground sprites read clearly instead of collapsing into mud. A pure render
 * preference read by the render loop, so it needs no engine setter. */
export type MinimapMode = "full" | "follow";

/** DIALOGUE: a display preference (SETTINGS → DISPLAY) for the hero's spoken
 * story — the level's opening monologue and post-victory epilogue, elite/boss
 * arrivals and last words, the hero's inner monologues, story-item lore,
 * companion joins, and the merchant's greeting. `on` (the default) plays them;
 * `off` silences every one, starting each level muted (a muted run skips the
 * opening monologue straight to the level-name card, and the epilogue straight
 * to the victory splash). Applied to the engine via `setDialogueEnabled`
 * (mirrors how the mute button works) — it gates presentation only, no
 * simulation rule. */
export type DialogueScenes = "on" | "off";

/** CUTSCENES: a display preference (SETTINGS → DISPLAY) for the prelude
 * cutscenes that open a level (the launch, the flight — see cutscenes.ts).
 * `on` (the default) plays them; `off` skips the whole prelude so the run opens
 * straight on the hero's intro monologue (or, with DIALOGUE off too, straight
 * on the level-name card). Applied to the engine via `setCutscenesEnabled` — a
 * presentation gate only. */
export type Cutscenes = "on" | "off";

/** DEATH SCENES: a gameplay preference (SETTINGS → GAMEPLAY) for the game's two
 * scripted death cinematics — the BOSS DEATH RITE played over a felled boss
 * (the finisher: it goes to its knees, the horde is held off, the hero closes
 * and ends it) and the hero's own DEATH SCENE (the tableau the horde gathers
 * for before the YOU DIED modal). `on` (the default) plays both; `off` sends a
 * boss straight to its last words and a fallen hero straight to the modal.
 * Applied to the engine via `setDeathScenesEnabled`.
 *
 * NOT A GORE SWITCH. What is graphic about a death has its own gate — the
 * device's MATURE CONTENT policy and the player's own GORE page, asked through
 * `gore-gate.ts`. This one only decides whether the game STOPS to show you. */
export type DeathScenes = "on" | "off";

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

/** One row of the mod load order: which mod, and whether it is switched on. */
export type ModOrderEntry = { id: string; on: boolean };

/**
 * The name the title screen is currently wearing, when an enabled CONVERSION
 * has one of its own (`ModBundle.brand`).
 *
 * It is REMEMBERED rather than recomputed, and that is the whole reason it is a
 * setting: the installed-mod list is compiled lazily, the first time the MODS
 * screen is opened, because a player with a dozen subscriptions must not pay
 * for validating a folder of YAML per mod on a launch where they only wanted
 * RESUME. So at launch there is nothing to ask — and a conversion that opened
 * under its own name yesterday and under ADA'S TRAIL today would read as a
 * bug. `modId` is carried so the memory can be dropped the moment that mod
 * stops being the enabled one.
 */
export type ModBrandMemo = { modId: string; title: string; tagline: string };

export type GameSettings = {
  steering: SteeringMode;
  /** AIM & SHOOT's autonomous trigger (see AutoFire) — desktop-only. */
  autoFire: AutoFire;
  itemUse: ItemUseMode;
  /** Equip stronger finds on pickup, or bank them to the bag (see AutoEquip). */
  autoEquip: AutoEquip;
  powerupSide: PowerupSide;
  /** Control preference: how the weapon switcher orders its slots — the
   * backpack's own order, or best-first for this hero (see WeaponSwitchOrder). */
  weaponSwitchOrder: WeaponSwitchOrder;
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
  /** The DEVELOPER menu is hidden until the secret gesture blows the title sun
   * up — seven quick taps ARM it, then a five-second click race at tempo swells
   * it until it lets go (see title-screen/use-sun-charge.ts); this latches that
   * unlock so the menu stays available across launches once discovered. */
  developerUnlocked: boolean;
  /** Developer DEBUG toggle — shows the in-run FPS meter (see DebugMode). */
  debug: DebugMode;
  /** Developer flag: automatic per-level base-stat growth (see AutoLevelStats). */
  autoLevelStats: AutoLevelStats;
  /** Developer flag: surface the coin store in any build, free (see StoreForce). */
  storeForce: StoreForce;
  /** Developer setting: which size a map is carved at (see
   * GeneratedMapSize). */
  generatedMapSize: GeneratedMapSize;
  /** THE MOD LOAD ORDER — every mod this device has seen, in the order they
   * are applied, each with its own on/off. Steam builds only.
   *
   * It is a LIST rather than a set of flags because the order IS the conflict
   * resolution: two mods that ship the same sprite both compile fine (each was
   * authored alone), and the one LATER in this list wins. So the player can fix
   * a clash by moving a row, which is the only fix that does not require one of
   * the two authors to change their mod.
   *
   * Entries are kept for mods that are no longer installed: unsubscribing and
   * resubscribing must not silently reshuffle a player's carefully-ordered
   * list, and a stale row costs nothing (it is filtered out at apply). */
  modOrder: ModOrderEntry[];
  /** What the title screen calls the game, when an enabled conversion brings
   * its own name (see ModBrandMemo). Null for the shipped game. */
  modBrand: ModBrandMemo | null;
  /** Display preference: floating "+N XP" popups on kills (see XpFloat). */
  xpFloat: XpFloat;
  /** Display preferences: one switch per kind of gore (see GoreSwitch). The
   * four families first — a player may want the machines to spark and the
   * people not to bleed — then what a killing blow does to a body, then what
   * blood leaves on the hero. */
  goreBlood: GoreSwitch;
  goreEcto: GoreSwitch;
  goreSparks: GoreSwitch;
  goreCosmic: GoreSwitch;
  goreCleaves: GoreSwitch;
  goreGibs: GoreSwitch;
  goreSoak: GoreSwitch;
  goreTracks: GoreSwitch;
  /** Display preference: hp bars over regular mobs' heads (see HealthBars). */
  healthBars: HealthBars;
  /** Display preference: lowest rarity that pops a framed loot card on pickup;
   * quieter finds drop to the corner feed (see PickupCardsTier). */
  pickupCardsTier: PickupCardsTier;
  /** Display preference: the HUD minimap's view — whole level or a close-up
   * hovering over the hero (see MinimapMode). */
  minimapMode: MinimapMode;
  /** Display preference: in-world spoken dialogue scenes (see DialogueScenes). */
  dialogue: DialogueScenes;
  /** Display preference: prelude cutscenes that open a level (see Cutscenes). */
  cutscenes: Cutscenes;
  /** Gameplay preference: the scripted death cinematics — the boss finisher and
   * the hero's death tableau (see DeathScenes). */
  deathScenes: DeathScenes;
  /** Developer fast-forward: how fast a run plays, real time (1) up to 8×,
   * chosen in the DEVELOPER → BOT VIEW flow (see GameSpeed). */
  gameSpeed: GameSpeed;
  /** Developer BOT VIEW build preset (a `bot-view-specs.ts` id): which generated
   * hero the autopilot showcases — weapon/gear lane, stat picks, and positioning
   * posture together. Chosen on the BOT VIEW GAME SPEED step; a normal player
   * never sees it. Read app-side only (GameScreen picks the loadout + bot). */
  botViewSpec: string;
  /** Developer slider: scales the KILL corpse launch — how far a killing blow
   * flings the mob flying (see GameScreen `corpseLaunch`).
   * A multiplier in [0, KNOCKBACK_MAX]: 0 = bodies topple in place, 1 = the
   * shipped feel, up to KNOCKBACK_MAX× for absurd off-screen flight. Read
   * app-side only (a pure render effect), so it needs no engine setter. */
  knockback: number;
  /** Developer slider: scales the BLOOD a landed blow throws — the spray, the
   * haze, and how much of it stays on the floor (see `bloodBlow`).
   * A multiplier in [0, BLOOD_MAX]: 0 = a bloodless field, 1 = the shipped
   * feel, up to BLOOD_MAX× for a slaughterhouse. Read app-side only (a pure
   * render effect), so it needs no engine setter. */
  blood: number;
  /** Developer slider: HOW LONG THE MESS STAYS, in seconds — the pieces of a
   * body that came apart, lying where they landed before they fade off the
   * floor (see render/gibs.ts).
   *
   * It is a knob rather than a constant because it is the one number in the
   * whole gore system that is a matter of TASTE rather than of legibility: a
   * few seconds is a punctuation mark on the kill, ten is a battlefield you
   * walk back through, and nothing about the game breaks at either end. In
   * [0, GORE_LINGER_MAX] seconds. Read app-side only (a pure render effect),
   * so it needs no engine setter. */
  goreLinger: number;
  /**
   * SETTINGS → VISUALS: the four knobs of how the field is PRESENTED — bloom on
   * the lights, the colour grade, the vignette, and the depth haze up the raked
   * floor (see `render/postfx.ts` for what each one is and which mechanism it
   * uses). Every one is an amount, 0 = off, and every one is read app-side only
   * (pure presentation), so none needs an engine setter.
   *
   * These are PLAYER settings, not developer ones — they cost frames on a phone
   * and a player has to be able to turn them off — so they are deliberately NOT
   * in `stripDeveloperState`.
   */
  bloom: number;
  colorGrade: number;
  vignette: number;
  depthHaze: number;
  /** Developer sliders: the WORLD PROJECTION — how the flat top-down
   * simulation is put on screen (see pwa/src/game/render/tilt.ts).
   *
   * `cameraPitch` is how far the camera looks DOWN (1 = straight down, 0.5 = a
   * 2:1 foreshortened floor) and `cameraYaw` how far it stands round from
   * square-on, in DEGREES (0 = axis-aligned floor tiles, 45 = the diamond grid
   * of a true isometric view). Both are pure presentation — the simulation is
   * square whatever they say — so they need no engine setter, only the
   * renderer's own `setWorldProjection`. */
  cameraPitch: number;
  cameraYaw: number;
  /** Developer BALANCE multipliers (DEVELOPER → BALANCE): runtime tuning over
   * the engine's shipped config — XP pace, mob strength, loot percentages…
   * All 1 (neutral) by default; applied via `setBalanceTuning`. */
  balance: BalanceTuning;
  /**
   * MULTIPLAYER — how a hosted session is opened, and where a joiner has been.
   * Steam builds only; everywhere else nothing reads it (see
   * `pwa/src/app/net-bridge.ts` for why a phone and a tab cannot host).
   *
   * It is a PLAYER setting rather than a developer one and is deliberately not
   * stripped from a store build: hosting is the feature.
   */
  multiplayer: SessionSettings;
};

/** Which doors a hosted session opens. BOTH by default and it should be: Steam
 * friends get the frictionless path — nothing inbound is bound at all, so no
 * port, no router mapping, no firewall rule — and everybody else gets an
 * address. */
export type SessionDoors = "both" | "steam" | "direct";

export type SessionSettings = {
  /**
   * The UDP port to TRY first.
   *
   * TRY, because the socket walks up to 27030 on `EADDRINUSE` and what it GOT
   * is what the session panel prints (`server/net/udp.ts`). A host reading this
   * number off a settings page while the socket sits one along is the exact bug
   * that makes "direct connect doesn't work" unanswerable.
   */
  port: number;
  doors: SessionDoors;
  /** Seats, host included. */
  maxPlayers: number;
  /** What a joiner must know, or "" for an open game. */
  password: string;
  /** Addresses this device has joined, newest first — the JOIN BY ADDRESS
   * screen's own list, so a LAN party is one press after the first time. */
  recent: string[];
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
    // The switcher mirrors the BACKPACK out of the box — one place per weapon
    // across both screens. A player who'd rather have the hardest hitter under
    // slot 1 at all times switches it to the dps ranking.
    weaponSwitchOrder: "bag",
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
    // The developer menu stays hidden until the hidden gesture is found.
    developerUnlocked: false,
    debug: "off",
    // Auto stat growth is opt-in — off until a dev enables it. The field
    // hero's held weapon and its swing animation are now always on (shipped
    // as the default look), so they are no longer settings.
    autoLevelStats: "off",
    // The coin store surfaces only in the native shell unless a developer
    // forces it (free purchases — see store.ts).
    storeForce: "off",
    generatedMapSize: "medium",
    // No mods until the player installs some; the list grows as they appear.
    modOrder: [],
    // The shipped game answers to its own name.
    modBrand: null,
    // Display preferences default to the shipped presentation.
    xpFloat: "on",
    // Every kind of gore ships ON — a mob that takes a blade and doesn't bleed
    // reads as a mob that wasn't hit. The GORE page is there for players who
    // want some of it quiet, one kind at a time.
    goreBlood: "on",
    goreEcto: "on",
    goreSparks: "on",
    goreCosmic: "on",
    goreCleaves: "on",
    goreGibs: "on",
    goreSoak: "on",
    goreTracks: "on",
    // Health bars over regular mobs are on out of the box; a player who wants
    // a cleaner field turns them off (bosses/elites always show theirs).
    healthBars: "on",
    // Every find pops a card out of the box (NORMAL); a player drowning in loot
    // raises the bar so only magic-and-better takes over the thumb zone.
    pickupCardsTier: "regular",
    // The minimap shows the whole level out of the box; a player who wants a
    // close-up tracking the hero switches it to follow.
    minimapMode: "full",
    // The story plays in full out of the box; a player who wants to skip the
    // talking turns dialogue and/or cutscenes off.
    dialogue: "on",
    cutscenes: "on",
    // The finisher and the death tableau both play out of the box — they are
    // the shipped experience. A player replaying a map they have cleared five
    // times turns them off to keep the pace up.
    deathScenes: "on",
    // Runs play at real time; only a developer changes this, from the BOT VIEW
    // flow, to fast-forward the autopilot (a normal player never sees it).
    gameSpeed: 1,
    // BOT VIEW showcases the ranged lane out of the box; a developer cycles it.
    botViewSpec: DEFAULT_BOT_VIEW_SPEC,
    // The overkill launch ships at 1× — a dev dials it up or down live.
    knockback: 1,
    // Blood ships at 1× — a dev dials it to 0 for a clean screenshot or up for
    // a slaughterhouse.
    blood: 1,
    // TEN SECONDS. Long enough that a cleared room is still a cleared room when
    // the player walks back through it, which is the whole reason the floor
    // remembers blood at all — a mess that tidied itself away in three would
    // undo that for the pieces while the stains stayed.
    goreLinger: 10,
    cameraPitch: DEFAULT_PITCH,
    cameraYaw: DEFAULT_YAW,
    // The presentation ships ON, at the amounts `postfx.ts` calls the shipped
    // look: this is how the game is meant to be seen, and the rows exist for a
    // player who wants it plainer or a phone that wants the frames back.
    ...defaultFx(),
    // Balance multipliers start at the shipped tuning (neutral 1 for all but
    // the world's pace — see BALANCE_TUNING_DEFAULTS).
    balance: { ...BALANCE_TUNING_DEFAULTS },
    multiplayer: {
      port: DEFAULT_SESSION_PORT,
      doors: "both",
      maxPlayers: MAX_SESSION_PLAYERS,
      password: "",
      recent: [],
    },
  };
}

/** The conventional port, and why it is this one: 27015 sits in Steam's own
 * game-port range, so a player who has already forwarded ports for another game
 * very likely has it open. Mirrors `DEFAULT_PORT` in `server/wire/address.ts`,
 * spelled here rather than imported because this module is on the app's STARTUP
 * path and stays import-light. */
export const DEFAULT_SESSION_PORT = 27015;
/** Seats, host included. Mirrors `MAX_CLIENTS` in `server/wire/protocol.ts`. */
export const MAX_SESSION_PLAYERS = 8;

/** The stored session block, read defensively — the port in particular, which
 * reaches a `bind()` call. */
function loadSession(stored: unknown, base: SessionSettings): SessionSettings {
  const held = stored as Partial<SessionSettings> | null;
  if (!held || typeof held !== "object") return base;
  const port = Number(held.port);
  return {
    port:
      Number.isFinite(port) && port >= 1 && port <= 65535
        ? Math.floor(port)
        : base.port,
    doors:
      held.doors === "both" || held.doors === "steam" || held.doors === "direct"
        ? held.doors
        : base.doors,
    maxPlayers:
      typeof held.maxPlayers === "number"
        ? clamp(Math.round(held.maxPlayers), 2, MAX_SESSION_PLAYERS)
        : base.maxPlayers,
    password:
      typeof held.password === "string"
        ? held.password.slice(0, MAX_SESSION_PASSWORD)
        : base.password,
    recent: Array.isArray(held.recent)
      ? held.recent
          .filter((entry): entry is string => typeof entry === "string")
          .slice(0, MAX_RECENT_SESSIONS)
      : base.recent,
  };
}

/** How long a session password may be. Long enough for a phrase, short enough
 * to type on a controller. */
export const MAX_SESSION_PASSWORD = 24;
/** How many addresses JOIN BY ADDRESS remembers. A list, not a history: what it
 * is for is the four machines at a LAN party, not an archive. */
export const MAX_RECENT_SESSIONS = 6;

/** Sanitize a stored balance object: every knob falls back to the shipped
 * default unless it is a finite, non-negative number (0 is a valid "system off"
 * slider setting; the engine clamps the upper range further).
 *
 * A stored blob is honored ONLY once DEVELOPER is unlocked, because the BALANCE
 * page is the only thing that can write one: before that unlock the stored
 * numbers are, by construction, some PAST release's defaults — so keeping them
 * would pin a returning player to the tuning they happened to install under and
 * silently withhold every balance change since (the world's shipped pace above
 * all). An unlocked developer's own values are theirs and survive; RESET ALL is
 * the row that takes them back to the shipped set. */
function loadBalance(
  stored: unknown,
  developerUnlocked: boolean,
): BalanceTuning {
  const balance = { ...BALANCE_TUNING_DEFAULTS };
  if (!developerUnlocked) return balance;
  if (typeof stored !== "object" || stored === null) return balance;
  for (const key of Object.keys(balance) as (keyof BalanceTuning)[]) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      balance[key] = value;
    }
  }
  return balance;
}

/** Upper bound of the DEVELOPER → KNOCKBACK slider — 1× is the shipped feel,
 * so 3× is deep into off-the-screen territory. Shared by the slider row
 * (position ↔ multiplier) and the stored-value clamp. */
export const KNOCKBACK_MAX = 3;
function clampKnockback(v: number): number {
  return Math.round(clamp(v, 0, KNOCKBACK_MAX) * 20) / 20;
}

/** Upper bound of the DEVELOPER → BLOOD slider — 1× is the shipped feel, so 3×
 * is a floor that reddens three times as fast. Shared by the slider row
 * (position ↔ multiplier) and the stored-value clamp. */
export const BLOOD_MAX = 3;
function clampBlood(v: number): number {
  return Math.round(clamp(v, 0, BLOOD_MAX) * 20) / 20;
}

/** Upper bound of the DEVELOPER → GORE LINGER slider, in SECONDS. Half a minute
 * is well past any reasonable taste and that is the point of a ceiling: it has
 * to be possible to hold the whole mess on screen long enough to photograph it.
 * Snapped to half-seconds, which is finer than anyone can judge. */
export const GORE_LINGER_MAX = 30;
function clampGoreLinger(v: number): number {
  return Math.round(clamp(v, 0, GORE_LINGER_MAX) * 2) / 2;
}

/** The DEVELOPER → CAMERA sliders, snapped so a dragged value reads as a round
 * number rather than as 0.7314. The bounds are the renderer's own — a
 * projection outside them is not a camera angle, it is a broken picture. */
function clampPitch(v: number): number {
  return Math.round(clamp(v, PITCH_RANGE.min, PITCH_RANGE.max) * 100) / 100;
}
function clampYaw(v: number): number {
  return Math.round(clamp(v, YAW_RANGE.min, YAW_RANGE.max));
}

/**
 * The SETTINGS → VISUALS knobs, read out of a stored blob and clamped to their
 * own ranges (`render/postfx.ts` owns those). Snapped to a fiftieth so a dragged
 * value reads as a round number, exactly as the camera pair above.
 *
 * A knob the stored settings never mentioned falls back to the shipped default
 * rather than to zero — a player who last saved before these existed gets the
 * game as it is made, not a flat picture.
 */
function visualsFrom(
  stored: Partial<Record<FxName, unknown>>,
  base: FxSettings,
): FxSettings {
  // BUILT FROM NOTHING, never cloned from `base` — and that is the whole of it.
  // `load()` hands its FULL defaults object in as `base` (a `GameSettings` is a
  // structurally valid `FxSettings`), so a `{ ...base }` here returns EVERY
  // default the game has, and this call is the LAST spread in `load()`'s object
  // literal: it silently re-stamped every setting read above it with its
  // shipped value, and nothing a player changed survived a reload. TypeScript
  // cannot see it — the declared return type carries four keys and the runtime
  // object carried sixty — so the guard is this comment plus
  // `tests/settings_load_test.ts`.
  const out = {} as FxSettings;
  for (const name of Object.keys(FX_RANGES) as FxName[]) {
    const value = stored[name];
    out[name] =
      typeof value === "number" && Number.isFinite(value)
        ? Math.round(clampFx(name, value) * 50) / 50
        : base[name];
  }
  return out;
}

/** The GAME SPEED choices the DEVELOPER → BOT VIEW step cycles through — real
 * time up to a brisk 8× fast-forward for the autopilot. Kept discrete so the
 * row cycles cleanly (bot playtests bypass this and go higher via `?speed=` /
 * `__speed`). Shared by the menu row and the stored-value clamp. */
export const GAME_SPEEDS = [1, 2, 4, 8];
/** Snap a stored/patched game speed to one of the allowed steps, real time (1)
 * on anything unexpected. */
function clampGameSpeed(v: unknown): number {
  const n = typeof v === "number" ? Math.round(v) : 1;
  return GAME_SPEEDS.includes(n) ? n : 1;
}

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

/** Force every DEVELOPER-owned field back to its shipped default. A production
 * store build carries no developer surfaces at all (see `__DEV_TOOLS__`), so a
 * value one of them stored must not outlive them: the same device can carry a
 * TestFlight install's settings into the App Store update, and a latched
 * `developerUnlocked`, a FORCE STORE granting free coin packs, or a set of
 * BALANCE multipliers would then quietly govern a shipped game. Applied at load
 * (the stored JSON is left alone — reinstalling a dev build restores it). */
/** Whether a stored value is one of the four generated-map size choices. */
function isGeneratedMapSize(v: unknown): v is GeneratedMapSize {
  return v === "small" || v === "medium" || v === "large" || v === "random";
}

function stripDeveloperState(s: GameSettings): GameSettings {
  const base = defaults();
  return {
    ...s,
    developerUnlocked: base.developerUnlocked,
    debug: base.debug,
    autoLevelStats: base.autoLevelStats,
    storeForce: base.storeForce,
    generatedMapSize: base.generatedMapSize,
    gameSpeed: base.gameSpeed,
    botViewSpec: base.botViewSpec,
    knockback: base.knockback,
    blood: base.blood,
    goreLinger: base.goreLinger,
    cameraPitch: base.cameraPitch,
    cameraYaw: base.cameraYaw,
    balance: base.balance,
  };
}

/**
 * The stored load order, sanitized.
 *
 * Read defensively for a reason the other settings do not have: this list is
 * keyed by MOD IDS, which come from files a stranger wrote and a player
 * installed. A malformed entry must drop out rather than reach the apply, and a
 * DUPLICATE id must collapse — two rows for one mod would make "later wins"
 * meaningless, since the mod would be both earlier and later than itself.
 */
function loadModOrder(stored: unknown): ModOrderEntry[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const out: ModOrderEntry[] = [];
  for (const entry of stored) {
    const id = (entry as ModOrderEntry | null)?.id;
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, on: (entry as ModOrderEntry).on !== false });
  }
  return out;
}

/**
 * The remembered conversion brand, read defensively.
 *
 * It is the one persisted value whose CONTENT a stranger wrote, and it is drawn
 * as the largest text on the front page — so it is re-checked here rather than
 * trusted: three strings, or nothing. (The compiler already held it to the
 * pixel font and to a length; this is the half that survives someone editing
 * localStorage.)
 */
function loadModBrand(stored: unknown): ModBrandMemo | null {
  const memo = stored as ModBrandMemo | null;
  if (!memo || typeof memo !== "object") return null;
  const { modId, title, tagline } = memo;
  if (typeof modId !== "string" || !modId) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  return {
    modId,
    title: title.slice(0, BRAND_TITLE_MAX),
    tagline:
      typeof tagline === "string" ? tagline.slice(0, BRAND_TAGLINE_MAX) : "",
  };
}

/** Mirrors the compiler's own caps (`readBrand` in mod/tools/build.mjs) — the
 * title screen measures and shrinks to fit, so an essay is unreadable rather
 * than overflowing. */
const BRAND_TITLE_MAX = 28;
const BRAND_TAGLINE_MAX = 48;

/** The eight GORE switches this settings file owns, in the order the page
 * shows them. Kept as a list so the loader, the RESET row and the tests all
 * read one definition of "every kind of gore". */
export const GORE_SWITCHES = [
  "goreBlood",
  "goreEcto",
  "goreSparks",
  "goreCosmic",
  "goreCleaves",
  "goreGibs",
  "goreSoak",
  "goreTracks",
] as const;

export type GoreSwitchKey = (typeof GORE_SWITCHES)[number];

/**
 * The GORE switches, read back — and the one legacy key they replaced.
 *
 * EXTRA GORE was a single switch over the lot, so a save carrying `off` is a
 * player who has already said they want no gore: it arrives here as all eight
 * off, never as a page of switches that quietly turned themselves back on
 * behind a player who had turned the blood off years ago. An `on` (or a save
 * predating the row entirely) takes the shipped defaults, which is the same
 * thing it meant before.
 */
function loadGore(
  stored: Partial<GameSettings> & { extraGore?: unknown },
  base: GameSettings,
): Record<GoreSwitchKey, GoreSwitch> {
  const legacyOff = stored.extraGore === "off";
  const out = {} as Record<GoreSwitchKey, GoreSwitch>;
  for (const key of GORE_SWITCHES) {
    const value = stored[key];
    out[key] =
      value === "on" || value === "off" ? value : legacyOff ? "off" : base[key];
  }
  return out;
}

function load(): GameSettings {
  const base = defaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<GameSettings>;
    // Read ahead of the object below: the BALANCE blob is only meaningful once
    // this is true (see loadBalance).
    const developerUnlocked =
      typeof stored.developerUnlocked === "boolean"
        ? stored.developerUnlocked
        : base.developerUnlocked;
    return {
      steering:
        stored.steering === "aim" ||
        stored.steering === "hover" ||
        stored.steering === "gamepad"
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
      weaponSwitchOrder:
        stored.weaponSwitchOrder === "bag" || stored.weaponSwitchOrder === "dps"
          ? stored.weaponSwitchOrder
          : base.weaponSwitchOrder,
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
      developerUnlocked,
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
      // A save from before every map was carved may still carry a
      // `generatedMaps` on/off — there is nothing to turn off any more, so it
      // is read as the retired key it is and dropped.
      generatedMapSize: isGeneratedMapSize(stored.generatedMapSize)
        ? stored.generatedMapSize
        : base.generatedMapSize,
      modOrder: loadModOrder(stored.modOrder),
      modBrand: loadModBrand(stored.modBrand),
      xpFloat:
        stored.xpFloat === "on" || stored.xpFloat === "off"
          ? stored.xpFloat
          : base.xpFloat,
      ...loadGore(stored, base),
      healthBars:
        stored.healthBars === "on" || stored.healthBars === "off"
          ? stored.healthBars
          : base.healthBars,
      pickupCardsTier: (PICKUP_CARD_TIER_ORDER as readonly string[]).includes(
        stored.pickupCardsTier as string,
      )
        ? (stored.pickupCardsTier as PickupCardsTier)
        : base.pickupCardsTier,
      minimapMode:
        stored.minimapMode === "full" || stored.minimapMode === "follow"
          ? stored.minimapMode
          : base.minimapMode,
      dialogue:
        stored.dialogue === "on" || stored.dialogue === "off"
          ? stored.dialogue
          : base.dialogue,
      cutscenes:
        stored.cutscenes === "on" || stored.cutscenes === "off"
          ? stored.cutscenes
          : base.cutscenes,
      deathScenes:
        stored.deathScenes === "on" || stored.deathScenes === "off"
          ? stored.deathScenes
          : base.deathScenes,
      gameSpeed: clampGameSpeed(stored.gameSpeed),
      botViewSpec: isBotViewSpecId(stored.botViewSpec)
        ? stored.botViewSpec
        : base.botViewSpec,
      knockback:
        typeof stored.knockback === "number" &&
        Number.isFinite(stored.knockback)
          ? clampKnockback(stored.knockback)
          : base.knockback,
      blood:
        typeof stored.blood === "number" && Number.isFinite(stored.blood)
          ? clampBlood(stored.blood)
          : base.blood,
      goreLinger:
        typeof stored.goreLinger === "number" &&
        Number.isFinite(stored.goreLinger)
          ? clampGoreLinger(stored.goreLinger)
          : base.goreLinger,
      cameraPitch:
        typeof stored.cameraPitch === "number" &&
        Number.isFinite(stored.cameraPitch)
          ? clampPitch(stored.cameraPitch)
          : base.cameraPitch,
      cameraYaw:
        typeof stored.cameraYaw === "number" &&
        Number.isFinite(stored.cameraYaw)
          ? clampYaw(stored.cameraYaw)
          : base.cameraYaw,
      // Each VISUALS knob clamped to its OWN range (`postfx.ts` owns them), so a
      // hand-edited or downgraded store can't hand the renderer a bloom of 40.
      ...visualsFrom(stored, base),
      balance: loadBalance(stored.balance, developerUnlocked),
      multiplayer: loadSession(stored.multiplayer, base.multiplayer),
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

const settings: GameSettings = __DEV_TOOLS__
  ? load()
  : stripDeveloperState(load());
applyAudioVolumes(settings);
setHapticsEnabled(settings.vibration === "on");
setAutoStatGainsEnabled(settings.autoLevelStats === "on");
setAutoEquipEnabled(settings.autoEquip === "on");
setDialogueEnabled(settings.dialogue === "on");
setCutscenesEnabled(settings.cutscenes === "on");
setDeathScenesEnabled(settings.deathScenes === "on");
setStoreForced(settings.storeForce === "on");
setGeneratedMapSize(settings.generatedMapSize);
setWorldProjection({ pitch: settings.cameraPitch, yaw: settings.cameraYaw });
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
  settings.blood = clampBlood(settings.blood);
  settings.goreLinger = clampGoreLinger(settings.goreLinger);
  settings.cameraPitch = clampPitch(settings.cameraPitch);
  settings.cameraYaw = clampYaw(settings.cameraYaw);
  settings.gameSpeed = clampGameSpeed(settings.gameSpeed);
  applyAudioVolumes(settings);
  setHapticsEnabled(settings.vibration === "on");
  setAutoStatGainsEnabled(settings.autoLevelStats === "on");
  setAutoEquipEnabled(settings.autoEquip === "on");
  setDialogueEnabled(settings.dialogue === "on");
  setCutscenesEnabled(settings.cutscenes === "on");
  setDeathScenesEnabled(settings.deathScenes === "on");
  setStoreForced(settings.storeForce === "on");
  setGeneratedMapSize(settings.generatedMapSize);
  setWorldProjection({ pitch: settings.cameraPitch, yaw: settings.cameraYaw });
  setBalanceTuning(settings.balance);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode) — settings stay in-memory.
  }
  return settings;
}

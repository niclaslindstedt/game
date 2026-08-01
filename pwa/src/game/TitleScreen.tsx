// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style splash / main menu: a starfield, the big title, and a
// keyboard-and-pointer menu — NEW GAME leads to the difficulty ladder, and
// picking a difficulty starts the run. The screen is the ORCHESTRATOR of the
// title-screen/ modules: the per-screen rows come from buildMenu (the
// menus-*.ts builders), the sky and the sun's detonation from TitleBackdrop,
// the rankings from HighScoresBoard, and the row rendering from MenuList —
// this file owns the state that ties them together (which screen is up, where
// the cursor sits, the carried difficulty/warp picks) plus the global
// keyboard steering.

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { Difficulty } from "@game/menu";

import { PixelText } from "@ui/lib/PixelText.tsx";
import { useScrollFade } from "@ui/lib/scroll-fade.ts";

import { IDENTITY } from "../identity.ts";
import { subscribeDevicePolicy } from "../app/device-policy.ts";
import { canVibrate } from "../app/platform.ts";
import { canQuitApp, quitApp } from "../app/quit-bridge.ts";

import { LoadingScreen } from "./LoadingScreen.tsx";
import type { CampaignRow, ScoreMetric } from "./highscores.ts";
import {
  loadGameAssets,
  spriteCursor,
  spriteDataUrl,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { playMenuHaptic } from "./haptics.ts";
import { playTitleMusic } from "./music/index.ts";
import type { Character } from "./characters.ts";
import type { JoinIntent } from "./session-intent.ts";
import {
  mouseButtonCode,
  wheelCode,
  withBinding,
  type BindableAction,
} from "./keybindings.ts";
import { getSettings, updateSettings } from "./settings.ts";
import { playUiSound } from "./sfx/ui.ts";
import { HighScoresBoard } from "./title-screen/HighScoresBoard.tsx";
import { MenuHeading } from "./title-screen/MenuHeading.tsx";
import { MenuList } from "./title-screen/MenuList.tsx";
import { StoreBackdrop } from "./title-screen/StoreBackdrop.tsx";
import { TitleBackdrop } from "./title-screen/TitleBackdrop.tsx";
import {
  unlockAudio,
  type MenuContext,
  type MenuEntry,
  type MenuScreen,
  type PromptSpec,
  type TitleNotice,
} from "./title-screen/menu-model.ts";
import {
  parentOf,
  rowAria,
  screenDef,
  SETTINGS_TREE,
} from "./title-screen/menu-tree.ts";
import { buildMenu, headingFor } from "./title-screen/menus.ts";
import { furthestUnlockedDifficulty } from "./title-screen/menus-campaign.ts";
import { useCharacterTransfer } from "./title-screen/use-character-transfer.ts";
import { useCloudSave } from "./title-screen/use-cloud-save.ts";
import { useCoinStore } from "./title-screen/use-coin-store.ts";
import type { InstalledMod } from "../app/mods-bridge.ts";
import type { ModBundle } from "./mod-state.ts";
import { useMods } from "./title-screen/use-mods.ts";
import { useSessions } from "./title-screen/use-sessions.ts";
import { PixelPrompt } from "./title-screen/PixelPrompt.tsx";
import {
  useHelpWrapRem,
  useMenuOverflow,
  useViewportFlags,
  useViewportMetrics,
} from "./title-screen/use-title-layout.ts";

// Lazy for the SEO critical-path budget: the browser is a menu destination,
// not startup code (see the GameScreen twin of this note).
const AchievementsScreen = lazy(() =>
  import("./AchievementsScreen.tsx").then((m) => ({
    default: m.AchievementsScreen,
  })),
);
// Same reasoning for the developer EFFECTS GALLERY: it drags the whole renderer
// + engine step in behind it, and nobody reaches it from a cold start. The
// /* @__PURE__ */ is what lets a build without the developer tooling
// (`__DEV_TOOLS__` false — the store upload) drop the chunk outright: with the
// only JSX use gated away the binding is dead, but Rollup will not remove a
// bare `lazy(...)` call it cannot prove side-effect free, and the whole gallery
// would ride along unreachable. Same for the ARSENAL below.
const EffectsGallery = /* @__PURE__ */ lazy(() =>
  import("./effects-gallery/EffectsGallery.tsx").then((m) => ({
    default: m.EffectsGallery,
  })),
);
// The LOST & FOUND and the developer ARSENAL, lazy for the same reason and with
// the sharpest teeth of the set: both mint their display items through the
// engine's own `createGame` + loot roller, so a static import parks the whole
// simulation — level/item/enemy catalogs included — in the entry chunk to draw
// a menu nobody has opened yet.
const VaultScreen = lazy(() =>
  import("./VaultScreen.tsx").then((m) => ({ default: m.VaultScreen })),
);
const ArsenalScreen = /* @__PURE__ */ lazy(() =>
  import("./ArsenalScreen.tsx").then((m) => ({ default: m.ArsenalScreen })),
);

export function TitleScreen({
  character,
  onStart,
  onResume,
  onNewGame,
  onLoadGame,
  onHowToPlay,
  onCharacterChange,
  onJoin,
  startOnDifficulty = false,
}: {
  /** The active hero, or null when none is selected yet (the menu still opens
   * on the title; PLAY then routes through character select). The difficulty
   * ladder and level picker read their unlock/clear state from this character's
   * progress, and the run starts from their build. */
  character: Character | null;
  onStart: (
    difficulty: Difficulty,
    levelId: string,
    opts?: { skipIntro?: boolean; botView?: boolean },
  ) => void;
  /** Present only while a run sits parked in memory (the player exited to the
   * menu from the pause screen). When set, the menu offers RESUME, which
   * drops straight back into the frozen run. */
  onResume?: () => void;
  /** PLAY → NEW GAME: open the roster straight on the create form to mint a
   * fresh hero, then drop into the difficulty ladder for it. */
  onNewGame: () => void;
  /** PLAY → LOAD GAME: open the roster to pick (or remove) an existing hero,
   * then resume the chosen one at the beginning of its current level — or open
   * the difficulty ladder if no campaign is under way. */
  onLoadGame: () => void;
  /** HOW TO PLAY: launch the self-playing showcase run (App drives it as a
   * demo BOT VIEW — see demo.ts / GameScreen `demo`). */
  onHowToPlay: () => void;
  /** The active hero changed here rather than in a run — the LOST & FOUND's
   * buy-back spends the purse and drops the piece into the banked bag. App
   * adopts it so the next run starts from the updated build. */
  onCharacterChange: (character: Character) => void;
  /** Mount straight on the difficulty ladder (set when returning from the
   * roster via PLAY) instead of the main menu. */
  startOnDifficulty?: boolean;
  /** Go and watch somebody else's session (JOIN GAME / JOIN BY ADDRESS). The
   * menu never connects: joining is a RUN, and a run belongs to the app. */
  onJoin: (intent: JoinIntent) => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [screen, setScreen] = useState<MenuScreen>(
    startOnDifficulty && character ? "difficulty" : "main",
  );
  // Cursor position per screen; the difficulty ladder opens on the hero's
  // furthest-unlocked rung (see furthestUnlockedDifficulty).
  const [cursor, setCursor] = useState(() =>
    startOnDifficulty && character ? furthestUnlockedDifficulty(character) : 0,
  );
  // The difficulty picked on the ladder — the level-select screen that
  // follows reads it to decide which levels are unlocked (progress is per
  // difficulty), and it carries into the run.
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  // Warp mode: the level list was opened via the developer menu's SELECT LEVEL,
  // so every level is reachable regardless of progress and picking one skips
  // the intro.
  const [warp, setWarp] = useState(false);
  // BOT VIEW: the warp pickers were opened via DEVELOPER → BOT VIEW, so picking a
  // level hands the run to the engine autopilot (a realistic arrival hero) rather
  // than starting a normal playable run. Rides on top of `warp` (same pickers).
  const [botView, setBotView] = useState(false);
  // The level a BOT VIEW run was launched at, stashed while the GAME SPEED step
  // (the `botspeed` screen, shown AFTER difficulty + level) picks the
  // fast-forward multiplier before the run finally starts. Null off that flow.
  const [botLevel, setBotLevel] = useState<string | null>(null);
  // The scrollable menu column: each screen change starts reading from the
  // top (the selected row's scrollIntoView would otherwise land a tall screen
  // — SETTINGS — scrolled to its BACK row, hiding the content).
  const contentRef = useRef<HTMLDivElement | null>(null);
  // The HIGH SCORES board's axes and its opened breakdown card (the board
  // itself steers them — see HighScoresBoard); kept here so leaving the board
  // and coming back lands where the player left off.
  const [scoreDifficulty, setScoreDifficulty] = useState<Difficulty>("medium");
  const [scoreMetric, setScoreMetric] = useState<ScoreMetric>("kills");
  const [scoreDetail, setScoreDetail] = useState<CampaignRow | null>(null);
  // Which action is mid-rebind (KEY BINDINGS): the next key/mouse press is
  // captured as its new bind. Null when not listening.
  const [captureBind, setCaptureBind] = useState<BindableAction | null>(null);
  const { compact, wide } = useViewportFlags();
  // The width budget a sub-screen title is fitted against (see MenuHeading).
  const { width: viewportWidth, uiScale } = useViewportMetrics();
  // KEY BINDINGS only make sense where there's a physical keyboard to rebind,
  // so the row is desktop-only: any device with a fine pointer (a mouse or
  // trackpad, which travels with a keyboard) shows it; touch-only phones and
  // tablets don't. A device characteristic, so it's read once at mount.
  const hasFinePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: fine)").matches;
  // SWIPE BARS is a touch GESTURE, so its row shows only where touch exists at
  // all — asked separately from the fine-pointer probe because a touch laptop
  // has both. A device characteristic, read once at mount like the others.
  const hasTouch =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: coarse)").matches;
  // The VIBRATION row is offered only where a buzz can actually land: a
  // touch-primary device whose browser has the Vibration API (Android in a
  // browser or an installed PWA), or the native app (Taptic bridge). Desktop
  // (API present but no motor) and all of iOS (no API) would show a dead
  // switch, so it's hidden there (see native/platform.ts `canVibrate`). A device
  // characteristic, so it's read once at mount alongside the pointer probe.
  const canBuzz = canVibrate();
  // QUIT is a desktop-shell row: a browser tab cannot close itself and a phone
  // has a home button, so everywhere else the row is absent rather than dead.
  // A build characteristic, read once at mount like the two above.
  const canQuit = canQuitApp();

  const logoScale = compact ? 7 : wide ? 10 : 6;

  // The row the selection cursor is on, so cursor moves can keep it in view.
  // HTMLElement, not HTMLButtonElement: the LIBRARY row renders as an
  // `<a href>` (see `MenuEntry.href`), and only `scrollIntoView` is ever called
  // on this, which both element types have.
  const selectedRowRef = useRef<HTMLElement | null>(null);
  const prevScreenRef = useRef(screen);
  useEffect(() => {
    if (prevScreenRef.current !== screen) {
      // Fresh screen: start reading from the top. Scrolling the selected row
      // into view here instead used to land a taller-than-viewport screen
      // (SETTINGS on a small phone or a 2×-scaled tablet) scrolled to its
      // BACK row, clipping the header and the content's first lines.
      prevScreenRef.current = screen;
      contentRef.current?.scrollTo(0, 0);
    } else {
      // In-screen cursor move: keep the highlighted row visible as a long
      // list (levels, settings) scrolls under keyboard navigation.
      selectedRowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [screen, cursor]);
  // A long blurb (the developer flags carry sentence-length ones) would stretch
  // the centered menu wider than a portrait phone, shoving every label to the
  // left and the selection cursor off the screen edge. On narrow screens cap
  // the wrap width so a long blurb folds to a second line instead; landscape /
  // desktop (wide) keep the roomy single-line look.
  const blurbMaxWidth = wide ? undefined : 20;
  // The settings tree's bottom help line wraps at a fixed SHARE of the screen
  // (see useHelpWrapRem) rather than a fixed rem: a cap wide enough to keep a
  // desktop's help on one line ran a portrait phone's help edge to edge.
  const helpMaxWidth = useHelpWrapRem();

  useEffect(() => {
    let alive = true;
    void loadGameAssets().then((loaded) => {
      if (alive) setAssets(loaded);
    });
    // Returning from a run the context is already unlocked — bring the
    // theme back without waiting for a gesture.
    if (synth.now() !== null) playTitleMusic();
    return () => {
      alive = false;
    };
  }, []);

  // The menu rows also scroll when a tall list overflows (see useMenuOverflow).
  const menuRef = useRef<HTMLElement>(null);
  // The screens whose row lists can genuinely outgrow a short viewport — the
  // level ladder, the rebind list, the developer knobs — share the
  // measure-then-cap treatment (see useMenuOverflow). Which ones those are is
  // the tree's `scroll:`, so a new long page joins by being authored.
  const tallMenu = screenDef(screen).scroll === true;
  // Settings live in a plain singleton; mirror a tick so labels re-render.
  const [settingsTick, setSettingsTick] = useState(0);
  const bumpSettings = useCallback(() => setSettingsTick((t) => t + 1), []);
  // The device's own content switches (iOS Settings → <app>) are a settings
  // singleton too, just one this app can't write — so a change there rebuilds
  // the rows through the very same tick. It is the menu that has to notice:
  // STORE and GORE are rows whose EXISTENCE the policy decides, and the
  // player flipping the switch is by definition standing in this menu, having
  // just come back from Settings.
  useEffect(() => subscribeDevicePolicy(bumpSettings), [bumpSettings]);

  // The hidden developer gesture, in two movements: seven quick taps on the
  // title sky's sun ARM it, then a CLICK RACE — a press every 250 ms, five
  // banked seconds of it — swells the star until it lets go (the counting, the
  // beat and the build-up live in TitleBackdrop / use-sun-charge.ts /
  // sun-race.ts). Holding the race to the top detonates the sun, and the unlock
  // latches once the blast has played out — the DEVELOPER row then appears in
  // SETTINGS for the player to find on their own. The gesture disarms once it
  // is latched.
  // A production store build ships no developer tooling, so the gesture is not
  // armed there — `__DEV_TOOLS__` is a build-time literal, so the whole reveal
  // (and the menu it opens) folds out of the bundle.
  const [sunBlast, setSunBlast] = useState(false);
  const devArmed = __DEV_TOOLS__ && !getSettings().developerUnlocked;
  const onSunCharged = useCallback(() => setSunBlast(true), []);
  const onSunBlastDone = useCallback(() => {
    setSunBlast(false);
    updateSettings({ developerUnlocked: true });
    bumpSettings();
  }, [bumpSettings]);

  // Planetarium test view (`?skytest`): strip the menu chrome so the orbiting
  // solar system can be inspected on a bare sky — no logo/menu/footer
  // overlapping the bodies.
  const skyTest = new URLSearchParams(window.location.search).has("skytest");

  // Character transfer (SETTINGS → DATA → EXPORT / IMPORT CHARACTER) and the
  // COIN STORE share the result line shown under the menu.
  const [transferNotice, setTransferNotice] = useState<TitleNotice | null>(
    null,
  );
  const {
    transferOpen,
    roster,
    refreshRoster,
    exportPicks,
    toggleExportPick,
    beginExportPicker,
    exportPicked,
    pickImport,
    runSeed,
  } = useCharacterTransfer(setTransferNotice);
  const {
    storeOpen,
    storePackSku,
    setStorePackSku,
    storeHeroId,
    setStoreHeroId,
    storeAmount,
    setStoreAmount,
    storePrices,
    storeBusy,
    storeCelebrate,
    runPurchase,
    runSend,
  } = useCoinStore({
    screen,
    setScreen,
    setCursor,
    setNotice: setTransferNotice,
    refreshRoster,
  });
  // STEAM WORKSHOP MODS (main menu → MODS). Steam builds only; every other
  // build reports unavailable and the row never appears.
  //
  // The apply is a DYNAMIC import, and it has to be: `game/mods.ts` reaches
  // `@game/core` for `registerDefs` and the shipped catalogs, and a static
  // import here would park the whole simulation in the app's entry chunk to
  // draw a menu row (the same reason the vault and the arsenal are lazy).
  const onPlayMods = useCallback(
    (chosen: InstalledMod[]) => {
      if (!assets) return;
      const bundles = chosen.map((mod) => mod.bundle!).filter(Boolean);
      if (bundles.length === 0) return;
      void import("./mods.ts").then(async ({ applyMods }) => {
        await applyMods(bundles, assets.sprites);
        // Straight to the difficulty ladder: a mod changes WHAT is played, not
        // how a run is started, so it joins the normal flow at the same point
        // PLAY does rather than growing a second one.
        setScreen("difficulty");
        setCursor(0);
      });
    },
    [assets],
  );
  // THE MOD DEV HOOK — `window.__mods(bundles)` under `?debug`, so the
  // PLAYTEST HARNESS can drive a mod in the REAL renderer.
  //
  // A mod otherwise reaches the game only through the Steam build's MODS
  // screen, which a headless browser has no way to open — leaving a mod author
  // with every measuring instrument in the repo except the one that actually
  // plays their level. The hook takes exactly what the MODS screen passes
  // (compiled bundles, the same `applyMods`), so nothing here is a second way
  // to load a mod; it is the same way, called from outside. Gated on
  // `__DEV_TOOLS__` (the store build drops it at compile time) AND `?debug`, so
  // no ordinary page ever carries it. See pwa/scripts/playtest.mjs.
  useEffect(() => {
    if (!__DEV_TOOLS__ || !assets) return;
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const dev = window as {
      __mods?: (bundles: ModBundle[]) => Promise<void>;
    };
    dev.__mods = async (bundles) => {
      const { applyMods } = await import("./mods.ts");
      await applyMods(bundles, assets.sprites);
      bumpSettings();
    };
    return () => {
      delete dev.__mods;
    };
  }, [assets, bumpSettings]);
  const { modsOpen, mods, brand } = useMods({
    screen,
    setNotice: setTransferNotice,
    onPlayMods,
  });
  // MULTIPLAYER (Steam builds only): the lobby list, the firewall check, and
  // the persisted session settings the HOST screen writes through.
  const { netOpen, net } = useSessions({
    screen,
    // A player is known in a session by the hero they came with; with no hero
    // picked yet the roster is one press away and the name is a placeholder
    // nothing is stored under.
    heroName: character?.name ?? "PLAYER",
    // §4.2's handshake rule needs to know which kind of hero is knocking:
    // hardcore and softcore never share a game.
    heroHardcore: character?.hardcore === true,
    onJoin,
  });
  // The one line of text the menu ever asks for — a password, a port, an
  // address. Held here rather than inside a screen because it is a MODAL over
  // the whole menu: while it is up the arrow keys belong to the field.
  const [prompt, setPrompt] = useState<PromptSpec | null>(null);
  // WHOSE GAME THIS IS. A total conversion may bring its own name and tagline
  // (`ModBundle.brand`), and this is the only surface that wears it: the
  // storage prefix, the precache id, the character archive's game name and
  // every discovery surface stay the INSTALL's, because a mod that moved those
  // would orphan the player's roster and rewrite a site it does not own.
  const brandTitle = brand?.title ?? IDENTITY.title;
  const brandTagline = brand?.tagline || IDENTITY.tagline;
  // CLOUD SAVE (SETTINGS → DATA): the live sync state behind the status row,
  // and the SYNC NOW runner. A merge landing while the menu is open refreshes
  // the roster through the same `refreshRoster` the transfer flows use.
  const { cloudOpen, cloudState, runCloudSync } = useCloudSave({
    setNotice: setTransferNotice,
    refreshRoster,
  });

  // The LOST & FOUND row exists only while the active hero actually has
  // something banked in it (a paid AUTO PILOT ride threw loot away — see
  // items/vault.ts), so the main menu never carries a permanently empty row.
  const hasVault = (character?.loadout?.vault ?? []).length > 0;

  const ctx: MenuContext = useMemo(() => {
    const self: MenuContext = {
      setScreen,
      setCursor,
      character,
      hasResume: !!onResume,
      hasVault,
      onResume,
      onStart,
      onNewGame,
      onLoadGame,
      onHowToPlay,
      difficulty,
      setDifficulty,
      warp,
      setWarp,
      botView,
      setBotView,
      botLevel,
      setBotLevel,
      bumpSettings,
      captureBind,
      setCaptureBind,
      // Filled in below: it has to be able to ask ANOTHER screen to lay itself
      // out, which means calling `buildMenu` with this very context.
      rowIndexIn: () => 0,
      hasFinePointer,
      hasTouch,
      canBuzz,
      canQuit,
      onQuit: quitApp,
      setNotice: setTransferNotice,
      transferOpen,
      roster,
      exportPicks,
      toggleExportPick,
      exportPicked,
      pickImport,
      beginExportPicker,
      runSeed,
      prompt: setPrompt,
      netOpen,
      net,
      modsOpen,
      mods,
      storeOpen,
      storePrices,
      storeBusy,
      storePackSku,
      setStorePackSku,
      storeHeroId,
      setStoreHeroId,
      storeAmount,
      setStoreAmount,
      runPurchase,
      runSend,
      cloudOpen,
      cloudState,
      runCloudSync,
    };
    // WHERE A ROW SITS ON ANOTHER SCREEN, asked of the tree by ID. Closed over
    // the context it belongs to, so a BACK row (and the close button of a
    // full-screen browser, which has no row of its own) can lay the parent out
    // exactly as the player would see it and count from there. Only ever called
    // from an event handler, never while a list is being built — which would
    // recurse.
    self.rowIndexIn = (target: MenuScreen, rowId: string) => {
      const at = buildMenu(target, self).findIndex(
        (row) => row.aria === rowAria(target, rowId),
      );
      return at < 0 ? 0 : at;
    };
    return self;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    character,
    onStart,
    onResume,
    onNewGame,
    onLoadGame,
    onHowToPlay,
    settingsTick,
    bumpSettings,
    captureBind,
    difficulty,
    warp,
    botView,
    botLevel,
    hasFinePointer,
    hasTouch,
    canBuzz,
    canQuit,
    transferOpen,
    roster,
    exportPicks,
    toggleExportPick,
    exportPicked,
    pickImport,
    beginExportPicker,
    runSeed,
    netOpen,
    net,
    modsOpen,
    mods,
    storeOpen,
    storePackSku,
    setStorePackSku,
    storeHeroId,
    setStoreHeroId,
    storeAmount,
    setStoreAmount,
    storePrices,
    storeBusy,
    runPurchase,
    runSend,
    cloudOpen,
    cloudState,
    runCloudSync,
  ]);

  // `settingsTick` is an intentional invalidation key: the menu reads the
  // non-React settings store through getSettings(), so bumping the tick after
  // updateSettings is what rebuilds this list with the fresh values. eslint
  // can't see that dependency through getSettings(), so it wrongly flags the
  // tick as unnecessary — keep it and silence the false positive.
  const entries: MenuEntry[] = useMemo(
    () => buildMenu(screen, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screen, ctx, settingsTick],
  );

  // Doom menus live on the keyboard: arrows move, Enter/Space picks,
  // Escape backs out.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A KEY BINDINGS rebind is listening: the next key IS the new bind, stored
      // by physical `code` so WASD stays WASD across layouts. Escape cancels
      // (it's the reserved menu-back key, never bindable); anything else is
      // taken and stolen off whatever action already held it (withBinding).
      if (captureBind) {
        event.preventDefault();
        if (event.key !== "Escape") {
          updateSettings({
            keybindings: withBinding(
              getSettings().keybindings,
              captureBind,
              event.code,
            ),
          });
          playUiSound(synth, "confirm");
        } else {
          playUiSound(synth, "back");
        }
        setCaptureBind(null);
        bumpSettings();
        return;
      }
      // The arsenal viewer, the achievements browser, the vault, the effects
      // gallery and the scores board run their own navigation (HighScoresBoard
      // reinterprets the arrows as its two axes); stay out of their way so the
      // keys don't also drive the hidden menu underneath. Every one of them is
      // a `surface:` in the tree, column-riding or not.
      if (screenDef(screen).surface !== undefined) return;
      const row = entries[cursor];
      const horizontal =
        event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (row?.slider && horizontal) {
        // On a slider row (BALANCE knobs, SOUND volumes) the horizontal arrows
        // steer the track instead of idling — up/down still walk the row list.
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "move");
        row.slider.nudge(event.key === "ArrowRight" ? 1 : -1);
      } else if (row?.toggle && horizontal) {
        // On an ON/OFF row the arrows set the switch directly (→ on, ← off);
        // `set` plays its own confirm cue.
        event.preventDefault();
        unlockAudio();
        row.toggle.set(event.key === "ArrowRight");
      } else if (row?.reorder && horizontal) {
        // On a MOD LOAD ORDER row the arrows MOVE it — ← earlier, → later — so
        // the one screen whose whole job is ranking uses the two keys that
        // already mean "sideways" everywhere else.
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "move");
        row.reorder.move(event.key === "ArrowRight" ? 1 : -1);
      } else if (row?.check && horizontal) {
        // On a multi-select row the arrows set the tick-box directly
        // (→ checked, ← empty); `set` plays its own confirm cue.
        event.preventDefault();
        unlockAudio();
        row.check.set(event.key === "ArrowRight");
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c + delta + entries.length) % entries.length);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        unlockAudio();
        if (entries[cursor]) playMenuHaptic();
        entries[cursor]?.action();
      } else if (event.key === "Escape" && screen !== "main") {
        unlockAudio();
        playUiSound(synth, "back");
        // The warp picker walks developer → difficulty → levels; Escape backs
        // out one rung at a time, leaving warp mode only once it returns to the
        // developer menu (from the warp difficulty picker).
        if (screen === "difficulty" && warp) {
          setWarp(false);
          setBotView(false);
          setBotLevel(null);
        }
        // Escape is the BACK row without the pointer, so it reads the SAME
        // parent out of the tree rather than a second table beside it — the old
        // one had drifted, and Escape from three of the settings pages walked
        // the player out to the front door instead of up one screen. The warp
        // pickers are the one exception the tree cannot carry: they are a mode,
        // and back out to the DEVELOPER menu that armed them.
        const parent =
          __DEV_TOOLS__ && warp && screen === "difficulty"
            ? "developer"
            : (parentOf(screen) ?? "main");
        setScreen(parent);
        setCursor(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, cursor, screen, captureBind, warp, bumpSettings]);

  // While a KEY BINDINGS row is armed, a mouse button or wheel notch can be
  // bound too. The LEFT button (0) is left alone — it's how the menu is
  // clicked, and in-game it steers — so only the middle/right/side buttons and
  // the wheel are captured here (the row's own click already armed capture, so
  // its mouseup is spent before this listener mounts).
  useEffect(() => {
    if (!captureBind) return;
    const commit = (code: string) => {
      updateSettings({
        keybindings: withBinding(getSettings().keybindings, captureBind, code),
      });
      playUiSound(synth, "confirm");
      setCaptureBind(null);
      bumpSettings();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) return; // left click drives the menu itself
      event.preventDefault();
      commit(mouseButtonCode(event.button));
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      commit(wheelCode(event.deltaY));
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [captureBind, bumpSettings]);

  const levelsOverflow = useMenuOverflow(
    contentRef,
    menuRef,
    tallMenu,
    entries,
  );

  // Soften the scroll edges of both the menu column and — when a long ladder
  // caps and scrolls on its own — the inner row list, so rows fade in/out of
  // view instead of clipping in with a hard line. Re-measures on every screen
  // swap and cursor move (a keyboard step scrolls the highlighted row).
  useScrollFade(contentRef, [assets, screen, cursor, entries, levelsOverflow]);
  useScrollFade(menuRef, [assets, screen, cursor, entries, levelsOverflow]);

  if (!assets) {
    return <LoadingScreen />;
  }
  const font = assets.font;
  const cursorSprite = spriteDataUrl(assets.sprites, "wisp_0") ?? "";
  // The menu's mouse pointer: a 16-bit Mickey glove, hotspot on the fingertip.
  // Fed to the whole screen through the --menu-cursor CSS var (see styles.css).
  const menuCursor = spriteCursor(assets.sprites, "glove", {
    hotX: 3.5,
    hotY: 0.5,
    fallback: "default",
  });
  // The full-screen browsers (achievements, arsenal, the vault, the effects
  // gallery) own the whole display: don't paint the logo/menu underneath — it
  // bled through their backdrop. The high-score board is a surface too, but it
  // rides IN the column, so only `full` counts here.
  const browserOpen = screenDef(screen).surface === "full";
  // The COIN STORE screens swap the plain starfield for their own treasure
  // backdrop (raining coins + a golden glow) and tint the root warm — see
  // StoreBackdrop and the `.store-screen` styles.
  const onStore =
    screen === "store" ||
    screen === "storeconfirm" ||
    screen === "storehero" ||
    screen === "storesend";
  // Sub-screens drop the tagline and shrink the logo — and dim it (see
  // `.title-header.sub`): off the main menu the brand is a quiet mark holding
  // the top of the column, and the PAGE TITLE is what leads the screen.
  const onMain = screen === "main";
  const headerScale = onMain ? logoScale : compact ? 3 : 4;
  const heading = headingFor(screen, warp);
  // The SETTINGS tree renders as a stable form: a fixed-width column (so a
  // value change never shifts the right-aligned controls) with each row's help
  // text hoisted OUT of the row to a single bottom help line (so toggling a
  // setting can't reflow the row height or push the rows below it). The rest of
  // the menus stay content-width with an inline per-row blurb. `settings`
  // itself is the tree's entry menu (a list of destinations, like the main
  // menu), so it keeps inline blurbs.
  const useHelpLine = SETTINGS_TREE.has(screen);
  // The focused row's help text — shown in the bottom help line when the
  // settings tree hoists blurbs out of the rows.
  const helpText = useHelpLine ? (entries[cursor]?.blurb ?? "") : "";
  // The screens that surface the import/export/store result line under the
  // menu: SETTINGS » DATA, the EXPORT CHARACTER picker, the DEVELOPER
  // grant/seed rows, the MODS screen, and the COIN VAULT (purchase results).
  // The tree's `notice:` says which, so a screen that starts reporting
  // something says so where the rest of its shape is written down.
  const noticeOpen = screenDef(screen).notice === true;

  return (
    <div
      className={`title-screen orbits${skyTest ? " sky-test" : ""}${onStore ? " store-screen" : ""}${sunBlast ? " sun-blast" : ""}`}
      onPointerDown={unlockAudio}
      style={{ "--menu-cursor": menuCursor } as CSSProperties}
    >
      <TitleBackdrop
        armed={devArmed}
        onCharged={onSunCharged}
        detonate={sunBlast}
        onDetonated={onSunBlastDone}
      />

      {/* A sub-screen reads a lot more text than the main menu does, and the
          sky drives planets and the sun straight through the middle of the
          column — a row's label used to sit ON the sun. This lays a soft dark
          wash over the sky (and only the sky: it sits under .title-content and
          eats no pointer events, so the hidden sun gesture still hit-tests
          normally) so the header and rows always have something quiet behind
          them. The main menu keeps its clean hero sky. */}
      {!onMain && !browserOpen && !skyTest && (
        <div className="title-plate" aria-hidden="true" />
      )}

      {/* The store's own raining-coin backdrop, over the dimmed sky — a
          celebratory burst pours on each successful purchase (storeCelebrate),
          and the BUY confirmation screen thickens the rain. */}
      {onStore && (
        <StoreBackdrop
          celebrate={storeCelebrate}
          intense={screen === "storeconfirm"}
        />
      )}

      {!browserOpen && !skyTest && (
        <div className="title-content" ref={contentRef}>
          {/* Brand mark + page header as ONE block, so the column's generous
              gap falls between the header and the rows rather than splitting
              the logo off from the title it belongs to. */}
          <div className={`title-header${onMain ? "" : " sub"}`}>
            <header className="title-logo">
              <h1 className="visually-hidden">{brandTitle}</h1>
              <PixelText
                font={font}
                text={brandTitle.toUpperCase()}
                scale={headerScale}
                color="#7ef0c8"
              />
              {onMain && (
                <PixelText
                  font={font}
                  text={brandTagline.toUpperCase()}
                  scale={2}
                  color="#9aa3ad"
                />
              )}
            </header>

            {heading && (
              <MenuHeading
                font={font}
                heading={heading}
                compact={compact}
                viewportWidth={viewportWidth}
                uiScale={uiScale}
              />
            )}
          </div>

          {screen === "scores" && (
            <HighScoresBoard
              font={font}
              difficulty={scoreDifficulty}
              setDifficulty={setScoreDifficulty}
              metric={scoreMetric}
              setMetric={setScoreMetric}
              detail={scoreDetail}
              setDetail={setScoreDetail}
              onBack={() => {
                // Land back on the HIGH SCORES row of the EXTRAS shelf.
                setScreen("extras");
                setCursor(ctx.rowIndexIn("extras", "high-scores"));
              }}
            />
          )}

          {/* browserOpen (arsenal/achievements) never reaches here — the whole
              content column is skipped while a full-screen browser is up. */}
          {screen !== "scores" && (
            <MenuList
              font={font}
              sprites={assets.sprites}
              entries={entries}
              cursor={cursor}
              setCursor={setCursor}
              cursorSprite={cursorSprite}
              blurbMaxWidth={blurbMaxWidth}
              useHelpLine={useHelpLine}
              scrollable={tallMenu && levelsOverflow}
              menuRef={menuRef}
              selectedRowRef={selectedRowRef}
            />
          )}

          {/* The settings tree's single help line: the focused row's help text,
              hoisted out of the row so a value change never reflows the list.
              A fixed min-height reserves its space, so moving the cursor
              between rows (or an empty-help row) never shifts the layout. The
              `key` restarts a soft fade each time the text changes. */}
          {useHelpLine && (
            <p className="menu-help" role="status" aria-live="polite">
              {helpText && (
                <PixelText
                  key={helpText}
                  font={font}
                  text={helpText}
                  scale={2}
                  color="#9aa3ad"
                  maxWidth={helpMaxWidth}
                  // The slot is centered, so a wrapped tail centers under the
                  // line above it rather than hanging off to the left.
                  align="center"
                />
              )}
            </p>
          )}

          {/* The import/export result line, under the SETTINGS - DATA menu,
              the EXPORT CHARACTER picker, the DEVELOPER grant/seed rows, and
              the COIN STORE (purchase results). */}
          {noticeOpen && transferNotice && (
            <p
              className={`title-notice ${transferNotice.tone}`}
              role="status"
              aria-live="polite"
            >
              <PixelText
                font={font}
                text={transferNotice.text}
                scale={2}
                color={transferNotice.tone === "error" ? "#ff6d6d" : "#7ef0c8"}
                maxWidth={24}
              />
            </p>
          )}
        </div>
      )}

      {/* The one line of text the menu ever asks for — a session password, a
          port, an address to join. A modal over everything, because while it is
          up the arrow keys belong to the field rather than to the row list. */}
      {prompt && (
        <PixelPrompt
          font={font}
          spec={prompt}
          onClose={() => setPrompt(null)}
        />
      )}

      {/* The ACHIEVEMENTS browser: a full-screen overlay over the menu,
          mounted only while browsing (it owns its own keyboard navigation).
          Opening it acknowledges any unseen badges. */}
      {screen === "achievements" && (
        <Suspense fallback={null}>
          <AchievementsScreen
            font={font}
            sprites={assets.sprites}
            onClose={() => {
              setScreen("extras");
              setCursor(ctx.rowIndexIn("extras", "achievements"));
            }}
          />
        </Suspense>
      )}

      {/* The LOST & FOUND: buy back what the AUTO PILOT threw away. Like the
          arsenal, a full-screen overlay that owns its own keyboard steering. */}
      {screen === "vault" && character && (
        <Suspense fallback={<LoadingScreen />}>
          <VaultScreen
            font={font}
            relicFonts={assets.relicFonts}
            sprites={assets.sprites}
            character={character}
            onChange={onCharacterChange}
            onClose={() => {
              setScreen("extras");
              setCursor(ctx.rowIndexIn("extras", "lost-found"));
            }}
          />
        </Suspense>
      )}

      {/* The developer ARSENAL viewer: a full-screen overlay over the menu,
          mounted only while browsing (it owns its own keyboard navigation).
          Gated on __DEV_TOOLS__ so a production store build drops the lazy
          chunk along with the menu row that opens it. */}
      {__DEV_TOOLS__ && screen === "arsenal" && (
        <Suspense fallback={<LoadingScreen />}>
          <ArsenalScreen
            font={font}
            relicFonts={assets.relicFonts}
            sprites={assets.sprites}
            onClose={() => {
              setScreen("developer");
              setCursor(ctx.rowIndexIn("developer", "arsenal"));
            }}
          />
        </Suspense>
      )}

      {/* The developer EFFECTS GALLERY: every visual effect staged as a real
          fullscreen game and browsed like a photo roll. Owns its own keyboard
          steering (arrows / Enter / H / ESC). Gated like the arsenal above. */}
      {__DEV_TOOLS__ && screen === "effects" && (
        <Suspense fallback={<LoadingScreen />}>
          <EffectsGallery
            onClose={() => {
              setScreen("developer");
              setCursor(ctx.rowIndexIn("developer", "effects"));
            }}
          />
        </Suspense>
      )}

      {!browserOpen && !skyTest && (
        <footer className="title-footer">
          <PixelText
            font={font}
            // The build's commit rides beside the version everywhere the
            // developer tooling ships — web, PWA, preview/branch slots, local
            // builds, TestFlight. The production store build prints the bare
            // version (the hash isn't embedded there at all).
            text={
              __DEV_TOOLS__
                ? `v${__APP_VERSION__} · ${__BUILD_COMMIT__}`
                : `v${__APP_VERSION__}`
            }
            scale={2}
            color="#7a8088"
          />
        </footer>
      )}
    </div>
  );
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style splash / main menu: a starfield, the big title, and a
// keyboard-and-pointer menu — NEW GAME leads to the difficulty ladder, and
// picking a difficulty starts the run. The screen is the ORCHESTRATOR of the
// title-screen/ modules: the per-screen rows come from buildMenu (the
// menus-*.ts builders), the sky and the moon Easter egg from TitleBackdrop,
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

import type { Difficulty } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import { useScrollFade } from "@ui/lib/scroll-fade.ts";

import { IDENTITY } from "../identity.ts";
import { canVibrate } from "../app/platform.ts";

import { ArsenalScreen } from "./ArsenalScreen.tsx";
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
import {
  mouseButtonCode,
  wheelCode,
  withBinding,
  type BindableAction,
} from "./keybindings.ts";
import { getSettings, updateSettings } from "./settings.ts";
import { playUiSound } from "./sfx/index.ts";
import { HighScoresBoard } from "./title-screen/HighScoresBoard.tsx";
import { MenuList } from "./title-screen/MenuList.tsx";
import { StoreBackdrop } from "./title-screen/StoreBackdrop.tsx";
import { TitleBackdrop } from "./title-screen/TitleBackdrop.tsx";
import {
  SETTINGS_TREE,
  unlockAudio,
  type MenuContext,
  type MenuEntry,
  type MenuScreen,
  type TitleNotice,
} from "./title-screen/menu-model.ts";
import { buildMenu, screenHeading } from "./title-screen/menus.ts";
import { furthestUnlockedDifficulty } from "./title-screen/menus-campaign.ts";
import { useCharacterTransfer } from "./title-screen/use-character-transfer.ts";
import { useCoinStore } from "./title-screen/use-coin-store.ts";
import {
  useMenuOverflow,
  useViewportFlags,
} from "./title-screen/use-title-layout.ts";

// Lazy for the SEO critical-path budget: the browser is a menu destination,
// not startup code (see the GameScreen twin of this note).
const AchievementsScreen = lazy(() =>
  import("./AchievementsScreen.tsx").then((m) => ({
    default: m.AchievementsScreen,
  })),
);

export function TitleScreen({
  character,
  onStart,
  onResume,
  onNewGame,
  onLoadGame,
  onHowToPlay,
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
  /** Mount straight on the difficulty ladder (set when returning from the
   * roster via PLAY) instead of the main menu. */
  startOnDifficulty?: boolean;
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
  // KEY BINDINGS only make sense where there's a physical keyboard to rebind,
  // so the row is desktop-only: any device with a fine pointer (a mouse or
  // trackpad, which travels with a keyboard) shows it; touch-only phones and
  // tablets don't. A device characteristic, so it's read once at mount.
  const hasFinePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: fine)").matches;
  // The VIBRATION row is offered only where a buzz can actually land: a
  // touch-primary device whose browser has the Vibration API (Android in a
  // browser or an installed PWA), or the native app (Taptic bridge). Desktop
  // (API present but no motor) and all of iOS (no API) would show a dead
  // switch, so it's hidden there (see native/platform.ts `canVibrate`). A device
  // characteristic, so it's read once at mount alongside the pointer probe.
  const canBuzz = canVibrate();

  const logoScale = compact ? 7 : wide ? 10 : 6;

  // The row the selection cursor is on, so cursor moves can keep it in view.
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
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
  // level ladder and the developer BALANCE knobs — share the measure-then-cap
  // treatment (see useMenuOverflow).
  const tallMenu =
    screen === "levels" || screen === "balance" || screen === "seed";
  // Settings live in a plain singleton; mirror a tick so labels re-render.
  const [settingsTick, setSettingsTick] = useState(0);
  const bumpSettings = useCallback(() => setSettingsTick((t) => t + 1), []);

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

  const entries: MenuEntry[] = useMemo(() => {
    const ctx: MenuContext = {
      setScreen,
      setCursor,
      character,
      hasResume: !!onResume,
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
      hasFinePointer,
      canBuzz,
      setNotice: setTransferNotice,
      roster,
      exportPicks,
      toggleExportPick,
      exportPicked,
      pickImport,
      beginExportPicker,
      runSeed,
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
    };
    return buildMenu(screen, ctx);
    // `settingsTick` is an intentional invalidation key: the menu reads the
    // non-React settings store through getSettings(), so bumping the tick after
    // updateSettings is what rebuilds this list with the fresh values. eslint
    // can't see that dependency through getSettings(), so it wrongly flags the
    // tick as unnecessary — keep it and silence the false positive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    screen,
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
    canBuzz,
    roster,
    exportPicks,
    toggleExportPick,
    exportPicked,
    pickImport,
    beginExportPicker,
    runSeed,
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
  ]);

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
      // The arsenal viewer, the achievements browser, and the scores board
      // run their own navigation (HighScoresBoard reinterprets the arrows as
      // its two axes); stay out of their way so the keys don't also drive the
      // hidden menu underneath.
      if (
        screen === "arsenal" ||
        screen === "achievements" ||
        screen === "scores"
      ) {
        return;
      }
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
        const back: Record<string, MenuScreen> = {
          play: "main",
          controls: "settings",
          keybindings: "controls",
          display: "settings",
          sound: "settings",
          data: "settings",
          export: "data",
          developer: "settings",
          balance: "developer",
          difficulty: warp ? "developer" : "main",
          levels: "difficulty",
          botspeed: "levels",
          store: "main",
          storeconfirm: "store",
          storehero: "store",
          storesend: "storehero",
        };
        setScreen(back[screen] ?? "main");
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
  // The full-screen browsers (achievements, arsenal) own the whole display:
  // don't paint the logo/menu underneath — it bled through their backdrop.
  const browserOpen = screen === "achievements" || screen === "arsenal";
  // The COIN STORE screens swap the plain starfield for their own treasure
  // backdrop (raining coins + a golden glow) and tint the root warm — see
  // StoreBackdrop and the `.store-screen` styles.
  const onStore =
    screen === "store" ||
    screen === "storeconfirm" ||
    screen === "storehero" ||
    screen === "storesend";
  // Sub-screens drop the tagline and shrink the logo: the heading + rows get
  // the room, and a tall menu no longer collides with the branding.
  const onMain = screen === "main";
  const headerScale = onMain ? logoScale : compact ? 4 : 6;
  const heading = screenHeading(screen, warp);
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
  // menu: SETTINGS - DATA, the EXPORT CHARACTER picker, the DEVELOPER
  // grant/seed rows, and the COIN STORE (purchase results).
  const noticeOpen =
    screen === "data" ||
    screen === "export" ||
    screen === "seed" ||
    screen === "developer" ||
    screen === "store" ||
    screen === "storeconfirm" ||
    screen === "storehero" ||
    screen === "storesend";

  return (
    <div
      className={`title-screen orbits${skyTest ? " sky-test" : ""}${onStore ? " store-screen" : ""}`}
      onPointerDown={unlockAudio}
      style={{ "--menu-cursor": menuCursor } as CSSProperties}
    >
      <TitleBackdrop onDeveloperUnlocked={bumpSettings} />

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
          <header className="title-logo">
            <h1 className="visually-hidden">{IDENTITY.title}</h1>
            <PixelText
              font={font}
              text={IDENTITY.title.toUpperCase()}
              scale={headerScale}
              color="#7ef0c8"
            />
            {onMain && (
              <PixelText
                font={font}
                text={IDENTITY.tagline.toUpperCase()}
                scale={2}
                color="#9aa3ad"
              />
            )}
          </header>

          {heading && (
            <PixelText
              font={font}
              text={heading.text}
              scale={2}
              color={heading.color}
            />
          )}

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
                setScreen("main");
                // Land back on the HIGH SCORES row.
                setCursor(onResume ? 2 : 1);
              }}
            />
          )}

          {/* browserOpen (arsenal/achievements) never reaches here — the whole
              content column is skipped while a full-screen browser is up. */}
          {screen !== "scores" && (
            <MenuList
              font={font}
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
                  maxWidth={wide ? 44 : 24}
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

      {/* The ACHIEVEMENTS browser: a full-screen overlay over the menu,
          mounted only while browsing (it owns its own keyboard navigation).
          Opening it acknowledges any unseen badges. */}
      {screen === "achievements" && (
        <Suspense fallback={null}>
          <AchievementsScreen
            font={font}
            sprites={assets.sprites}
            onClose={() => {
              setScreen("main");
              // Land back on the ACHIEVEMENTS row.
              setCursor(onResume ? 3 : 2);
            }}
          />
        </Suspense>
      )}

      {/* The developer ARSENAL viewer: a full-screen overlay over the menu,
          mounted only while browsing (it owns its own keyboard navigation). */}
      {screen === "arsenal" && (
        <ArsenalScreen
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          onClose={() => {
            setScreen("developer");
            // Land back on VIEW ARSENAL — the second developer row.
            setCursor(1);
          }}
        />
      )}

      {!browserOpen && !skyTest && (
        <footer className="title-footer">
          <PixelText
            font={font}
            text={`v${__APP_VERSION__} · ${__BUILD_COMMIT__}`}
            scale={1}
            color="#7a8088"
          />
        </footer>
      )}
    </div>
  );
}
